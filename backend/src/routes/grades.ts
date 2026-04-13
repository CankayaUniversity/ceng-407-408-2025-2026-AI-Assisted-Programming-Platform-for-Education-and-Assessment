/**
 * Grades routes — teacher-only CRUD for grading student assignment submissions.
 *
 * GET  /api/grades/assignment/:assignmentId          — enrolled students + grades + latest submission
 * POST /api/grades/:assignmentId/:userId/suggest     — AI score suggestion
 * PUT  /api/grades/:assignmentId/:userId             — save / update grade
 * GET  /api/grades/:assignmentId/:userId             — get single grade
 */

import { Router, type Response } from "express";
import type { Request } from "express";
import { prisma }          from "../lib/prisma";
import { requireAuth }     from "../middleware/requireAuth";
import { requireRole }     from "../middleware/requireRole";
import { suggestScore }    from "../services/scoreSuggestionService";
import type { ExecutionContext } from "../services/scoreSuggestionService";
import type { RubricCriterion } from "../services/rubricService";

const router = Router();
router.use(requireAuth);
router.use(requireRole("teacher"));

function parseId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

// ── GET /api/grades/assignment/:assignmentId ──────────────────────────────────
// Returns list of enrolled students with their latest submission + existing grade.
router.get("/assignment/:assignmentId", async (req: Request, res: Response) => {
  const assignmentId = parseId(req.params.assignmentId);
  if (!assignmentId) { res.status(400).json({ error: "Invalid assignment ID" }); return; }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      problem:     { select: { id: true, title: true, language: true, description: true, referenceSolution: true } },
      enrollments: { include: { user: { select: { id: true, name: true, email: true } } } },
      grades:      true,
    },
  });

  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }

  // Fetch latest submission + attempt per enrolled student for this problem
  const userIds = assignment.enrollments.map((e) => e.userId);

  const [submissions, attempts] = await Promise.all([
    prisma.submission.findMany({
      where:   { problemId: assignment.problemId, userId: { in: userIds } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.submissionAttempt.findMany({
      where:   { problemId: assignment.problemId, userId: { in: userIds } },
      orderBy: { createdAt: "desc" },
      select: {
        userId: true, normalizedStatus: true,
        publicPassed: true, publicTotal: true,
        hiddenPassed: true, hiddenTotal: true,
        allPassed: true, executionTimeMs: true,
      },
    }),
  ]);

  // de-dup: keep only the latest per user
  const latestByUser = new Map<number, typeof submissions[0]>();
  for (const s of submissions) {
    if (!latestByUser.has(s.userId)) latestByUser.set(s.userId, s);
  }
  const latestAttemptByUser = new Map<number, typeof attempts[0]>();
  for (const a of attempts) {
    if (!latestAttemptByUser.has(a.userId)) latestAttemptByUser.set(a.userId, a);
  }

  const gradeByUser = new Map(assignment.grades.map((g) => [g.userId, g]));

  const students = assignment.enrollments.map((e) => ({
    user:       e.user,
    submission: latestByUser.get(e.userId)        ?? null,
    attempt:    latestAttemptByUser.get(e.userId) ?? null,
    grade:      gradeByUser.get(e.userId)         ?? null,
  }));

  // Fetch rubric if it exists
  const rubric = await prisma.rubric.findFirst({ where: { problemId: assignment.problemId } });

  res.json({
    success: true,
    data: {
      assignment: {
        id:          assignment.id,
        title:       assignment.title,
        description: assignment.description,
        dueDate:     assignment.dueDate,
        problem:     assignment.problem,
      },
      rubric:   rubric ?? null,
      students,
    },
  });
});

// ── GET /api/grades/:assignmentId/:userId ─────────────────────────────────────
router.get("/:assignmentId/:userId", async (req: Request, res: Response) => {
  const assignmentId = parseId(req.params.assignmentId);
  const userId       = parseId(req.params.userId);
  if (!assignmentId || !userId) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const grade = await prisma.grade.findUnique({
    where: { assignmentId_userId: { assignmentId, userId } },
  });

  res.json({ success: true, data: grade ?? null });
});

// ── POST /api/grades/:assignmentId/:userId/suggest ────────────────────────────
// AI scores the student's latest submission against the rubric.
router.post("/:assignmentId/:userId/suggest", async (req: Request, res: Response) => {
  const assignmentId = parseId(req.params.assignmentId);
  const userId       = parseId(req.params.userId);
  if (!assignmentId || !userId) { res.status(400).json({ error: "Invalid IDs" }); return; }

  // Load assignment + problem
  const assignment = await prisma.assignment.findUnique({
    where:   { id: assignmentId },
    include: { problem: true },
  });
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }

  // Load rubric (required for AI scoring)
  const rubric = await prisma.rubric.findFirst({ where: { problemId: assignment.problemId } });
  if (!rubric) { res.status(400).json({ error: "No rubric found for this problem. Create one in the Question Bank (Rubric button) before requesting AI suggestions." }); return; }

  // Load latest student submission
  const submission = await prisma.submission.findFirst({
    where:   { problemId: assignment.problemId, userId },
    orderBy: { createdAt: "desc" },
  });
  if (!submission) { res.status(400).json({ error: "No submission found for this student." }); return; }

  // Load latest SubmissionAttempt for this student+problem (has test-pass counts + runtime data)
  const attempt = await prisma.submissionAttempt.findFirst({
    where:   { problemId: assignment.problemId, userId },
    orderBy: { createdAt: "desc" },
  });

  // Load public test cases for diff context
  const testCases = await prisma.testCase.findMany({
    where:   { problemId: assignment.problemId, isHidden: false },
    select:  { input: true, expectedOutput: true },
    orderBy: { id: "asc" },
    take:    6,
  });

  // Build ExecutionContext from attempt data (null if no attempt exists)
  const exec: ExecutionContext | null = attempt
    ? {
        normalizedStatus: attempt.normalizedStatus,
        publicPassed:     attempt.publicPassed   ?? null,
        publicTotal:      attempt.publicTotal    ?? null,
        hiddenPassed:     attempt.hiddenPassed   ?? null,
        hiddenTotal:      attempt.hiddenTotal    ?? null,
        allPassed:        attempt.allPassed      ?? null,
        stdout:           attempt.stdout         ?? null,
        stderr:           attempt.stderr         ?? null,
        compileOutput:    attempt.compileOutput  ?? null,
        executionTimeMs:  attempt.executionTimeMs ?? null,
        memoryKb:         attempt.memoryKb       ?? null,
        testCases,
      }
    : null;

  const criteria = rubric.criteria as unknown as RubricCriterion[];
  const result   = await suggestScore(
    assignment.problem.title,
    assignment.problem.description,
    assignment.problem.language,
    submission.code,
    criteria,
    assignment.problem.referenceSolution ?? null,
    exec,
  );

  if (!result.success) {
    res.status(500).json({ success: false, error: result.error });
    return;
  }

  res.json({ success: true, data: result.suggestion, model: result.model });
});

