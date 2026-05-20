import { Router, type Request, type Response } from "express";
import { PolicyAction } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import {
  getMentorModelName,
  getMentorReply,
  getMentorReplyStream,
  normalizeMentorLocale,
  streamMentorTokens,
  type MentorRequestInput,
} from "../services/mentor";
import { applyPolicyWithRetry } from "../services/policy";
import { validateMentorReply } from "../services/validator";
import { assessMentorReply } from "../services/mentorQuality";
import { detectMentorIntent } from "../services/mentorIntent";
import { aiChatSchema } from "../lib/schemas";

const router = Router();

const PROMPT_VERSION = "mentor_v3";
// Default to the small AI validator the ollama-init container pulls.
// Set to "validator-heuristic" via env to explicitly disable the second stage
// and run the heuristic checks alone (e.g. during incident response).
const VALIDATOR_MODEL = process.env.OLLAMA_VALIDATOR_MODEL ?? "qwen2.5:3b-instruct";

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

  // Editor context (Phase 2 adoption). Accept several legacy/aliased keys
  // for the cursor line so the frontend can evolve without breaking us.
  const rawActiveLine =
    typeof body.activeLineNumber === "number" ? body.activeLineNumber
    : typeof body.cursorLine === "number"     ? body.cursorLine
    : typeof body.lineNumber === "number"     ? body.lineNumber
    : null;

  const selectedCodeContext =
    typeof body.selectedCodeContext === "string" ? body.selectedCodeContext
    : typeof body.codeContext === "string"        ? body.codeContext
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
          .slice(-20) // keep the most recent 20 entries = last 10 full turns
      : null,

    // ── Editor context ──────────────────────────────────────────────────────
    activeFileName:   typeof body.activeFileName === "string" ? body.activeFileName : null,
    activeLineNumber:
      typeof rawActiveLine === "number"
        && Number.isInteger(rawActiveLine)
        && rawActiveLine > 0
        ? rawActiveLine
        : null,
    selectedCodeContext:
      typeof selectedCodeContext === "string"
        ? selectedCodeContext.slice(0, 4_000)
        : null,

    // ── Locale ──────────────────────────────────────────────────────────────
    mentorLocale: body.mentorLocale === "tr" ? "tr" : "en",
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
  // Pass assignment text + mode + questionMode so the validator (both stages)
  // can reason about leakage relative to the specific problem AND apply the
  // mode-aware heuristic rules (context_misuse, runtime_guess, length caps).
  return validateMentorReply({
    studentQuestion: input.studentQuestion ?? "",
    mentorReply,
    runStatus:       input.runStatus ?? "",
  });
}

