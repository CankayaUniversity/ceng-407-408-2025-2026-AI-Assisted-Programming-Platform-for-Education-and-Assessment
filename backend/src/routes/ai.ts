import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { getMentorReply, type MentorRequestInput } from "../services/mentor";

const router = Router();

const PROMPT_VERSION = "mentor_v1";

router.use(requireAuth);

function parseMentorBody(body: Record<string, unknown>): MentorRequestInput {
  return {
    problemDescription:
      typeof body.problemDescription === "string" ? body.problemDescription : null,
    assignmentText: typeof body.assignmentText === "string" ? body.assignmentText : null,
    studentCode: typeof body.studentCode === "string" ? body.studentCode : null,
    errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : null,
    studentQuestion: typeof body.studentQuestion === "string" ? body.studentQuestion : null,
    runStatus: typeof body.runStatus === "string" ? body.runStatus : null,
    stdout: typeof body.stdout === "string" ? body.stdout : null,
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

router.post("/chat", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const input = parseMentorBody(body);
  const problemId = parseProblemId(body);

  const result = await getMentorReply(input);

  if (result.success && problemId !== undefined) {
    const problem = await prisma.problem.findUnique({ where: { id: problemId } });
    if (problem) {
      await prisma.aiLog.create({
        data: {
          userId: req.auth!.userId,
          problemId,
          mode: "practice",
          promptVersion: PROMPT_VERSION,
          modelName: process.env.OLLAMA_MODEL ?? "ai-mentor",
          studentQuestion: input.studentQuestion ?? null,
          responseText: result.mentorReply,
          requestPayload: body as object,
        },
      });
    }
  }

  if (!result.success) {
    res.status(503).json({
      success: false,
      error: result.error,
      mentorReply: "",
    });
    return;
  }

  res.json({
    success: true,
    mentorReply: result.mentorReply,
  });
});

export { router as aiRouter };
