import { Router, type Request, type Response } from "express";
import { PolicyAction } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { getMentorReply, getMentorReplyStream, looksLikeSolution, enforceIdleHint, type MentorRequestInput } from "../services/mentor";
import { applyPolicyWithRetry } from "../services/policy";
import { validateMentorReply } from "../services/validator";
import { aiChatSchema } from "../lib/schemas";

const router = Router();

const PROMPT_VERSION = "mentor_v3";
const VALIDATOR_MODEL = process.env.OLLAMA_VALIDATOR_MODEL ?? "validator-heuristic";

router.use(requireAuth);

function parseMentorBody(body: Record<string, unknown>): MentorRequestInput {
  const studentQuestion =
    typeof body.studentQuestion === "string"
      ? body.studentQuestion
      : typeof body.question === "string"
        ? body.question
        : null;

  const studentCode =
    typeof body.studentCode === "string"
      ? body.studentCode
      : typeof body.sourceCode === "string"
        ? body.sourceCode
        : typeof body.code === "string"
          ? body.code
          : null;

  const stdout =
    typeof body.stdout === "string"
      ? body.stdout
      : typeof body.output === "string"
        ? body.output
        : null;

  return {
    problemDescription:
      typeof body.problemDescription === "string" ? body.problemDescription : null,
    assignmentText: typeof body.assignmentText === "string" ? body.assignmentText : null,
    studentCode,
    errorMessage:
      typeof body.errorMessage === "string"
        ? body.errorMessage
        : typeof body.stderr === "string"
          ? body.stderr
          : null,
    studentQuestion,
    runStatus: typeof body.runStatus === "string" ? body.runStatus : null,
    stdout,
    stderr: typeof body.stderr === "string" ? body.stderr : null,
    language: typeof body.language === "string" ? body.language : null,
    mode: typeof body.mode === "string" ? body.mode : null,
    hintLevel: typeof body.hintLevel === "number" ? body.hintLevel : null,
    conversationHistory: Array.isArray(body.conversationHistory)
      ? (body.conversationHistory as Array<Record<string, unknown>>)
          .filter(
            (m) =>
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string" &&
              m.content.trim().length > 0,
          )
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: (m.content as string).slice(0, 2_000),
          }))
          .slice(0, 20) // max 20 entries = 10 full turns
      : null,
  };
}

function parseProblemId(body: Record<string, unknown>): number | undefined {
  const raw = body.problemId;

  if (typeof raw === "number" && Number.isInteger(raw)) {
    return raw;
  }

  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isNaN(n)) {
      return n;
    }
  }

  return undefined;
}

function parseSubmissionId(body: Record<string, unknown>): number | undefined {
  const raw = body.submissionId;

  if (typeof raw === "number" && Number.isInteger(raw)) {
    return raw;
  }

  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isNaN(n)) {
      return n;
    }
  }

  return undefined;
}

function buildMentorFallback(input: MentorRequestInput): string {
  const question = (input.studentQuestion ?? "").trim();
  const runStatus = (input.runStatus ?? "").trim().toLowerCase();

  if (question) {
    return `Let's focus on your question: "${question}". I won't give the full final solution, but I can help with the concept, the syntax, or the next step.`;
  }

  if (runStatus === "idle") {
    return "Show me the exact part you are stuck on. I can help with the concept or the next step without giving the full solution.";
  }

  return "Show me the exact part you are stuck on, and I can help with the concept or the next step.";
}

function toPolicyAction(action: string): PolicyAction {
  switch (action) {
    case "allow":
      return PolicyAction.allow;
    case "rewrite":
      return PolicyAction.rewrite;
    case "block":
      return PolicyAction.block;
    default:
      return PolicyAction.fallback_safe_hint;
  }
}

// ── Exam-mode guard (group-aware) ─────────────────────────────────────────────
async function isUserInExamMode(userId: number): Promise<boolean> {
  const flag = await prisma.systemFlag.findUnique({ where: { key: "exam_mode_enabled" } });
  if (!flag?.value) return false;

  const raw = flag.value as Record<string, unknown>;
  const enabled = Boolean(raw.enabled ?? raw);
  if (!enabled) return false;

  const groupIds = Array.isArray(raw.groupIds) ? (raw.groupIds as number[]) : [];
  if (groupIds.length === 0) return true;

  const membership = await prisma.studentGroupMembership.findFirst({
    where: { userId, groupId: { in: groupIds } },
  });
  return membership !== null;
}