// ── PUT /api/grades/:assignmentId/:userId ─────────────────────────────────────
// Teacher saves (upserts) final grade.
router.put("/:assignmentId/:userId", async (req: Request, res: Response) => {
  const assignmentId = parseId(req.params.assignmentId);
  const userId       = parseId(req.params.userId);
  if (!assignmentId || !userId) { res.status(400).json({ error: "Invalid IDs" }); return; }

  const { score, maxScore = 100, breakdown, feedback, rubricId, aiSuggested = false } = req.body as {
    score:        number;
    maxScore?:    number;
    breakdown?:   unknown;
    feedback?:    string;
    rubricId?:    number;
    aiSuggested?: boolean;
  };

  if (typeof score !== "number" || score < 0 || score > maxScore) {
    res.status(400).json({ error: "score must be a number between 0 and maxScore" });
    return;
  }

  const gradedById = req.auth?.userId;
  if (!gradedById) { res.status(401).json({ error: "Unauthorized" }); return; }

  const existing = await prisma.grade.findUnique({
    where: { assignmentId_userId: { assignmentId, userId } },
  });

  const gradeData = {
    score,
    maxScore,
    breakdown:   breakdown ? (breakdown as object) : undefined,
    feedback:    feedback ?? null,
    rubricId:    rubricId ?? null,
    aiSuggested,
    gradedById,
  };

  const grade = existing
    ? await prisma.grade.update({
        where: { assignmentId_userId: { assignmentId, userId } },
        data:  gradeData,
      })
    : await prisma.grade.create({
        data: { assignmentId, userId, ...gradeData },
      });

  res.json({ success: true, data: grade });
});

export { router as gradesRouter };
