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
import { prisma }      from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";

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
    // Student: only enrolled assignments
    const enrollments = await prisma.assignmentEnrollment.findMany({
      where:   { userId },
      include: {
        assignment: {
          select: {
            id:               true,
            title:            true,
            description:      true,
            dueDate:          true,
            isPublished:      true,
            allowedLanguages: true,
            lateDeadline:     true,
            lateDeduction:    true,
            problem: { select: { id: true, title: true, language: true, difficulty: true, description: true } },
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

  const { title, description, problemId, dueDate, isPublished, allowedLanguages, lateDeadline, lateDeduction } = req.body as {
    title:             string;
    description?:      string;
    problemId:         number;
    dueDate?:          string;
    isPublished?:      boolean;
    allowedLanguages?: string[];
    lateDeadline?:     string | null;
    lateDeduction?:    number;
  };

  if (!title?.trim() || !problemId) {
    res.status(400).json({ error: "title and problemId are required" });
    return;
  }

  const assignment = await prisma.assignment.create({
    data: {
      title:            title.trim(),
      description:      description ?? null,
      problemId,
      createdById:      userId,
      dueDate:          dueDate ? new Date(dueDate) : null,
      isPublished:      isPublished ?? false,
      allowedLanguages: allowedLanguages ?? [],
      lateDeadline:     lateDeadline ? new Date(lateDeadline) : null,
      lateDeduction:    lateDeduction ?? 0,
    },
    include: { problem: { select: { id: true, title: true, language: true } } },
  });

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
  const { role } = req.auth!;
  if (role !== "teacher") { res.status(403).json({ error: "Teachers only" }); return; }

  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { title, description, dueDate, isPublished, allowedLanguages, lateDeadline, lateDeduction } = req.body as {
    title?:             string;
    description?:       string;
    dueDate?:           string | null;
    isPublished?:       boolean;
    allowedLanguages?:  string[];
    lateDeadline?:      string | null;
    lateDeduction?:     number;
  };

  const assignment = await prisma.assignment.update({
    where: { id },
    data:  {
      ...(title            !== undefined ? { title: title.trim() }                          : {}),
      ...(description      !== undefined ? { description }                                  : {}),
      ...(dueDate          !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null }  : {}),
      ...(isPublished      !== undefined ? { isPublished }                                  : {}),
      ...(allowedLanguages !== undefined ? { allowedLanguages }                             : {}),
      ...(lateDeadline     !== undefined ? { lateDeadline: lateDeadline ? new Date(lateDeadline) : null } : {}),
      ...(lateDeduction    !== undefined ? { lateDeduction }                                : {}),
    },
  });

  res.json({ success: true, data: assignment });
});

// ── DELETE /api/assignments/:id ──────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  const { role } = req.auth!;
  if (role !== "teacher") { res.status(403).json({ error: "Teachers only" }); return; }

  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  await prisma.assignment.delete({ where: { id } });
  res.json({ success: true });
});

// ── POST /api/assignments/:id/enroll ─────────────────────────────────────────
router.post("/:id/enroll", async (req: Request, res: Response) => {
  const { role } = req.auth!;
  if (role !== "teacher") { res.status(403).json({ error: "Teachers only" }); return; }

  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { studentIds, all } = req.body as { studentIds?: number[]; all?: boolean };

  let userIds: number[] = [];

  if (all) {
    const students = await prisma.user.findMany({
      where: { role: { is: { name: "student" } } },
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
