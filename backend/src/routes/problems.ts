import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.use(requireAuth);

/** List problems for the assignment UI (title, summary fields; no solutions). */
router.get("/", async (_req, res) => {
  const problems = await prisma.problem.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      difficulty: true,
      language: true,
      languages: true,
      tags: true,
      createdAt: true,
    },
  });
  res.json({ data: problems });
});

/** Single problem: students see only public test cases; teachers see full grading data. */
router.get("/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid problem id" });
    return;
  }

  const problem = await prisma.problem.findUnique({
    where: { id },
    include: { testCases: { orderBy: { id: "asc" } } },
  });

  if (!problem) {
    res.status(404).json({ error: "Problem not found" });
    return;
  }

  const role = req.auth!.role;

  const base = {
    id: problem.id,
    title: problem.title,
    description: problem.description,
    starterCode: problem.starterCode,
    difficulty: problem.difficulty,
    language: problem.language,
    languages: problem.languages,
    tags: problem.tags,
    createdAt: problem.createdAt,
  };

  if (role === "teacher") {
    res.json({
      data: {
        ...base,
        referenceSolution: problem.referenceSolution,
        testCases: problem.testCases.map((tc) => ({
          id: tc.id,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isHidden: tc.isHidden,
        })),
      },
    });
    return;
  }

  const visible = problem.testCases.filter((tc) => !tc.isHidden);
  const hiddenCount = problem.testCases.length - visible.length;

  res.json({
    data: {
      ...base,
      testCases: visible.map((tc) => ({
        id: tc.id,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
      })),
      hiddenTestCaseCount: hiddenCount,
    },
  });
});

interface TestCaseInput {
  input: string;
  expectedOutput: string;
  isHidden?: boolean;
}

router.post("/", requireRole("teacher"), async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (!title || !description) {
    res.status(400).json({ error: "Title and description are required" });
    return;
  }

  const starterCode = typeof body.starterCode === "string" ? body.starterCode : null;
  const referenceSolution = typeof body.referenceSolution === "string" ? body.referenceSolution : null;
  const difficulty = typeof body.difficulty === "string" ? body.difficulty : null;
  const language = typeof body.language === "string" ? body.language : "javascript";
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [];
  const languages = Array.isArray(body.languages)
    ? (body.languages as unknown[]).filter((l): l is string => typeof l === "string")
    : [];
  const category = typeof body.category === "string" ? body.category : null;
  const testCases = Array.isArray(body.testCases) ? (body.testCases as TestCaseInput[]) : [];

  const problem = await prisma.problem.create({
    data: {
      title,
      description,
      starterCode,
      referenceSolution,
      difficulty,
      language,
      languages,
      tags,
      category,
      createdBy: { connect: { id: req.auth!.userId } },
      testCases: {
        create: testCases.map((tc) => ({
          input: String(tc.input ?? ""),
          expectedOutput: String(tc.expectedOutput ?? ""),
          isHidden: Boolean(tc.isHidden),
        })),
      },
    },
    include: { testCases: true },
  });

  res.status(201).json({ data: problem });
});

router.put("/:id", requireRole("teacher"), async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid problem id" });
    return;
  }

  const existing = await prisma.problem.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Problem not found" });
    return;
  }

  const body = req.body as Record<string, unknown>;

  const problem = await prisma.problem.update({
    where: { id },
    data: {
      ...(typeof body.title === "string" ? { title: body.title.trim() } : {}),
      ...(typeof body.description === "string" ? { description: body.description.trim() } : {}),
      ...(typeof body.starterCode === "string" ? { starterCode: body.starterCode } : {}),
      ...(typeof body.referenceSolution === "string" ? { referenceSolution: body.referenceSolution } : {}),
      ...(typeof body.difficulty === "string" ? { difficulty: body.difficulty } : {}),
      ...(typeof body.language === "string" ? { language: body.language } : {}),
      ...(Array.isArray(body.tags) ? { tags: body.tags.filter((t): t is string => typeof t === "string") } : {}),
      ...(Array.isArray(body.languages) ? { languages: (body.languages as unknown[]).filter((l): l is string => typeof l === "string") } : {}),
      ...(typeof body.category === "string" ? { category: body.category } : {}),
    },
  });

  if (Array.isArray(body.testCases)) {
    await prisma.testCase.deleteMany({ where: { problemId: id } });
    await prisma.testCase.createMany({
      data: (body.testCases as TestCaseInput[]).map((tc) => ({
        problemId: id,
        input: String(tc.input ?? ""),
        expectedOutput: String(tc.expectedOutput ?? ""),
        isHidden: Boolean(tc.isHidden),
      })),
    });
  }

  const updated = await prisma.problem.findUnique({
    where: { id },
    include: { testCases: { orderBy: { id: "asc" } } },
  });

  res.json({ data: updated });
});

router.delete("/:id", requireRole("teacher"), async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid problem id" });
    return;
  }

  const existing = await prisma.problem.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Problem not found" });
    return;
  }

  await prisma.testCase.deleteMany({ where: { problemId: id } });
  await prisma.problem.delete({ where: { id } });

  res.json({ data: { id, deleted: true } });
});

export { router as problemsRouter };
