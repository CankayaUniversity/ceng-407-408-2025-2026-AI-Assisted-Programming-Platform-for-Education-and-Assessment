import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";

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

export { router as problemsRouter };
