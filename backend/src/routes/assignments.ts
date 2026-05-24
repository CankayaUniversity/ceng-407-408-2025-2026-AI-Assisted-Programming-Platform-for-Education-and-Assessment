/**
 * Assignments routes.
 *
 * GET  /api/assignments                        — list assignments (teacher: all theirs; student: enrolled)
 * POST /api/assignments                        — teacher creates assignment
 * GET  /api/assignments/:id                    — get single assignment
 * PUT  /api/assignments/:id                    — teacher updates
 * DELETE /api/assignments/:id                  — teacher deletes
 * POST /api/assignments/:id/enroll             — enroll students { studentIds[] | all: true }
 * DELETE /api/assignments/:id/enroll/:userId   — unenroll a student
 */

import { Router, type Request, type Response } from "express";
import { prisma }                       from "../lib/prisma";
import { requireAuth }                  from "../middleware/requireAuth";
import { triggerTutorialGeneration }    from "../services/tutorialService";

const router = Router();
router.use(requireAuth);

function parseId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

// ── GET /api/assignments ─────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const { userId, role } = req.auth!;

  if (role === "teacher") {
    const assignments = await prisma.assignment.findMany({
      where:   { createdById: userId },
      include: {
        problem:     { select: { id: true, title: true, language: true } },
        enrollments: { select: { userId: true } },
        _count:      { select: { grades: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: assignments });
  } else {
    // Student: all enrolled assignments (published or not — unpublished shown as "coming soon" in UI)
    const enrollments = await prisma.assignmentEnrollment.findMany({
      where:   { userId },
      include: {
        assignment: {
          select: {
            id:               true,
            title:            true,
            description:      true,
            mode:             true,
            examType:         true,
            startDate:        true,
            dueDate:          true,
            isPublished:      true,
            allowedLanguages: true,
            lateDeadline:     true,
            lateDeduction:    true,
            aiEnabled:        true,
            problem: { select: { id: true, title: true, language: true, difficulty: true, description: true, tags: true } },
          },
        },
      },
    });
    res.json({ success: true, data: enrollments.map((e) => e.assignment) });
  }
});

// ── POST /api/assignments ────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const { userId, role } = req.auth!;
  if (role !== "teacher") { res.status(403).json({ error: "Teachers only" }); return; }

  const { title, description, problemId, dueDate, startDate, examType, isPublished, allowedLanguages, lateDeadline, lateDeduction, mode, aiEnabled } = req.body as {
    title:             string;
    description?:      string;
    problemId:         number;
    dueDate?:          string;
    startDate?:        string | null;
    examType?:         string | null;
    isPublished?:      boolean;
    allowedLanguages?: string[];
    lateDeadline?:     string | null;
    lateDeduction?:    number;
    mode?:             string;
    aiEnabled?:        boolean;
  };

  if (!title?.trim() || !problemId) {
    res.status(400).json({ error: "title and problemId are required" });
    return;
  }

  const validModes = ["practice", "homework", "exam"];
  const resolvedMode = validModes.includes(mode ?? "") ? mode! : "homework";
  const resolvedExamType = resolvedMode === "exam" && examType ? examType : null;

  const assignment = await prisma.assignment.create({
    data: {
      title:            title.trim(),
      description:      description ?? null,
      problemId,
      createdById:      userId,
      mode:             resolvedMode,
      examType:         resolvedExamType,
      startDate:        resolvedMode === "exam" && startDate ? new Date(startDate) : null,
      dueDate:          dueDate ? new Date(dueDate) : null,
      isPublished:      isPublished ?? false,
      allowedLanguages: allowedLanguages ?? [],
      lateDeadline:     lateDeadline ? new Date(lateDeadline) : null,
      lateDeduction:    lateDeduction ?? 0,
      aiEnabled:        aiEnabled !== false, // default true; only false when explicitly passed
    },
    include: { problem: { select: { id: true, title: true, language: true } } },
  });

  // ── Auto-enroll all reachable students when published ───────────────────
  if (isPublished) {
    const { isAdmin } = req.auth!;
    // Admins reach every student; teachers reach only their assigned students.
    const studentWhere = isAdmin
      ? { role: { is: { name: "student" } } }
      : { role: { is: { name: "student" } }, assignedTeacher: { teacherId: userId } };

    const students = await prisma.user.findMany({ where: studentWhere, select: { id: true } });

    if (students.length > 0) {
      await prisma.assignmentEnrollment.createMany({
        data:           students.map((s) => ({ assignmentId: assignment.id, userId: s.id })),
        skipDuplicates: true,
      });
    }

    // Fire-and-forget tutorial generation for each tag
    const prob = await prisma.problem.findUnique({
      where:  { id: problemId },
      select: { tags: true, language: true, difficulty: true, description: true },
    });
    if (prob && prob.tags.length > 0) {
      triggerTutorialGeneration(prob.tags, prob.language, prob.difficulty ?? "Medium", prob.description);
    }
  }

  res.status(201).json({ success: true, data: assignment });
});

// ── GET /api/assignments/:id ─────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const assignment = await prisma.assignment.findUnique({
    where:   { id },
    include: {
      problem:     true,
      enrollments: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!assignment) { res.status(404).json({ error: "Not found" }); return; }

  res.json({ success: true, data: assignment });
});

