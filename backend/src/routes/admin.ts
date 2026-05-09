import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { examModeSchema } from "../lib/schemas";
import { sendApprovalEmail, sendRejectionEmail } from "../lib/emailService";

const router = Router();

router.use(requireAuth);

// Helper: parse the SystemFlag value which may be legacy boolean or new { enabled, groupIds }
function parseExamFlag(raw: unknown): { enabled: boolean; groupIds: number[] } {
  if (typeof raw === "boolean") return { enabled: raw, groupIds: [] };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      enabled:  Boolean(obj.enabled),
      groupIds: Array.isArray(obj.groupIds) ? (obj.groupIds as number[]) : [],
    };
  }
  return { enabled: false, groupIds: [] };
}

router.get("/exam-mode", async (req, res) => {
  const flag = await prisma.systemFlag.findUnique({
    where: { key: "exam_mode_enabled" },
  });
  const { enabled, groupIds } = parseExamFlag(flag?.value);

  // Teachers always see the raw global state (needed for the ExamModeCard UI)
  if (req.auth!.role !== "student") {
    res.json({ data: { key: "exam_mode_enabled", enabled, groupIds } });
    return;
  }

  // Students: if groups are specified, only return enabled=true if THIS student
  // is actually a member of one of the restricted groups.
  if (enabled && groupIds.length > 0) {
    const membership = await prisma.studentGroupMembership.findFirst({
      where: { userId: req.auth!.userId, groupId: { in: groupIds } },
    });
    res.json({ data: { key: "exam_mode_enabled", enabled: membership !== null, groupIds } });
    return;
  }

  // enabled=false OR no group filter (applies to all students)
  res.json({ data: { key: "exam_mode_enabled", enabled, groupIds } });
});

router.patch("/exam-mode", requireRole("admin", "teacher"), async (req, res) => {
  const parsed = examModeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    return;
  }
  const { enabled, groupIds } = parsed.data;

  const flag = await prisma.systemFlag.upsert({
    where:  { key: "exam_mode_enabled" },
    update: { value: { enabled, groupIds } },
    create: { key: "exam_mode_enabled", value: { enabled, groupIds } },
  });

  const result = parseExamFlag(flag.value);
  res.json({
    data: { key: flag.key, enabled: result.enabled, groupIds: result.groupIds, updatedAt: flag.updatedAt },
  });
});

// ── Teacher approval endpoints (isAdmin guard) ────────────────────────────────

/** Middleware: require the caller to have isAdmin=true */
async function requireAdmin(req: any, res: any, next: any) {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

/**
 * GET /api/admin/pending-teachers
 * Returns all teacher accounts with status=pending_approval.
 */
router.get("/pending-teachers", requireAdmin, async (req, res) => {
  const pending = await prisma.user.findMany({
    where:   { status: "pending_approval", role: { name: "teacher" } },
    include: { role: true },
    orderBy: { createdAt: "asc" },
  });

  res.json({
    data: pending.map((u) => ({
      id:        u.id,
      name:      u.name,
      email:     u.email,
      createdAt: u.createdAt,
    })),
  });
});

/**
 * POST /api/admin/approve/:userId
 * Activates the teacher account and notifies them by email.
 */
router.post("/approve/:userId", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const user = await prisma.user.findUnique({
    where:   { id: userId },
    include: { role: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.status !== "pending_approval") {
    res.status(400).json({ error: "User is not pending approval" });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data:  { status: "active" },
  });

  await sendApprovalEmail(user.email, user.name).catch(console.error);

  res.json({ success: true, user: { id: updated.id, email: updated.email, status: updated.status } });
});

/**
 * POST /api/admin/reject/:userId
 * Rejects the teacher account (status=rejected) and notifies them.
 * Optional body: { reason: string }
 */
router.post("/reject/:userId", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const { reason } = req.body as { reason?: string };

  const user = await prisma.user.findUnique({
    where:   { id: userId },
    include: { role: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.status !== "pending_approval") {
    res.status(400).json({ error: "User is not pending approval" });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data:  { status: "rejected" },
  });

  await sendRejectionEmail(user.email, user.name, reason).catch(console.error);

  res.json({ success: true, user: { id: updated.id, email: updated.email, status: updated.status } });
});

// ── Teacher-Student assignment endpoints (admin only) ─────────────────────────

/**
 * GET /api/admin/teachers
 * List all active teacher accounts (for admin assignment UI).
 */
router.get("/teachers", requireAdmin, async (req, res) => {
  const teachers = await prisma.user.findMany({
    where:   { role: { name: "teacher" }, status: "active" },
    select:  { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  res.json({ data: teachers });
});

/**
 * POST /api/admin/teacher-students
 * Assign (or re-assign) a student to a teacher.
 * Body: { teacherId: number, studentId: number }
 */
router.post("/teacher-students", requireAdmin, async (req, res) => {
  const { teacherId, studentId } = req.body as { teacherId?: number; studentId?: number };

  if (!teacherId || !studentId) {
    res.status(400).json({ error: "teacherId and studentId are required" });
    return;
  }

  // Verify teacher exists and is actually a teacher
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, role: { name: "teacher" } },
  });
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }

  // Verify student exists and is actually a student
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: { name: "student" } },
  });
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  // Upsert: if student already has an assignment, update it; otherwise create
  const assignment = await prisma.teacherStudent.upsert({
    where:  { studentId },
    update: { teacherId },
    create: { teacherId, studentId },
    include: { teacher: { select: { id: true, name: true, email: true } } },
  });

  res.json({ success: true, data: assignment });
});

/**
 * DELETE /api/admin/teacher-students/:studentId
 * Remove the teacher assignment for a student (student becomes unassigned).
 */
router.delete("/teacher-students/:studentId", requireAdmin, async (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  if (isNaN(studentId)) {
    res.status(400).json({ error: "Invalid studentId" });
    return;
  }

  await prisma.teacherStudent.deleteMany({ where: { studentId } });
  res.json({ success: true });
});

export { router as adminRouter };
