import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { createAiInteractionAudit } from "../services/audit";
import { getMentorReply, type MentorRequestInput } from "../services/mentor";
import { applyPolicy } from "../services/policy";
import { validateMentorReply } from "../services/validator";

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

function buildMentorFallback(input: MentorRequestInput): string {
  const question = (input.studentQuestion ?? "").trim();
  const runStatus = (input.runStatus ?? "").trim().toLowerCase();

  if (runStatus === "idle") {
    return question
      ? `Soruna odaklanalim: "${question}". Once kisa bir test girdisiyle kodu calistir ve aldigin cikti/hatayi paylas; sonra adim adim duzeltelim.`
      : "Kodu once kisa bir test girdisiyle calistir. Cikti veya hata mesajini paylasirsan bir sonraki adimi birlikte netlestirebiliriz.";
  }

  if (question) {
    return `Soruna odaklanalim: "${question}". Tek bir adima odaklan: girdi, beklenen cikti ve mevcut ciktiyi karsilastir; fark olan ilk noktayi izole et.`;
  }

  return "Tek bir adima odaklanalim: girdi, beklenen cikti ve mevcut ciktiyi karsilastir; fark olan ilk noktayi izole et ve o parcayi duzelt.";
}

async function handleAiRequest(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>;
  const input = parseMentorBody(body);
  const problemId = parseProblemId(body);
  const submissionId =
    typeof body.submissionId === "number"
      ? body.submissionId
      : typeof body.submissionId === "string" && body.submissionId.trim() !== ""
        ? Number.parseInt(body.submissionId, 10)
        : undefined;
  const mode = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "practice";
  const startedAt = Date.now();

  const result = await getMentorReply(input);
  const fallbackUsed = !result.success;
  const mentorRaw = result.success ? result.mentorReply : buildMentorFallback(input);
  const mentorModel = result.success ? process.env.OLLAMA_MODEL ?? "ai-mentor" : "fallback-local";

  const validator = await validateMentorReply(mentorRaw);
  const policy = applyPolicy({
    mentorReply: mentorRaw,
    validator,
    studentQuestion: input.studentQuestion,
  });

  const problem =
    problemId !== undefined
      ? await prisma.problem.findUnique({ where: { id: problemId } })
      : null;

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
  }

  await createAiInteractionAudit({
    userId: req.auth!.userId,
    problemId: problem?.id ?? null,
    submissionId: submissionId ?? null,
    attemptId: linkedAttempt?.id ?? null,
    aiLogId,
    mentorRaw,
    validatorJson: validator,
    policyAction: policy.action,
    finalText: policy.finalText,
    mentorModel,
    validatorModel: VALIDATOR_MODEL,
    durationMs: Date.now() - startedAt,
  });

  res.json({
    success: true,
    mentorReply: policy.finalText,
    fallbackUsed,
    ...(result.success ? {} : { warning: "Mentor service unavailable, fallback reply used." }),
    validator,
    policyAction: policy.action,
  });
}

router.post("/chat", handleAiRequest);
router.post("/hint", handleAiRequest);

export { router as aiRouter };
export default router;