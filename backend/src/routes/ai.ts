import { Router, type Request, type Response } from "express";
import { PolicyAction } from "@prisma/client";
import { assessMentorReply } from "../services/mentorQuality";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import {
  getMentorModelName,
  getMentorReply,
  getMentorReplyStream,
  type MentorRequestInput,
} from "../services/mentor";
import { detectMentorIntent } from "../services/mentorIntent";
import { applyPolicyWithRetry, validateMentorReplyWithQuality } from "../services/policy";
import { aiChatSchema } from "../lib/schemas";

const router = Router();

const PROMPT_VERSION = "mentor_v2";
const MAX_CONVERSATION_HISTORY_MESSAGES = 20;
// Default validator model is the small instruct model the platform ships with;
// never falls back to a model that is not part of the deployed Ollama stack.
const VALIDATOR_MODEL = process.env.OLLAMA_VALIDATOR_MODEL ?? process.env.OLLAMA_MODEL ?? "qwen2.5:3b-instruct";

router.use(requireAuth);

type StoredAiLogMessage = {
  studentQuestion: string | null;
  responseText: string | null;
};

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

  const rawActiveLine =
    typeof body.activeLineNumber === "number"
      ? body.activeLineNumber
      : typeof body.cursorLine === "number"
        ? body.cursorLine
        : typeof body.lineNumber === "number"
          ? body.lineNumber
          : null;

  const conversationHistory = Array.isArray(body.conversationHistory)
    ? body.conversationHistory
        .filter(
          (message): message is { role: "user" | "assistant"; content: string } =>
            typeof message === "object" &&
            message !== null &&
            ((message as { role?: unknown }).role === "user" ||
              (message as { role?: unknown }).role === "assistant") &&
            typeof (message as { content?: unknown }).content === "string",
        )
        .slice(-MAX_CONVERSATION_HISTORY_MESSAGES)
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
    mentorLocale: body.mentorLocale === "tr" ? "tr" : "en",
    modelOverride:
      process.env.ALLOW_AI_MODEL_OVERRIDE === "true" && typeof body.modelOverride === "string"
        ? body.modelOverride
        : null,
    activeFileName: typeof body.activeFileName === "string" ? body.activeFileName : null,
    activeLineNumber:
      typeof rawActiveLine === "number" && Number.isInteger(rawActiveLine) && rawActiveLine > 0
        ? rawActiveLine
        : null,
    selectedCodeContext:
      typeof body.selectedCodeContext === "string"
        ? body.selectedCodeContext
        : typeof body.codeContext === "string"
          ? body.codeContext
          : null,
    conversationHistory,
    mode: typeof body.mode === "string" ? body.mode : null,
    hintLevel: typeof body.hintLevel === "number" ? body.hintLevel : null,
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

