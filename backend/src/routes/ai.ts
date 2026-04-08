import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { getMentorReplyWithPolicy } from "../services/policy";
import type { MentorRequestInput } from "../services/mentor";

const router = Router();

const PROMPT_VERSION = "mentor_v2_pipeline";

router.use(requireAuth);

function parseMentorBody(body: Record<string, unknown>): MentorRequestInput {
  return {
    problemDescription:
      typeof body.problemDescription === "string" ? body.problemDescription : null,
    assignmentText:
      typeof body.assignmentText === "string" ? body.assignmentText : null,
    studentCode:
      typeof body.studentCode === "string" ? body.studentCode : null,
    errorMessage:
      typeof body.errorMessage === "string" ? body.errorMessage : null,
    studentQuestion:
      typeof body.studentQuestion === "string" ? body.studentQuestion : null,
    runStatus:
      typeof body.runStatus === "string" ? body.runStatus : null,
    stdout:
      typeof body.stdout === "string" ? body.stdout : null,
    stderr:
      typeof body.stderr === "string" ? body.stderr : null,
    language:
      typeof body.language === "string" ? body.language : null,
    mode:
      typeof body.mode === "string" ? body.mode : null,
    hintLevel:
      typeof body.hintLevel === "number" ? body.hintLevel : null,
    history:
      Array.isArray(body.history)
        ? body.history.filter((v): v is string => typeof v === "string")
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

router.post("/chat", async (req: Request, res: Response) => {
  
  try {
    const body = req.body as Record<string, unknown>;
    const input = parseMentorBody(body);
    const problemId = parseProblemId(body);
    console.log("[AI INPUT]", {
      assignment: input.assignmentText,
      code: input.studentCode?.slice(0, 100),
      question: input.studentQuestion,
    });
    const result = await getMentorReplyWithPolicy(input);

    if (!result.success) {
      res.status(503).json({
        success: false,
        error: result.error,
        mentorReply: "",
      });
      return;
    }

    if (problemId !== undefined) {
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
            responsePayload: result.audit as unknown as object,
          },
        });
      }
    }

    res.json({
      success: true,
      mentorReply: result.mentorReply,
      audit: result.audit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    res.status(500).json({
      success: false,
      error: message,
      mentorReply: "",
    });
  }
});

export { router as aiRouter };
export default router;