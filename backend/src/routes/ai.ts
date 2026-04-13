import { Router, type Request, type Response } from "express";
import { PolicyAction } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { getMentorReply, getMentorReplyStream, type MentorRequestInput } from "../services/mentor";
import { applyPolicyWithRetry } from "../services/policy";
import { validateMentorReply } from "../services/validator";
import { aiChatSchema } from "../lib/schemas";

const router = Router();

const PROMPT_VERSION = "mentor_v1";
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

  if (runStatus === "idle") {
    return question
      ? `Let's focus on your question: "${question}". Try running your code with a short test input first and share the output or error — then we can work through it step by step.`
      : "Try running your code with a short test input. Share the output or any error message and we can figure out the next step together.";
  }

  if (question) {
    return `Let's focus on: "${question}". Compare your input, expected output, and actual output — isolate the first point where they differ.`;
  }

  return "Let's take it one step at a time: compare your input, expected output, and actual output — isolate the first difference and fix that part first.";
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

async function handleAiRequest(req: Request, res: Response) {
  const parsed = aiChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }

  const examFlag = await prisma.systemFlag.findUnique({
    where: { key: "exam_mode_enabled" },
  });
  if (examFlag?.value === true) {
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
  const mentorStartedAt = Date.now();

  const result = await getMentorReply(input);
  const latencyMsMentor = Date.now() - mentorStartedAt;
  const fallbackUsed = !result.success;
  const mentorRaw = result.success ? result.mentorReply : buildMentorFallback(input);
  const mentorModel = result.success ? process.env.OLLAMA_MODEL ?? "ai-mentor" : "fallback-local";

  const validatorStartedAt = Date.now();
  const validator = await validateMentorReply(mentorRaw);
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

  let aiLogId: number | null = null;

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

    aiLogId = aiLog.id;

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
        validatorJson: validator as object,
        policyAction: toPolicyAction(policy.action),
        finalText: policy.finalText,
        rewriteCount: policy.rewriteCount,
        latencyMsMentor,
        latencyMsValidator: validator.source === "ai" ? latencyMsValidator : null,
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

// ── SSE streaming chat endpoint ───────────────────────────────────────────
router.post("/chat/stream", async (req: Request, res: Response) => {
  const parsed = aiChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }

  const examFlag = await prisma.systemFlag.findUnique({ where: { key: "exam_mode_enabled" } });
  if (examFlag?.value === true) {
    res.status(403).json({ error: "Exam mode is active. AI Mentor is currently disabled." });
    return;
  }

  // SSE headers — disable nginx/proxy buffering so tokens arrive immediately
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const body = req.body as Record<string, unknown>;
  const input = parseMentorBody(body);

  let fullText = "";
  let streamError = false;

  try {
    for await (const token of getMentorReplyStream(input)) {
      if (res.writableEnded) break;
      fullText += token;
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }
  } catch (err) {
    streamError = true;
    const fallback = buildMentorFallback(input);
    fullText = fallback;
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ token: fallback })}\n\n`);
    }
  }

  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }

  // Fire-and-forget: validate + log to DB (does not block the stream)
  if (!streamError && fullText.trim()) {
    const problemId = parseProblemId(body);
    const mode = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "practice";

    Promise.resolve().then(async () => {
      try {
        const validator = await validateMentorReply(fullText);
        const policy = await applyPolicyWithRetry({
          mentorReply: fullText,
          validator,
          studentQuestion: input.studentQuestion,
          originalInput: input,
        });

        const problem =
          problemId !== undefined
            ? await prisma.problem.findUnique({ where: { id: problemId } })
            : null;

        if (problem) {
          const linkedAttempt = await prisma.submissionAttempt.findFirst({
            where: { userId: req.auth!.userId, problemId: problem.id },
            orderBy: { createdAt: "desc" },
          });

          const aiLog = await prisma.aiLog.create({
            data: {
              userId: req.auth!.userId,
              problemId: problem.id,
              mode,
              promptVersion: PROMPT_VERSION,
              modelName: process.env.OLLAMA_MODEL ?? "ai-mentor",
              studentQuestion: input.studentQuestion ?? null,
              responseText: policy.finalText,
              requestPayload: body as object,
              responsePayload: { mentorRaw: fullText, validator, policyAction: policy.action, streamed: true },
            },
          });

          await prisma.aIInteractionAudit.create({
            data: {
              userId: req.auth!.userId,
              problemId: problem.id,
              attemptId: linkedAttempt?.id ?? null,
              mentorModel: process.env.OLLAMA_MODEL ?? "ai-mentor",
              validatorModel: VALIDATOR_MODEL,
              mentorRaw: fullText,
              validatorJson: validator as object,
              policyAction: toPolicyAction(policy.action),
              finalText: policy.finalText,
              rewriteCount: policy.rewriteCount,
              latencyMsMentor: 0,
              latencyMsValidator: null,
              errorCode: null,
            },
          });

          if (mode === "hint" || mode === "tip") {
            const lastHint = await prisma.hintEvent.findFirst({
              where: { userId: req.auth!.userId, problemId: problem.id },
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
});

router.post("/chat", handleAiRequest);
router.post("/hint", handleAiRequest);

export { router as aiRouter };