// ── Bug #11: Check if AI is disabled for the student's active assignment ──────
async function isAiDisabledForProblem(userId: number, problemId: number): Promise<boolean> {
  const enrollment = await prisma.assignmentEnrollment.findFirst({
    where: {
      userId,
      assignment: {
        problemId,
        aiEnabled: false,
      },
    },
  });
  return enrollment !== null;
}

async function runValidator(input: MentorRequestInput, mentorReply: string) {
  return validateMentorReply({
    studentQuestion: input.studentQuestion ?? "",
    mentorReply,
    runStatus: input.runStatus ?? "",
  });
}

// ── HintEvent creation (Bug #4 fix: wrapped in transaction to prevent race) ───
async function createHintEvent(params: {
  userId:    number;
  problemId: number;
  attemptId: number | null;
  aiLogId:   number;
  mode:      string;
}) {
  await prisma.$transaction(async (tx) => {
    const lastHint = await tx.hintEvent.findFirst({
      where: { userId: params.userId, problemId: params.problemId },
      orderBy: [{ sequence: "desc" }, { createdAt: "desc" }],
    });

    await tx.hintEvent.create({
      data: {
        userId:    params.userId,
        problemId: params.problemId,
        attemptId: params.attemptId,
        aiLogId:   params.aiLogId,
        sequence:  (lastHint?.sequence ?? 0) + 1,
        mode:      params.mode,
      },
    });
  });
}

async function handleAiRequest(req: Request, res: Response) {
  const parsed = aiChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }

  if (await isUserInExamMode(req.auth!.userId)) {
    res.status(403).json({
      success: false,
      error: "Exam mode is active. AI Mentor is currently disabled.",
    });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const input = parseMentorBody(body);
  const problemId = parseProblemId(body);
  const submissionId = parseSubmissionId(body);
  const mode = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "practice";

  // Bug #11: block if student's assignment for this problem has aiEnabled = false
  if (problemId !== undefined) {
    if (await isAiDisabledForProblem(req.auth!.userId, problemId)) {
      res.status(403).json({
        success: false,
        error: "AI Mentor is disabled for this assignment.",
      });
      return;
    }
  }

  // Bug #5: warn when no problemId — can't create DB audit record without it
  if (problemId === undefined) {
    console.warn(
      "[ai/chat] no problemId — audit log will be skipped. userId=%d question=%s",
      req.auth!.userId,
      (input.studentQuestion ?? "").slice(0, 100),
    );
  }

  const mentorStartedAt = Date.now();
  const result = await getMentorReply(input);
  const latencyMsMentor = Date.now() - mentorStartedAt;

  const fallbackUsed = !result.success;
  const mentorRaw = result.success ? result.mentorReply : buildMentorFallback(input);
  const mentorModel = result.success ? process.env.OLLAMA_MODEL ?? "ai-mentor" : "fallback-local";

  const validatorStartedAt = Date.now();
  const validator = await runValidator(input, mentorRaw);
  const latencyMsValidator = Date.now() - validatorStartedAt;

  const policy = await applyPolicyWithRetry({
    mentorReply: mentorRaw,
    validator,
    studentQuestion: input.studentQuestion,
    originalInput: input,
  });

  const problem =
    problemId !== undefined ? await prisma.problem.findUnique({ where: { id: problemId } }) : null;

  const linkedAttempt =
    submissionId !== undefined
      ? await prisma.submissionAttempt.findFirst({
          where: {
            submissionId,
            userId: req.auth!.userId,
          },
          orderBy: { createdAt: "desc" },
        })
      : problemId !== undefined
        ? await prisma.submissionAttempt.findFirst({
            where: {
              userId: req.auth!.userId,
              problemId,
            },
            orderBy: { createdAt: "desc" },
          })
        : null;

  if (problem) {
    const pid = problem.id;

    const aiLog = await prisma.aiLog.create({
      data: {
        userId: req.auth!.userId,
        problemId: pid,
        // Bug #6 fix: submissionId was missing in the non-stream path too; ensure it's set
        submissionId: submissionId ?? null,
        mode,
        promptVersion: PROMPT_VERSION,
        modelName: mentorModel,
        studentQuestion: input.studentQuestion ?? null,
        responseText: policy.finalText,
        requestPayload: body as object,
        responsePayload: {
          mentorRaw,
          mentorError: result.success ? null : result.error,
          validator,
          policyAction: policy.action,
          fallbackUsed,
        },
      },
    });

    // Bug #4 fix: use transaction to prevent sequence race condition
    if (mode === "hint" || mode === "tip") {
      await createHintEvent({
        userId:    req.auth!.userId,
        problemId: pid,
        attemptId: linkedAttempt?.id ?? null,
        aiLogId:   aiLog.id,
        mode,
      });
    }

    await prisma.aIInteractionAudit.create({
      data: {
        userId: req.auth!.userId,
        problemId: pid,
        attemptId: linkedAttempt?.id ?? null,
        mentorModel,
        validatorModel: VALIDATOR_MODEL,
        mentorRaw,
        validatorJson: validator as object,
        policyAction: toPolicyAction(policy.action),
        finalText: policy.finalText,
        rewriteCount: policy.rewriteCount,
        latencyMsMentor,
        latencyMsValidator,
        errorCode: result.success ? null : (result.error ?? "mentor_error"),
      },
    });
  }

  res.json({
    success: true,
    mentorReply: policy.finalText,
    fallbackUsed,
    ...(result.success ? {} : { warning: "Mentor service unavailable, fallback reply used." }),
    validator,
    policyAction: policy.action,
  });
}