// ── PUT /api/assignments/:id ─────────────────────────────────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  const { userId, role } = req.auth!;
  if (role !== "teacher") { res.status(403).json({ error: "Teachers only" }); return; }

  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  // Ownership check — a teacher may only edit their own assignments
  const existing = await prisma.assignment.findUnique({ where: { id }, select: { createdById: true } });
  if (!existing) { res.status(404).json({ error: "Assignment not found" }); return; }
  if (existing.createdById !== userId) { res.status(403).json({ error: "Not your assignment" }); return; }

  const { title, description, dueDate, startDate, examType, isPublished, allowedLanguages, lateDeadline, lateDeduction, mode, aiEnabled } = req.body as {
    title?:             string;
    description?:       string;
    dueDate?:           string | null;
    startDate?:         string | null;
    examType?:          string | null;
    isPublished?:       boolean;
    allowedLanguages?:  string[];
    lateDeadline?:      string | null;
    lateDeduction?:     number;
    mode?:              string;
    aiEnabled?:         boolean;
  };

  const validModes = ["practice", "homework", "exam"];

  const assignment = await prisma.assignment.update({
    where: { id },
    data:  {
      ...(title            !== undefined ? { title: title.trim() }                                                : {}),
      ...(description      !== undefined ? { description }                                                        : {}),
      ...(dueDate          !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null }                       : {}),
      ...(startDate        !== undefined ? { startDate: startDate ? new Date(startDate) : null }                 : {}),
      ...(examType         !== undefined ? { examType: examType ?? null }                                         : {}),
      ...(isPublished      !== undefined ? { isPublished }                                                        : {}),
      ...(allowedLanguages !== undefined ? { allowedLanguages }                                                   : {}),
      ...(lateDeadline     !== undefined ? { lateDeadline: lateDeadline ? new Date(lateDeadline) : null }        : {}),
      ...(lateDeduction    !== undefined ? { lateDeduction }                                                      : {}),
      ...(mode !== undefined && validModes.includes(mode) ? { mode }                                             : {}),
      ...(aiEnabled        !== undefined ? { aiEnabled }                                                          : {}),
    },
  });

  // ── Auto-enroll when publishing (or re-publishing) ───────────────────────
  if (isPublished === true) {
    const { isAdmin } = req.auth!;
    const studentWhere = isAdmin
      ? { role: { is: { name: "student" } } }
      : { role: { is: { name: "student" } }, assignedTeacher: { teacherId: userId } };

    const students = await prisma.user.findMany({ where: studentWhere, select: { id: true } });

    if (students.length > 0) {
      await prisma.assignmentEnrollment.createMany({
        data:           students.map((s) => ({ assignmentId: id!, userId: s.id })),
        skipDuplicates: true,   // idempotent — re-publishing never double-enrols
      });
    }

    // Fire-and-forget tutorial generation
    const prob = await prisma.problem.findUnique({
      where:  { id: assignment.problemId },
      select: { tags: true, language: true, difficulty: true, description: true },
    });
    if (prob && prob.tags.length > 0) {
      triggerTutorialGeneration(prob.tags, prob.language, prob.difficulty ?? "Medium", prob.description);
    }
  }

  res.json({ success: true, data: assignment });
});

// ── DELETE /api/assignments/:id ──────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  const { userId, role } = req.auth!;
  if (role !== "teacher") { res.status(403).json({ error: "Teachers only" }); return; }

  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  // Ownership check
  const existing = await prisma.assignment.findUnique({ where: { id }, select: { createdById: true } });
  if (!existing) { res.status(404).json({ error: "Assignment not found" }); return; }
  if (existing.createdById !== userId) { res.status(403).json({ error: "Not your assignment" }); return; }

  await prisma.assignment.delete({ where: { id } });
  res.json({ success: true });
});

// ── POST /api/assignments/:id/enroll ─────────────────────────────────────────
router.post("/:id/enroll", async (req: Request, res: Response) => {
  const { role } = req.auth!;
  if (role !== "teacher") { res.status(403).json({ error: "Teachers only" }); return; }

  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { userId: teacherId, isAdmin } = req.auth!;
  const { studentIds, all } = req.body as { studentIds?: number[]; all?: boolean };

  let userIds: number[] = [];

  if (all) {
    // Admin sees all students; non-admin teachers see only their assigned students
    const studentWhere = isAdmin
      ? { role: { is: { name: "student" } } }
      : { role: { is: { name: "student" } }, assignedTeacher: { teacherId } };

    const students = await prisma.user.findMany({
      where:  studentWhere,
      select: { id: true },
    });
    userIds = students.map((s) => s.id);
  } else if (Array.isArray(studentIds)) {
    userIds = studentIds;
  }

  if (userIds.length === 0) {
    res.status(400).json({ error: "No students specified" });
    return;
  }

  await prisma.assignmentEnrollment.createMany({
    data:           userIds.map((userId) => ({ assignmentId: id, userId })),
    skipDuplicates: true,
  });

  res.json({ success: true, enrolled: userIds.length });
});

// ── DELETE /api/assignments/:id/enroll/:userId ───────────────────────────────
router.delete("/:id/enroll/:userId", async (req: Request, res: Response) => {
  const { role } = req.auth!;
  if (role !== "teacher") { res.status(403).json({ error: "Teachers only" }); return; }

  const assignmentId = parseId(req.params.id);
  const userId       = parseId(req.params.userId);
  if (!assignmentId || !userId) { res.status(400).json({ error: "Invalid IDs" }); return; }

  await prisma.assignmentEnrollment.deleteMany({ where: { assignmentId, userId } });
  res.json({ success: true });
});

export { router as assignmentsRouter };
