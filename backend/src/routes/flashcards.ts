/**
 * flashcards.ts
 *
 * Routes:
 *   GET  /api/flashcards?problemId=:id         — return flashcards for the current user + problem
 *   GET  /api/flashcards/status?problemId=:id  — { ready: bool }
 */

import { Router } from "express";
import { prisma }  from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();
router.use(requireAuth);

// ── GET /api/flashcards ───────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const problemId = Number(req.query.problemId);
  if (!problemId || isNaN(problemId)) {
    res.status(400).json({ error: "problemId query param required" });
    return;
  }

  const userId = req.auth!.userId;

  const flashcard = await prisma.flashcard.findFirst({
    where:   { userId, problemId },
    orderBy: { createdAt: "desc" },
  });

  if (!flashcard) {
    res.json({ ready: false });
    return;
  }

  res.json({
    ready:     true,
    cards:     flashcard.cards,
    createdAt: flashcard.createdAt,
  });
});

// ── GET /api/flashcards/status ────────────────────────────────────────────────
router.get("/status", async (req, res) => {
  const problemId = Number(req.query.problemId);
  if (!problemId || isNaN(problemId)) {
    res.status(400).json({ error: "problemId query param required" });
    return;
  }

  const userId = req.auth!.userId;

  const count = await prisma.flashcard.count({
    where: { userId, problemId },
  });

  res.json({ ready: count > 0 });
});

export default router;
