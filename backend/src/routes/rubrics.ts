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
  if (!rubric) {
    res.json({ success: true, data: null });
    return;
  }

  // Normalize the stored `criteria` blob into a flat shape for the frontend.
  // The AI-generation route stores it wrapped as `{ items: [...], gradingNotes }`
  // (see POST /:problemId/generate below), but a teacher who later saves a
  // hand-edited rubric via PUT stores it as a bare array. Both shapes are
  // valid storage; the GET response always exposes:
  //   { ...rubric, criteria: <array>, gradingNotes: <string> }
  // so the frontend's `body.data.criteria.reduce(...)` never blows up.
  const raw = rubric.criteria as unknown;
  let criteriaArray: unknown[] = [];
  let gradingNotes = "";
  if (Array.isArray(raw)) {
    criteriaArray = raw;
  } else if (raw && typeof raw === "object") {
    const wrapped = raw as { items?: unknown; gradingNotes?: unknown };
    if (Array.isArray(wrapped.items)) criteriaArray = wrapped.items;
    if (typeof wrapped.gradingNotes === "string") gradingNotes = wrapped.gradingNotes;
  }

  res.json({
    success: true,
    data: { ...rubric, criteria: criteriaArray, gradingNotes },
  });
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

    // Pull the problem's test cases so the rubric criteria can be problem-
    // specific (e.g. "handles empty input, multi-space separators") rather
    // than generic ("handles all test cases"). Hidden tests are counted but
    // their inputs are withheld from the prompt — see formatTestCases().
    const tests = await prisma.testCase.findMany({
      where: { problemId },
      select: { input: true, expectedOutput: true, isHidden: true },
      orderBy: { id: "asc" },
    });

    const result = await generateRubric(
      problem.title,
      problem.description,
      problem.language,
      problem.difficulty,
      problem.referenceSolution ?? null,
      tests,
    );

    if (!result.success) {
      res.status(502).json({ success: false, error: result.error });
      return;
    }

    // Upsert: if a rubric already exists for this problem, update it; otherwise create.
    const existing = await prisma.rubric.findFirst({ where: { problemId } });

    // gradingNotes is stored alongside criteria in the JSON blob so it survives
    // subsequent GET requests without requiring a separate DB column.
    const rubricData = {
      title:       `${problem.title} — Rubric`,
      criteria:    { items: result.rubric.criteria, gradingNotes: result.rubric.gradingNotes } as object,
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
        // Expose criteria and gradingNotes as flat fields for the frontend
        criteria:    result.rubric.criteria,
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

    // Warn if the teacher submits a rubric that doesn't total 100 points.
    // We accept it but include a warning in the response so the UI can flag it.
    const pointsWarning =
      totalPoints !== 100
        ? `Rubric total is ${totalPoints} pts — consider adjusting criteria to sum to 100.`
        : null;

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

    res.json({ success: true, data: rubric, ...(pointsWarning ? { warning: pointsWarning } : {}) });
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