function compactConversationHistory(
  messages: NonNullable<MentorRequestInput["conversationHistory"]>,
): NonNullable<MentorRequestInput["conversationHistory"]> {
  const seen = new Set<string>();
  const compacted: NonNullable<MentorRequestInput["conversationHistory"]> = [];

  for (const message of messages.slice().reverse()) {
    const content = message.content.trim();
    if (!content) continue;

    const key = `${message.role}:${content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    compacted.unshift({ role: message.role, content });
  }

  return compacted.slice(-MAX_CONVERSATION_HISTORY_MESSAGES);
}

async function enrichInputWithStoredHistory(
  input: MentorRequestInput,
  userId: number,
  problemId: number | undefined,
): Promise<MentorRequestInput> {
  const providedHistory = compactConversationHistory(input.conversationHistory ?? []);

  if (providedHistory.length > 0 || problemId === undefined) {
    input.conversationHistory = providedHistory;
    return input;
  }

  const logs: StoredAiLogMessage[] = await prisma.aiLog.findMany({
    where: { userId, problemId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 10,
    select: { studentQuestion: true, responseText: true },
  });

  const storedHistory = logs
    .slice()
    .reverse()
    .flatMap((log) => {
      const messages: NonNullable<MentorRequestInput["conversationHistory"]> = [];
      if (log.studentQuestion) messages.push({ role: "user", content: log.studentQuestion });
      if (log.responseText) messages.push({ role: "assistant", content: log.responseText });
      return messages;
    });

  input.conversationHistory = compactConversationHistory([
    ...storedHistory,
    ...(input.conversationHistory ?? []),
  ]);

  return input;
}

// ── Exam-mode guard (group-aware) ─────────────────────────────────────────────
// Supports both legacy boolean values and the new { enabled, groupIds } format.
async function isUserInExamMode(userId: number): Promise<boolean> {
  const flag = await prisma.systemFlag.findUnique({ where: { key: "exam_mode_enabled" } });
  if (!flag?.value) return false;

  const raw = flag.value as Record<string, unknown>;
  const enabled = Boolean(raw.enabled ?? raw); // supports legacy boolean value
  if (!enabled) return false;

  const groupIds = Array.isArray(raw.groupIds) ? (raw.groupIds as number[]) : [];
  if (groupIds.length === 0) return true; // no groups specified → applies to everyone

  const membership = await prisma.studentGroupMembership.findFirst({
    where: { userId, groupId: { in: groupIds } },
  });
  return membership !== null;
}

// ── Per-assignment AI guard ──────────────────────────────────────────────────
// Teachers can disable AI Mentor on an individual assignment via the
// Assignment.aiEnabled boolean. When the student is enrolled in any assignment
// for this problem with aiEnabled=false, refuse the mentor request.
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

function toPolicyAction(action: "allow" | "rewrite" | "block"): PolicyAction {
  if (action === "rewrite") return PolicyAction.rewrite;
  if (action === "block") return PolicyAction.block;
  return PolicyAction.allow;
}

function getRequestFlags(input: MentorRequestInput): string[] {
  const flags: string[] = [];
  if (detectMentorIntent(input.studentQuestion) === "solution") {
    flags.push("direct_solution_request");
  }
  return flags;
}


async function validateAndRepairMentorReply(input: MentorRequestInput, mentorRaw: string) {
  const startedAt = Date.now();

  const validator = await validateMentorReplyWithQuality(input, mentorRaw);

  const policy = await applyPolicyWithRetry({
    mentorReply: mentorRaw,
    validator,
    studentQuestion: input.studentQuestion,
    originalInput: input,
  });

  return {
    validator,
    policy,
    latencyMsValidator: Date.now() - startedAt,
    requestFlags: getRequestFlags(input),
  };
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
  const problemId = parseProblemId(body);

  // Per-assignment AI toggle: refuse when any enrollment for this problem has
  // aiEnabled=false. Teachers use this to disable AI on specific assignments
  // without flipping the global exam-mode flag.
  if (problemId !== undefined && await isAiDisabledForProblem(req.auth!.userId, problemId)) {
    res.status(403).json({
      success: false,
      error: "AI Mentor is disabled for this assignment.",
    });
    return;
  }

  const input = await enrichInputWithStoredHistory(
    parseMentorBody(body),
    req.auth!.userId,
    problemId,
  );
  const submissionId = parseSubmissionId(body);
  const mode = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "practice";

  const mentorStartedAt = Date.now();
  const result = await getMentorReply(input);
  const latencyMsMentor = Date.now() - mentorStartedAt;

  if (!result.success) {
    res.status(503).json({
      success: false,
      error: "Mentor service unavailable.",
      details: result.error,
    });
    return;
  }

  const mentorRaw = result.mentorReply;
  const mentorModel = getMentorModelName(input);
  const validation = await validateAndRepairMentorReply(input, mentorRaw);
  const finalText = validation.policy.finalText.trim() ? validation.policy.finalText : mentorRaw;

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
        submissionId: submissionId ?? null,
        mode,
        promptVersion: PROMPT_VERSION,
        modelName: mentorModel,
        studentQuestion: input.studentQuestion ?? null,
        responseText: finalText,
        requestPayload: body as object,
        responsePayload: {
          mentorRaw,
          mentorError: null,
          validator: validation.validator,
          finalValidator: validation.policy.finalValidator ?? null,
          policyAction: validation.policy.action,
          requestFlags: validation.requestFlags,
          fallbackUsed: false,
        },
      },
    });

    if (mode === "hint" || mode === "tip") {
      const lastHint = await prisma.hintEvent.findFirst({
        where: {
          userId: req.auth!.userId,
          problemId: pid,
        },
        orderBy: [{ sequence: "desc" }, { createdAt: "desc" }],
      });

      await prisma.hintEvent.create({
        data: {
          userId: req.auth!.userId,
          problemId: pid,
          attemptId: linkedAttempt?.id ?? null,
          aiLogId: aiLog.id,
          sequence: (lastHint?.sequence ?? 0) + 1,
          mode,
        },
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
        validatorJson: {
          initial: validation.validator,
          final: validation.policy.finalValidator ?? null,
          requestFlags: validation.requestFlags,
        },
        policyAction: toPolicyAction(validation.policy.action),
        finalText,
        rewriteCount: validation.policy.rewriteCount,
        latencyMsMentor,
        latencyMsValidator: validation.latencyMsValidator,
        errorCode: null,
      },
    });
  }

  res.json({
    success: true,
    mentorReply: finalText,
    fallbackUsed: false,
    validator: validation.validator,
    finalValidator: validation.policy.finalValidator ?? null,
    policyAction: validation.policy.action,
    rewriteCount: validation.policy.rewriteCount,
    requestFlags: validation.requestFlags,
  });
}

// ── SSE streaming chat endpoint ───────────────────────────────────────────
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

  const body = req.body as Record<string, unknown>;
  const problemId = parseProblemId(body);

  // Per-assignment AI toggle (same guard as /chat).
  if (problemId !== undefined && await isAiDisabledForProblem(req.auth!.userId, problemId)) {
    res.status(403).json({ error: "AI Mentor is disabled for this assignment." });
    return;
  }

  const input = await enrichInputWithStoredHistory(
    parseMentorBody(body),
    req.auth!.userId,
    problemId,
  );

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let mentorRaw = "";
  let finalText = "";
  let mentorError: string | null = null;
  let validation: Awaited<ReturnType<typeof validateAndRepairMentorReply>>;
  const isHint = (typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "") === "hint";
  const mentorStartedAt = Date.now();

  try {
    for await (const token of getMentorReplyStream(input)) {
      mentorRaw += token;
      // Hint mode: stop after the first complete sentence
      if (isHint && /[.?!]/.test(mentorRaw.trimEnd().slice(-1))) break;
    }
  } catch (err) {
    mentorError = err instanceof Error ? err.message : "mentor_stream_error";
    console.warn("[ai/stream] mentor stream failed:", mentorError);
    res.write(`event: error\ndata: ${JSON.stringify({ error: "Mentor service unavailable.", details: mentorError })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return;
  }

  const latencyMsMentor = Date.now() - mentorStartedAt;

  try {
    validation = await validateAndRepairMentorReply(input, mentorRaw);
    finalText = validation.policy.finalText.trim() ? validation.policy.finalText : mentorRaw;
  } catch (err) {
    const details = err instanceof Error ? err.message : "mentor_validation_error";
    console.warn("[ai/stream] mentor validation failed:", details);
    res.write(`event: error\ndata: ${JSON.stringify({ error: "Mentor validation failed.", details })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return;
  }

  const mode = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "practice";

  if (problemId !== undefined && finalText.trim()) {
    Promise.resolve().then(async () => {
      try {
        const problem = await prisma.problem.findUnique({ where: { id: problemId } });

        if (problem) {
          const linkedAttempt = await prisma.submissionAttempt.findFirst({
            where: {
              userId: req.auth!.userId,
              problemId: problem.id,
            },
            orderBy: { createdAt: "desc" },
          });

          const aiLog = await prisma.aiLog.create({
            data: {
              userId: req.auth!.userId,
              problemId: problem.id,
              mode,
              promptVersion: PROMPT_VERSION,
              modelName: getMentorModelName(input),
              studentQuestion: input.studentQuestion ?? null,
              responseText: finalText,
              requestPayload: body as object,
              responsePayload: {
                mentorRaw,
                validator: validation.validator,
                finalValidator: validation.policy.finalValidator ?? null,
                policyAction: validation.policy.action,
                requestFlags: validation.requestFlags,
                fallbackUsed: false,
                streamed: true,
              },
            },
          });

          await prisma.aIInteractionAudit.create({
            data: {
              userId: req.auth!.userId,
              problemId: problem.id,
              attemptId: linkedAttempt?.id ?? null,
              mentorModel: getMentorModelName(input),
              validatorModel: VALIDATOR_MODEL,
              mentorRaw,
              validatorJson: {
                initial: validation.validator,
                final: validation.policy.finalValidator ?? null,
                requestFlags: validation.requestFlags,
              },
              policyAction: toPolicyAction(validation.policy.action),
              finalText,
              rewriteCount: validation.policy.rewriteCount,
              latencyMsMentor,
              latencyMsValidator: validation.latencyMsValidator,
              errorCode: null,
            },
          });

          if (mode === "hint" || mode === "tip") {
            const lastHint = await prisma.hintEvent.findFirst({
              where: {
                userId: req.auth!.userId,
                problemId: problem.id,
              },
              orderBy: [{ sequence: "desc" }, { createdAt: "desc" }],
            });

            await prisma.hintEvent.create({
              data: {
                userId: req.auth!.userId,
                problemId: problem.id,
                attemptId: linkedAttempt?.id ?? null,
                aiLogId: aiLog.id,
                sequence: (lastHint?.sequence ?? 0) + 1,
                mode,
              },
            });
          }
        }
      } catch (logErr) {
        console.error("[ai/stream] background log error:", logErr);
      }
    });
  }

  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify({ token: finalText })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }

});

router.post("/chat", handleAiRequest);
router.post("/hint", handleAiRequest);

export { router as aiRouter };
