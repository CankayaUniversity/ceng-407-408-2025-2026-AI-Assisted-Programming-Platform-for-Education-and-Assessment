import { Router, type Request, type Response } from "express";
import { PolicyAction } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import {
  getMentorModelName,
  getMentorReply,
  getMentorReplyStream,
  repairMentorReplyLanguage,
  type MentorRequestInput,
} from "../services/mentor";
import { aiChatSchema } from "../lib/schemas";

const router = Router();

const PROMPT_VERSION = "mentor_v2";
const MAX_CONVERSATION_HISTORY_MESSAGES = 20;

router.use(requireAuth);

type StoredAiLogMessage = {
  studentQuestion: string | null;
  responseText: string | null;
};

function parseLspDiagnostics(
  value: unknown,
): NonNullable<MentorRequestInput["lspDiagnostics"]> | null {
  if (!Array.isArray(value)) return null;

  return value
    .filter(
      (diagnostic): diagnostic is Record<string, unknown> =>
        typeof diagnostic === "object" &&
        diagnostic !== null &&
        typeof (diagnostic as { message?: unknown }).message === "string",
    )
    .map((diagnostic) => ({
      message: diagnostic.message as string,
      severity: typeof diagnostic.severity === "string" ? diagnostic.severity : null,
      line:
        typeof diagnostic.line === "number" &&
        Number.isInteger(diagnostic.line) &&
        diagnostic.line > 0
          ? diagnostic.line
          : null,
      source: typeof diagnostic.source === "string" ? diagnostic.source : null,
    }));
}

function parseRelatedFiles(
  value: unknown,
): NonNullable<MentorRequestInput["relatedFiles"]> | null {
  if (!Array.isArray(value)) return null;

  return value
    .filter(
      (file): file is Record<string, unknown> =>
        typeof file === "object" &&
        file !== null &&
        typeof (file as { path?: unknown }).path === "string" &&
        typeof (file as { content?: unknown }).content === "string",
    )
    .map((file) => ({
      path: file.path as string,
      content: file.content as string,
    }));
}

function parseVisibleTestCases(
  value: unknown,
): NonNullable<NonNullable<MentorRequestInput["testResults"]>["visibleCases"]> | null {
  if (!Array.isArray(value)) return null;

  return value
    .filter(
      (testCase): testCase is Record<string, unknown> =>
        typeof testCase === "object" && testCase !== null,
    )
    .map((testCase) => ({
      input: typeof testCase.input === "string" ? testCase.input : null,
      expected: typeof testCase.expected === "string" ? testCase.expected : null,
      actual: typeof testCase.actual === "string" ? testCase.actual : null,
      passed: typeof testCase.passed === "boolean" ? testCase.passed : null,
    }));
}

function parseTestResults(value: unknown): MentorRequestInput["testResults"] {
  if (typeof value !== "object" || value === null) return null;

  const results = value as Record<string, unknown>;
  return {
    status: typeof results.status === "string" ? results.status : null,
    summary: typeof results.summary === "string" ? results.summary : null,
    visibleCases: parseVisibleTestCases(results.visibleCases),
  };
}

function parseRestrictedKeywords(
  value: unknown,
): NonNullable<MentorRequestInput["restrictedKeywords"]> | null {
  if (!Array.isArray(value)) return null;
  return value.filter((keyword): keyword is string => typeof keyword === "string");
}

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
    problemDifficulty:
      typeof body.problemDifficulty === "string"
        ? body.problemDifficulty
        : typeof body.difficulty === "string"
          ? body.difficulty
          : null,
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
    lspDiagnostics: parseLspDiagnostics(body.lspDiagnostics),
    relatedFiles: parseRelatedFiles(body.relatedFiles),
    testResults: parseTestResults(body.testResults),
    restrictedKeywords: parseRestrictedKeywords(body.restrictedKeywords),
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

  if (problemId !== undefined) {
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { difficulty: true, description: true },
    });

    if (problem) {
      input.problemDifficulty = input.problemDifficulty ?? problem.difficulty ?? null;
      if (!input.assignmentText && !input.problemDescription) {
        input.assignmentText = problem.description;
      }
    }
  }

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
  const languageRepair = await repairMentorReplyLanguage(input, mentorRaw);
  const finalText = languageRepair.text;
  const rewriteCount = 0;

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
          languageRepair,
          mentorError: null,
          fallbackUsed: false,
          rewriteCount,
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
        validatorModel: null,
        mentorRaw,
        policyAction: PolicyAction.allow,
        finalText,
        rewriteCount,
        latencyMsMentor,
        latencyMsValidator: null,
        errorCode: null,
      },
    });
  }

  res.json({
    success: true,
    mentorReply: finalText,
    mentorRaw,
    languageRepair,
    fallbackUsed: false,
    rewriteCount,
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

  const mode = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "practice";
  const languageRepair = await repairMentorReplyLanguage(input, mentorRaw);
  finalText = languageRepair.text;
  const rewriteCount = 0;

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
                languageRepair,
                fallbackUsed: false,
                rewriteCount,
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
              validatorModel: null,
              mentorRaw,
              policyAction: PolicyAction.allow,
              finalText,
              rewriteCount,
              latencyMsMentor,
              latencyMsValidator: null,
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
