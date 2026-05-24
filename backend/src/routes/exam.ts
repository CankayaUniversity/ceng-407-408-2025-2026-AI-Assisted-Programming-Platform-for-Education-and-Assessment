import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { prisma } from "../lib/prisma";

export const examRouter = Router();

// All exam endpoints require authentication
examRouter.use(requireAuth);

/**
 * POST /api/exam/violation
 *
 * Records a security violation during an exam session.
 * Called by the frontend on tab-switch, fullscreen-exit, or window-blur events.
 *
 * Body: { type, assignmentId?, problemId?, count, autoSubmitted? }
 */
examRouter.post("/violation", async (req, res) => {
  const userId = req.auth!.userId;
  const { type, assignmentId, problemId, count, autoSubmitted } = req.body;

  if (!type || typeof type !== "string") {
    res.status(400).json({ error: "type is required" });
    return;
  }

  const ALLOWED_TYPES = ["tab_switch", "fullscreen_exit", "window_blur"];
  if (!ALLOWED_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${ALLOWED_TYPES.join(", ")}` });
    return;
  }

  try {
    const violation = await prisma.examViolation.create({
      data: {
        userId,
        assignmentId: assignmentId != null ? Number(assignmentId) : null,
        problemId:    problemId    != null ? Number(problemId)    : null,
        type,
        count:         Number(count) || 1,
        autoSubmitted: Boolean(autoSubmitted),
      },
    });

    res.status(201).json({ success: true, id: violation.id });
  } catch (err) {
    console.error("[exam/violation]", err);
    res.status(500).json({ error: "Failed to record violation" });
  }
});

/**
 * GET /api/exam/violations/:assignmentId
 *
 * Returns all violations for the current user in an assignment.
 * Useful for resuming a session after a page refresh — the frontend
 * can restore the violation count without re-reading localStorage.
 */
examRouter.get("/violations/:assignmentId", async (req, res) => {
  const userId     = req.auth!.userId;
  const assignmentId = Number(req.params.assignmentId);
  if (Number.isNaN(assignmentId)) {
    res.status(400).json({ error: "Invalid assignmentId" });
    return;
  }

  try {
    const violations = await prisma.examViolation.findMany({
      where: { userId, assignmentId },
      orderBy: { createdAt: "asc" },
    });

    res.json({ success: true, data: violations, count: violations.length });
  } catch (err) {
    console.error("[exam/violations]", err);
    res.status(500).json({ error: "Failed to fetch violations" });
  }
});

/**
 * GET /api/exam/status/:assignmentId
 *
 * Authoritative lockout status for the current user in this exam assignment.
 * The frontend calls this on every problem load when isExamSession is true,
 * and treats the response as the source of truth — localStorage is just a
 * client-side cache for immediate UI feedback during the session.
 *
 * A user is locked when at least one violation row with autoSubmitted=true
 * exists. Once locked, this status persists across sessions, browsers, and
 * logouts because it lives in the database.
 *
 * Response: { success: true, locked: boolean, violationCount: number,
 *             autoSubmittedAt: string | null }
 */
examRouter.get("/status/:assignmentId", async (req, res) => {
  const userId       = req.auth!.userId;
  const assignmentId = Number(req.params.assignmentId);
  if (Number.isNaN(assignmentId)) {
    res.status(400).json({ error: "Invalid assignmentId" });
    return;
  }

  try {
    const [violationCount, lockingRow] = await Promise.all([
      prisma.examViolation.count({
        where: { userId, assignmentId },
      }),
      prisma.examViolation.findFirst({
        where: { userId, assignmentId, autoSubmitted: true },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);

    res.json({
      success: true,
      locked: lockingRow !== null,
      violationCount,
      autoSubmittedAt: lockingRow?.createdAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("[exam/status]", err);
    res.status(500).json({ error: "Failed to fetch exam status" });
  }
});