// ── Quality fallback (Phase 1 — adopted from feature/ai) ──────────────────────
//
// When mentorQuality flags a reply (echo, repeats, ignored error/line, generic
// fallback), replace the text with a short, context-aware deflection rather
// than letting the bad reply through. Bilingual.
function qualityDeflection(input: MentorRequestInput): string {
  const locale = normalizeMentorLocale(input.mentorLocale);
  const intent = detectMentorIntent(input.studentQuestion ?? undefined);
  const hasErr = Boolean((input.stderr ?? input.errorMessage ?? "").trim());

  if (locale === "tr") {
    if (intent === "runtime" && hasErr) {
      return "Hata mesajının ilk satırını ve hatanın çıktığı satır numarasını paylaş; oradan başlayalım.";
    }
    if (intent === "meta") {
      return "Ben bir yapay zeka programlama mentoruyum. Kod, hata ve sonraki adım konularında yardımcı olabilirim.";
    }
    return "Sorunu daha net göster: kontrol etmemi istediğin satırı veya beklediğin sonuç ile aldığın sonuç arasındaki farkı söyle.";
  }

  if (intent === "runtime" && hasErr) {
    return "Share the first line of the error and the line number it points at — let's start from there.";
  }
  if (intent === "meta") {
    return "I'm an AI programming mentor. I can help with code, errors, and next steps — what's the specific thing you'd like guidance on?";
  }
  return "Show me the part more concretely — point at the exact line you want checked, or tell me what you expected vs. what you actually saw.";
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
  const mentorModel = result.success ? getMentorModelName(input) : "fallback-local";

  const validatorStartedAt = Date.now();
  const validator = await runValidator(input, mentorRaw);
  const latencyMsValidator = Date.now() - validatorStartedAt;

  const policy = await applyPolicyWithRetry({
    mentorReply: mentorRaw,
    validator,
    studentQuestion: input.studentQuestion,
    originalInput: input,
  });

  // Quality check — only meaningful when the validator allowed the reply.
  // If validator blocked, policy.finalText is already SAFE_HINT and there's
  // nothing to reassess.
  let qualityReasons: string[] = [];
  if (policy.action === "allow") {
    const quality = assessMentorReply({
      reply:               policy.finalText,
      studentQuestion:     input.studentQuestion ?? undefined,
      selectedCodeContext: input.selectedCodeContext ?? undefined,
      stderr:              input.stderr ?? undefined,
      errorMessage:        input.errorMessage ?? undefined,
      conversationHistory: input.conversationHistory ?? undefined,
    });
    if (!quality.ok) {
      qualityReasons = quality.reasons;
      // Replace with locale-aware deflection. We deliberately do NOT call
      // the mentor a second time — that's the "rewrite produces worse
      // output" pattern the team previously rejected.
      policy.finalText = qualityDeflection(input);
    }
  }

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
          // Phase 1 — record which quality issues triggered the deflection
          // (empty array means the reply passed quality).
          qualityReasons,
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

  // ── Step 1: BUFFER the full model output before sending anything to the
  // client. Streaming raw tokens means students would see solutions appear
  // briefly on screen before the validator could redact them — unacceptable
  // for a mentor. We collect the full reply first, validate it, then stream
  // the APPROVED text word-by-word so the UX still feels alive.
  let rawText    = "";
  let modelError = false;
  const streamStartedAt = Date.now();

  try {
    for await (const chunk of streamMentorTokens(input)) {
      rawText += chunk;
      if (isHint && (input.hintLevel ?? 0) < 2) {
        const t = rawText.trimEnd();
        const openFence = (rawText.match(/```/g) ?? []).length % 2 === 1;
        if (!openFence && /[a-zA-Z0-9][.!?](\s|$)/.test(t.slice(-4))) break;
      }
    }
  } catch {
    modelError = true;
    rawText = buildMentorFallback(input);
  }

  if (!rawText.trim()) {
    rawText = buildMentorFallback(input);
  }

  // ── Step 2: validate + apply policy. The student has NOT seen anything
  // yet, so we can safely replace bad replies without any flicker.
  //
  //   block   → use the policy's safe alternative text.
  //   rewrite → run quality check; if the reply is also non-Socratic or
  //             contains a code block when not asked, use generic guidance.
  //             Otherwise let the original through.
  //   allow   → use as-is, but still run quality and replace with generic
  //             guidance on serious quality failures (unsolicited code,
  //             non-Socratic lecture, transcript artifact).
  let textToStream = rawText;
  let validator: Awaited<ReturnType<typeof runValidator>> | null = null;
  let policy:    Awaited<ReturnType<typeof applyPolicyWithRetry>> | null = null;
  let latencyMsValidator: number | null = null;
  let qualityReasons: string[] = [];

  try {
    const validatorStartedAt = Date.now();
    validator           = await runValidator(input, rawText);
    latencyMsValidator  = Date.now() - validatorStartedAt;

    // Decision policy for the streaming path:
    //
    //   block   → real safety violation (solution leak detected by heuristic
    //             or AI validator). Replace with the policy's safe text.
    //   rewrite → stylistic flag from the (often overcautious) AI validator.
    //             LOGGED for audit, IGNORED for UX — the student sees the
    //             actual mentor reply. Treating rewrite as a hard block was
    //             nuking perfectly good Socratic replies; the validator's
    //             3B model is too strict to be trusted as a kill switch.
    //   allow   → use as-is.
    //
    // Quality flags are also logged for analytics but never used to swap the
    // visible reply. The bubble-flicker from post-hoc replacement is worse
    // than letting the occasional borderline reply through.
    if (validator.decision === "block") {
      policy = await applyPolicyWithRetry({
        mentorReply:    rawText,
        validator,
        studentQuestion: input.studentQuestion,
        originalInput:  input,
      });
      textToStream = policy.finalText;
    } else {
      // allow OR rewrite — keep the mentor reply; just record quality flags.
      const quality = assessMentorReply({
        reply:               rawText,
        studentQuestion:     input.studentQuestion ?? undefined,
        selectedCodeContext: input.selectedCodeContext ?? undefined,
        stderr:              input.stderr ?? undefined,
        errorMessage:        input.errorMessage ?? undefined,
        conversationHistory: input.conversationHistory ?? undefined,
      });
      qualityReasons = quality.reasons;
      if (validator.decision === "rewrite") {
        console.log(
          "[ai/stream] validator returned rewrite; keeping streamed text. violations=",
          validator.violations,
        );
      }
    }
  } catch {
    // Validator pipeline crashed — fall back to the raw reply rather than
    // discarding it entirely. The mentor itself was probably fine.
  }

  // ── Step 3: stream the APPROVED text word-by-word for a natural feel.
  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const words = textToStream.split(" ");
  for (let i = 0; i < words.length; i++) {
    if (res.writableEnded) break;
    const chunk = (i === 0 ? "" : " ") + words[i];
    res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
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
            modelName:       getMentorModelName(input),
            studentQuestion: input.studentQuestion ?? null,
            responseText:    textToStream,
            requestPayload:  body as object,
            responsePayload: {
              mentorRaw:   rawText,
              validator,
              policyAction: policy?.action,
              streamed:     true,
              // Phase 1 — empty array means the reply passed the quality check.
              qualityReasons,
            },
          },
        });

        await prisma.aIInteractionAudit.create({
          data: {
            userId:           req.auth!.userId,
            problemId:        problem.id,
            attemptId:        linkedAttempt?.id ?? null,
            mentorModel:      getMentorModelName(input),
            validatorModel:   VALIDATOR_MODEL,
            mentorRaw:        rawText,
            validatorJson:    (validator ?? {}) as object,
            policyAction:     toPolicyAction(policy?.action ?? "allow"),
            finalText:        textToStream,
            rewriteCount:     policy?.rewriteCount ?? 0,
            latencyMsMentor:  Date.now() - streamStartedAt,
            // Total wall-clock for the validator pipeline (heuristic + AI).
            // Consistent with the non-stream path's measurement.
            // The AI-only latency is stored inside validatorJson as aiLatencyMs.
            latencyMsValidator,
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
