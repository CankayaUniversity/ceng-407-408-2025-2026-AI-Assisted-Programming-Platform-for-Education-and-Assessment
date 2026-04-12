import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { generateRubric } from "../services/rubricService";
import { rubricSaveSchema } from "../lib/schemas";

const router = Router();
router.use(requireAuth);

// ── GET /api/rubrics/:problemId ───────────────────────────────────────────────
// Returns existing rubric for a problem, or null if none exists.
router.get("/:problemId", async (req: Request, res: Response) => {
  const problemId = Number.parseInt(req.params.problemId, 10);
  if (Number.isNaN(problemId)) {
    res.status(400).json({ error: "Invalid problem ID" });
    return;
  }

  const rubric = await prisma.rubric.findFirst({ where: { problemId } });
  res.json({ success: true, data: rubric ?? null });
});

// ── POST /api/rubrics/:problemId/generate ────────────────────────────────────
// Teacher only — calls Ollama to generate a rubric for the given problem.
router.post(
  "/:problemId/generate",
  requireRole("teacher"),
  async (req: Request, res: Response) => {
    const problemId = Number.parseInt(req.params.problemId, 10);
    if (Number.isNaN(problemId)) {
      res.status(400).json({ error: "Invalid problem ID" });
      return;
    }

    const problem = await prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) {
      res.status(404).json({ error: "Problem not found" });
      return;
    }

    const result = await generateRubric(
      problem.title,
      problem.description,
      problem.language,
      problem.difficulty,
      problem.referenceSolution ?? null,
    );

    if (!result.success) {
      res.status(502).json({ success: false, error: result.error });
      return;
    }

    // Upsert: if a rubric already exists for this problem, update it; otherwise create.
    const existing = await prisma.rubric.findFirst({ where: { problemId } });
    const rubricData = {
      title: `${problem.title} — Rubric`,
      criteria: result.rubric.criteria as object,
      totalPoints: result.rubric.totalPoints,
      aiGenerated: true,
    };
    const rubric = existing
      ? await prisma.rubric.update({ where: { id: existing.id }, data: rubricData })
      : await prisma.rubric.create({ data: { problemId, ...rubricData } });

    res.json({
      success: true,
      data: {
        ...rubric,
        gradingNotes: result.rubric.gradingNotes,
        model: result.model,
      },
    });
  },
);

// ── PUT /api/rubrics/:problemId ───────────────────────────────────────────────
// Teacher saves (or overwrites) a rubric, e.g. after manual editing.
router.put(
  "/:problemId",
  requireRole("teacher"),
  async (req: Request, res: Response) => {
    const problemId = Number.parseInt(req.params.problemId, 10);
    if (Number.isNaN(problemId)) {
      res.status(400).json({ error: "Invalid problem ID" });
      return;
    }

    const parsed = rubricSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const { title, criteria } = parsed.data;
    const totalPoints = criteria.reduce((sum, c) => sum + c.maxScore, 0);

    const existing = await prisma.rubric.findFirst({ where: { problemId } });
    const rubricData = {
      title: title ?? "Rubric",
      criteria: criteria as object,
      totalPoints,
      aiGenerated: false,
    };
    const rubric = existing
      ? await prisma.rubric.update({ where: { id: existing.id }, data: rubricData })
      : await prisma.rubric.create({ data: { problemId, ...rubricData } });

    res.json({ success: true, data: rubric });
  },
);

// ── DELETE /api/rubrics/:problemId ───────────────────────────────────────────
router.delete(
  "/:problemId",
  requireRole("teacher"),
  async (req: Request, res: Response) => {
    const problemId = Number.parseInt(req.params.problemId, 10);
    if (Number.isNaN(problemId)) {
      res.status(400).json({ error: "Invalid problem ID" });
      return;
    }

    await prisma.rubric.deleteMany({ where: { problemId } });
    res.json({ success: true });
  },
);

export { router as rubricsRouter };
