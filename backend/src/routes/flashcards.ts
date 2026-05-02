/**
 * flashcards.ts
 *
 * Routes:
 *   GET  /api/flashcards/library               — all flashcards for the current user (with problem metadata)
 *   GET  /api/flashcards?problemId=:id         — flashcards for the current user + a specific problem
 *   GET  /api/flashcards/status?problemId=:id  — { ready: bool }
 */

import { Router } from "express";
import { prisma }  from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();
router.use(requireAuth);

// ── GET /api/flashcards/library ───────────────────────────────────────────────
// Returns every flashcard set the student has earned, with problem metadata
// needed for client-side filtering (language, category, difficulty, tags).
// Must be defined before the "/?problemId" route to avoid path ambiguity.
router.get("/library", async (req, res) => {
  const userId = req.auth!.userId;

  const rows = await prisma.flashcard.findMany({
    where:   { userId },
    orderBy: { createdAt: "desc" },
    include: {
      problem: {
        select: {
          id:         true,
          title:      true,
          language:   true,
          category:   true,
          difficulty: true,
          tags:       true,
        },
      },
    },
  });

  const data = rows.map((f) => ({
    id:           f.id,
    problemId:    f.problemId,
    problemTitle: f.problem.title,
    language:     f.problem.language,
    category:     f.problem.category ?? null,
    difficulty:   f.problem.difficulty ?? null,
    tags:         f.problem.tags ?? [],
    cards:        f.cards,
    createdAt:    f.createdAt,
  }));

  res.json({ data });
});

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
