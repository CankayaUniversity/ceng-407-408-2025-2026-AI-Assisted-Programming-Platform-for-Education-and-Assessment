import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { buildStudentProblemMetrics } from "../services/analytics/scoring";

const router = Router();

router.use(requireAuth);
router.use(requireRole("teacher"));

function parseId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

router.get("/students", async (_req, res) => {
  const students = await prisma.user.findMany({
    where: { role: { is: { name: "student" } } },
    include: {
      attempts: true,
      hintEvents: true,
    },
    orderBy: { id: "asc" },
  });

  res.json({
    data: students.map((student) => ({
      id: student.id,
      name: student.name,
      email: student.email,
      totalAttempts: student.attempts.length,
      totalHints: student.hintEvents.length,
      acceptedAttempts: student.attempts.filter((attempt) => attempt.statusCategory === "accepted")
        .length,
    })),
  });
});

router.get("/students/:id/summary", async (req, res) => {
  const studentId = parseId(req.params.id);
  if (studentId == null) {
    res.status(400).json({ error: "Invalid student id" });
    return;
  }

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    include: {
      role: true,
      attempts: {
        orderBy: { createdAt: "asc" },
      },
      hintEvents: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!student || student.role.name !== "student") {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const metrics = buildStudentProblemMetrics(student.attempts, student.hintEvents);
  res.json({
    data: {
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
      },
      metrics,
    },
  });
});

router.get("/students/:id/problems/:problemId/detail", async (req, res) => {
  const studentId = parseId(req.params.id);
  const problemId = parseId(req.params.problemId);
  if (studentId == null || problemId == null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [student, problem, attempts, hints] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId }, include: { role: true } }),
    prisma.problem.findUnique({ where: { id: problemId } }),
    prisma.submissionAttempt.findMany({
      where: { userId: studentId, problemId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.hintEvent.findMany({
      where: { userId: studentId, problemId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!student || student.role.name !== "student") {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  if (!problem) {
    res.status(404).json({ error: "Problem not found" });
    return;
  }

  res.json({
    data: {
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
      },
      problem: {
        id: problem.id,
        title: problem.title,
        difficulty: problem.difficulty,
        tags: problem.tags,
        category: problem.category,
        metadata: problem.metadata,
      },
      metrics: buildStudentProblemMetrics(attempts, hints),
      attempts,
      hints,
    },
  });
});

router.get("/problems/:id/analytics", async (req, res) => {
  const problemId = parseId(req.params.id);
  if (problemId == null) {
    res.status(400).json({ error: "Invalid problem id" });
    return;
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    include: {
      attempts: true,
      hintEvents: true,
    },
  });

  if (!problem) {
    res.status(404).json({ error: "Problem not found" });
    return;
  }

  const attempts = problem.attempts;
  const acceptedAttempts = attempts.filter((attempt) => attempt.statusCategory === "accepted");
  const distinctStudents = new Set(attempts.map((attempt) => attempt.userId));

  res.json({
    data: {
      problem: {
        id: problem.id,
        title: problem.title,
        difficulty: problem.difficulty,
        language: problem.language,
        tags: problem.tags,
        category: problem.category,
        metadata: problem.metadata,
      },
      analytics: {
        totalAttempts: attempts.length,
        acceptedAttempts: acceptedAttempts.length,
        distinctStudents: distinctStudents.size,
        totalHints: problem.hintEvents.length,
      },
    },
  });
});

router.get("/class/overview", async (_req, res) => {
  const [students, attempts, hints] = await Promise.all([
    prisma.user.count({ where: { role: { is: { name: "student" } } } }),
    prisma.submissionAttempt.findMany(),
    prisma.hintEvent.count(),
  ]);

  const acceptedAttempts = attempts.filter((attempt) => attempt.statusCategory === "accepted");

  res.json({
    data: {
      totalStudents: students,
      totalAttempts: attempts.length,
      acceptedAttempts: acceptedAttempts.length,
      totalHints: hints,
    },
  });
});

export { router as teacherRouter };