// ── SSE streaming chat endpoint ───────────────────────────────────────────────
// Bug #3 fix: buffer the full model output, run validator+policy BEFORE streaming
// any text to the student. This prevents unvalidated content from reaching users.
router.post("/chat/stream", async (req: Request, res: Response) => {
  const parsed = aiChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }

  if (await isUserInExamMode(req.auth!.userId)) {
    res.status(403).json({ error: "Exam mode is active. AI Mentor is currently disabled." });
    return;
  }

  const body        = req.body as Record<string, unknown>;
  const input       = parseMentorBody(body);
  const problemId   = parseProblemId(body);
  const submissionId = parseSubmissionId(body);   // Bug #6 fix: parse submissionId in stream path
  const mode        = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "practice";
  const isHint      = mode === "hint";

  // Bug #11: block if student's assignment for this problem has aiEnabled = false
  if (problemId !== undefined) {
    if (await isAiDisabledForProblem(req.auth!.userId, problemId)) {
      res.status(403).json({ error: "AI Mentor is disabled for this assignment." });
      return;
    }
  }

  // Bug #5: warn when no problemId
  if (problemId === undefined) {
    console.warn(
      "[ai/stream] no problemId — audit log will be skipped. userId=%d question=%s",
      req.auth!.userId,
      (input.studentQuestion ?? "").slice(0, 100),
    );
  }

  // ── Step 1: collect full model response (do NOT send to client yet) ──────────
  let rawText    = "";
  let modelError = false;
  const streamStartedAt = Date.now();

  try {
    for await (const token of getMentorReplyStream(input)) {
      rawText += token;

      // Bug #10 fix: stop hint after the first complete sentence.
      // Only apply for level 0 and 1 — level 2+ requires a full sentence PLUS
      // pseudocode, so cutting at the first sentence-end would drop the code block.
      if (isHint && (input.hintLevel ?? 0) < 2) {
        const t = rawText.trimEnd();
        // Require letter/digit before the punctuation and whitespace/end after
        // (guards against mid-expression dots like list.append)
        if (/[a-zA-Z0-9][.!?](\s|$)/.test(t.slice(-4))) break;
      }
    }
  } catch {
    modelError = true;
    rawText = buildMentorFallback(input);
  }

  if (!rawText.trim()) {
    rawText = buildMentorFallback(input);
  }

  // ── Step 2: mentor.ts post-processing (mirrors getMentorReply non-stream path) ─
  // Apply the same checks the non-stream path runs so both paths behave identically.
  if (!modelError) {
    // 2a. Inline solution-leak deflection (8-line single block / 2+ blocks / banned phrases)
    if (looksLikeSolution(rawText)) {
      rawText =
        "I can't write the complete solution, but I can point to the specific issue. " +
        "What part is giving you the most trouble right now — is it a logic error, a missing step, or something else?";
    }
    // 2b. Append "Run the code first" note when model asserts runtime results at idle
    rawText = enforceIdleHint(rawText, input.runStatus);
  }

  // ── Step 3: validate + apply policy ──────────────────────────────────────────
  let textToStream = rawText;
  let validator: Awaited<ReturnType<typeof runValidator>> | null = null;
  let policy:    Awaited<ReturnType<typeof applyPolicyWithRetry>> | null = null;

  try {
    validator = await runValidator(input, rawText);
    policy    = await applyPolicyWithRetry({
      mentorReply:    rawText,
      validator,
      studentQuestion: input.studentQuestion,
      originalInput:  input,
    });
    textToStream = policy.finalText;
  } catch {
    // If validation pipeline fails, use safe fallback
    textToStream = buildMentorFallback(input);
  }

  // ── Step 4: now open the SSE stream and send the validated text ───────────────
  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Word-by-word streaming for a natural UX feel
  const words = textToStream.split(" ");
  for (let i = 0; i < words.length; i++) {
    if (res.writableEnded) break;
    const chunk = (i === 0 ? "" : " ") + words[i];
    res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
    // ~15 ms per word ≈ comfortable reading pace without feeling sluggish
    await new Promise<void>((r) => setTimeout(r, 15));
  }

  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }

  // ── Step 5: persist audit logs (background, non-blocking) ────────────────────
  // Run even on model error so hint events and the audit trail are never lost.
  if (problemId !== undefined) {
    Promise.resolve().then(async () => {
      try {
        const problem = await prisma.problem.findUnique({ where: { id: problemId } });
        if (!problem) return;

        const linkedAttempt = await prisma.submissionAttempt.findFirst({
          where: { userId: req.auth!.userId, problemId: problem.id },
          orderBy: { createdAt: "desc" },
        });

        const aiLog = await prisma.aiLog.create({
          data: {
            userId:          req.auth!.userId,
            problemId:       problem.id,
            submissionId:    submissionId ?? null,   // Bug #6 fix
            mode,
            promptVersion:   PROMPT_VERSION,
            modelName:       process.env.OLLAMA_MODEL ?? "ai-mentor",
            studentQuestion: input.studentQuestion ?? null,
            responseText:    textToStream,
            requestPayload:  body as object,
            responsePayload: {
              mentorRaw:   rawText,
              validator,
              policyAction: policy?.action,
              streamed:     true,
            },
          },
        });

        await prisma.aIInteractionAudit.create({
          data: {
            userId:           req.auth!.userId,
            problemId:        problem.id,
            attemptId:        linkedAttempt?.id ?? null,
            mentorModel:      process.env.OLLAMA_MODEL ?? "ai-mentor",
            validatorModel:   VALIDATOR_MODEL,
            mentorRaw:        rawText,
            validatorJson:    (validator ?? {}) as object,
            policyAction:     toPolicyAction(policy?.action ?? "allow"),
            finalText:        textToStream,
            rewriteCount:     policy?.rewriteCount ?? 0,
            latencyMsMentor:  Date.now() - streamStartedAt,
            latencyMsValidator: null,
            errorCode:        null,
          },
        });

        // Bug #4 fix: transaction prevents sequence race condition
        if (mode === "hint" || mode === "tip") {
          await createHintEvent({
            userId:    req.auth!.userId,
            problemId: problem.id,
            attemptId: linkedAttempt?.id ?? null,
            aiLogId:   aiLog.id,
            mode,
          });
        }
      } catch (logErr) {
        console.error("[ai/stream] background log error:", logErr);
      }
    });
  }
});

router.post("/chat", handleAiRequest);
router.post("/hint", handleAiRequest);

export { router as aiRouter };
