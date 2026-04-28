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
      submissionAttempts: true,
      hintEvents: true,
    },
    orderBy: { id: "asc" },
  });

  const totalProblems = await prisma.problem.count();

  res.json({
    data: students.map((student) => {
      const accepted = student.submissionAttempts.filter(
        (a) => a.normalizedStatus === "accepted",
      );
      const distinctSolved = new Set(accepted.map((a) => a.problemId)).size;

      return {
        id: student.id,
        name: student.name,
        email: student.email,
        totalAttempts: student.submissionAttempts.length,
        totalHints: student.hintEvents.length,
        acceptedAttempts: accepted.length,
        distinctProblemsSolved: distinctSolved,
      };
    }),
    meta: { totalProblems },
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
      submissionAttempts: {
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

  const metrics = buildStudentProblemMetrics(student.submissionAttempts, student.hintEvents);
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
      submissionAttempts: true,
      hintEvents: true,
    },
  });

  if (!problem) {
    res.status(404).json({ error: "Problem not found" });
    return;
  }

  const attempts = problem.submissionAttempts;
  const acceptedAttempts = attempts.filter((attempt) => attempt.normalizedStatus === "accepted");
  const distinctStudents = new Set(attempts.map((attempt) => attempt.userId));

  res.json({
    data: {
      problem: {
        id: problem.id,
        title: problem.title,
        difficulty: problem.difficulty,
        language: problem.language,
        tags: problem.tags,
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

  const acceptedAttempts = attempts.filter((attempt) => attempt.normalizedStatus === "accepted");

  res.json({
    data: {
      totalStudents: students,
      totalAttempts: attempts.length,
      acceptedAttempts: acceptedAttempts.length,
      totalHints: hints,
    },
  });
});

// ── Student Groups ─────────────────────────────────────────────────────────

/** GET /api/teacher/groups — list all groups with member ids */
router.get("/groups", async (req, res) => {
  const groups = await prisma.studentGroup.findMany({
    where: { createdById: req.auth!.userId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json({
    data: groups.map((g) => ({
      id: g.id,
      name: g.name,
      members: g.members.map((m) => m.user),
    })),
  });
});

/** POST /api/teacher/groups — create group */
router.post("/groups", async (req, res) => {
  const { name, memberIds } = req.body as { name: string; memberIds: number[] };
  if (!name?.trim()) {
    res.status(400).json({ error: "Group name is required" });
    return;
  }
  const group = await prisma.studentGroup.create({
    data: {
      name: name.trim(),
      createdById: req.auth!.userId,
      members: {
        create: (memberIds ?? []).map((uid: number) => ({ userId: uid })),
      },
    },
    include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
  });
  res.status(201).json({
    data: {
      id: group.id,
      name: group.name,
      members: group.members.map((m) => m.user),
    },
  });
});

/** PUT /api/teacher/groups/:id — rename + replace membership */
router.put("/groups/:id", async (req, res) => {
  const groupId = parseId(req.params.id);
  if (groupId == null) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, memberIds } = req.body as { name?: string; memberIds?: number[] };

  const existing = await prisma.studentGroup.findUnique({ where: { id: groupId } });
  if (!existing || existing.createdById !== req.auth!.userId) {
    res.status(404).json({ error: "Group not found" });
    return;
  }

  // Replace all members in a transaction
  const updated = await prisma.$transaction(async (tx) => {
    await tx.studentGroupMembership.deleteMany({ where: { groupId } });
    return tx.studentGroup.update({
      where: { id: groupId },
      data: {
        name: name?.trim() ?? existing.name,
        members: {
          create: (memberIds ?? []).map((uid: number) => ({ userId: uid })),
        },
      },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
  });

  res.json({
    data: {
      id: updated.id,
      name: updated.name,
      members: updated.members.map((m) => m.user),
    },
  });
});

/** DELETE /api/teacher/groups/:id */
router.delete("/groups/:id", async (req, res) => {
  const groupId = parseId(req.params.id);
  if (groupId == null) { res.status(400).json({ error: "Invalid id" }); return; }

  const existing = await prisma.studentGroup.findUnique({ where: { id: groupId } });
  if (!existing || existing.createdById !== req.auth!.userId) {
    res.status(404).json({ error: "Group not found" }); return;
  }

  await prisma.studentGroup.delete({ where: { id: groupId } });
  res.json({ success: true });
});

// ── GET /api/teacher/class/analytics ─────────────────────────────────────────
// Returns class-wide analytics: per-problem error breakdown + student progress.
router.get("/class/analytics", async (_req, res) => {
  const [problems, attempts, students] = await Promise.all([
    prisma.problem.findMany({ select: { id: true, title: true, difficulty: true, language: true } }),
    prisma.submissionAttempt.findMany({
      where: { mode: "tests" },
      select: {
        userId: true, problemId: true, normalizedStatus: true,
        createdAt: true, language: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { is: { name: "student" } } },
      select: { id: true, name: true, email: true },
    }),
  ]);

  // Per-problem stats: error breakdown + accept rate + student count
  const problemStats = problems.map((prob) => {
    const probAttempts = attempts.filter((a) => a.problemId === prob.id);
    const distinctStudents = new Set(probAttempts.map((a) => a.userId)).size;
    const accepted  = probAttempts.filter((a) => a.normalizedStatus === "accepted").length;
    const errorProfile: Record<string, number> = {};
    for (const a of probAttempts) {
      if (a.normalizedStatus !== "accepted") {
        errorProfile[a.normalizedStatus] = (errorProfile[a.normalizedStatus] ?? 0) + 1;
      }
    }
    // Solved = student who has at least one accepted attempt
    const solvedStudents = new Set(
      probAttempts.filter((a) => a.normalizedStatus === "accepted").map((a) => a.userId),
    ).size;

    return {
      problemId:       prob.id,
      title:           prob.title,
      difficulty:      prob.difficulty,
      language:        prob.language,
      totalAttempts:   probAttempts.length,
      acceptedAttempts: accepted,
      distinctStudents,
      solvedStudents,
      acceptRate:      probAttempts.length > 0
        ? Math.round((accepted / probAttempts.length) * 100) : 0,
      errorProfile,
    };
  }).sort((a, b) => a.acceptRate - b.acceptRate); // hardest first

  // Per-student progress
  const studentProgress = students.map((s) => {
    const sa = attempts.filter((a) => a.userId === s.id);
    const acc = sa.filter((a) => a.normalizedStatus === "accepted").length;
    const solvedProblems = new Set(
      sa.filter((a) => a.normalizedStatus === "accepted").map((a) => a.problemId),
    ).size;
    return {
      studentId:    s.id,
      name:         s.name,
      email:        s.email,
      totalAttempts: sa.length,
      acceptedAttempts: acc,
      successRate:  sa.length > 0 ? Math.round((acc / sa.length) * 100) : 0,
      problemsSolved: solvedProblems,
    };
  }).sort((a, b) => b.problemsSolved - a.problemsSolved);

  // Weekly submission counts (last 12 weeks)
  const now = new Date();
  const weeklyData: { week: string; total: number; accepted: number }[] = [];
  for (let w = 11; w >= 0; w--) {
    const start = new Date(now);
    start.setDate(start.getDate() - w * 7 - start.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const weekAttempts = attempts.filter(
      (a) => a.createdAt >= start && a.createdAt < end,
    );
    weeklyData.push({
      week: start.toISOString().slice(0, 10),
      total: weekAttempts.length,
      accepted: weekAttempts.filter((a) => a.normalizedStatus === "accepted").length,
    });
  }

  res.json({
    data: {
      problemStats,
      studentProgress,
      weeklyData,
      totals: {
        students: students.length,
        attempts: attempts.length,
        accepted: attempts.filter((a) => a.normalizedStatus === "accepted").length,
        problems: problems.length,
      },
    },
  });
});


export { router as teacherRouter };
