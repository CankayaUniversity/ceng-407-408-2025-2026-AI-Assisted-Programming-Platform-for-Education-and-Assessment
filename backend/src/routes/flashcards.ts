/**
 * flashcards.ts
 *
 * Routes:
 *   GET  /api/flashcards/library               — all flashcards for the current user (with problem metadata)
 *   GET  /api/flashcards?problemId=:id         — flashcards for the current user + a specific problem
 *   GET  /api/flashcards/status?problemId=:id  — { ready: bool, generating: bool }
 *   POST /api/flashcards/generate              — start background generation for a problem (manual trigger)
 */

import { Router } from "express";
import { prisma }  from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { AttemptMode } from "@prisma/client";
import { generateFlashcards } from "../services/flashcardService";

const router = Router();
router.use(requireAuth);

/**
 * In-memory set of "user:problem" pairs currently being generated.
 * Prevents duplicate concurrent jobs for the same user+problem.
 */
const generatingSet = new Set<string>();

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

// ── GET /api/flashcards/status ────────────────────────────────────────────────
// Must come before GET / to avoid Express treating "status" as ?problemId
router.get("/status", async (req, res) => {
  const problemId = Number(req.query.problemId);
  if (!problemId || isNaN(problemId)) {
    res.status(400).json({ error: "problemId query param required" });
    return;
  }

  const userId = req.auth!.userId;
  const key    = `${userId}:${problemId}`;

  const count = await prisma.flashcard.count({
    where: { userId, problemId },
  });

  res.json({
    ready:      count > 0,
    generating: generatingSet.has(key),
  });
});

// ── POST /api/flashcards/generate ────────────────────────────────────────────
// Student manually triggers flashcard generation after a correct submission.
// Returns 202 immediately; generation runs in the background.
router.post("/generate", async (req, res) => {
  const userId    = req.auth!.userId;
  const problemId = Number(req.body.problemId);

  if (!problemId || isNaN(problemId)) {
    res.status(400).json({ error: "problemId is required" });
    return;
  }

  const key = `${userId}:${problemId}`;

  // Already generated
  const existing = await prisma.flashcard.count({ where: { userId, problemId } });
  if (existing > 0) {
    res.status(200).json({ status: "already_exists" });
    return;
  }

  // Already generating
  if (generatingSet.has(key)) {
    res.status(202).json({ status: "generating" });
    return;
  }

  // Verify the student actually solved this problem
  const solved = await prisma.submissionAttempt.count({
    where: { userId, problemId, allPassed: true },
  });
  if (solved === 0) {
    res.status(403).json({ error: "Flashcards can only be generated after solving the problem." });
    return;
  }

  // Fetch the problem
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { title: true, description: true, referenceSolution: true, language: true },
  });
  if (!problem) {
    res.status(404).json({ error: "Problem not found" });
    return;
  }

  // Fetch the accepted submission (most recent)
  const acceptedAttempt = await prisma.submissionAttempt.findFirst({
    where:   { userId, problemId, allPassed: true },
    orderBy: { createdAt: "desc" },
    select:  { sourceCode: true, submissionId: true },
  });
  if (!acceptedAttempt) {
    res.status(404).json({ error: "No accepted submission found" });
    return;
  }

  // Fetch ALL failed attempts — no limit
  const failedAttempts = await prisma.submissionAttempt.findMany({
    where:   { userId, problemId, allPassed: false, mode: AttemptMode.tests },
    orderBy: { createdAt: "asc" },   // chronological so AI can see the progression
    select: {
      normalizedStatus: true,
      sourceCode:       true,
      stderr:           true,
      compileOutput:    true,
      stdout:           true,
    },
  });

  // Mark as generating and return 202 immediately
  generatingSet.add(key);
  res.status(202).json({ status: "generating" });

  // Run generation in background (non-blocking)
  (async () => {
    try {
      const cards = await generateFlashcards({
        problemTitle:       problem.title,
        problemDescription: problem.description,
        referenceSolution:  problem.referenceSolution ?? null,
        language:           problem.language,
        acceptedCode:       acceptedAttempt.sourceCode,
        failedAttempts:     failedAttempts.map((a) => ({
          normalizedStatus: a.normalizedStatus,
          sourceCode:       a.sourceCode,
          stderr:           a.stderr,
          compileOutput:    a.compileOutput,
          stdout:           a.stdout,
        })),
      });

      await prisma.flashcard.create({
        data: {
          userId,
          problemId,
          submissionId: acceptedAttempt.submissionId ?? null,
          cards,
        },
      });

      console.log(`[flashcards] Generated ${cards.length} cards for user=${userId} problem=${problemId}`);
    } catch (err) {
      // C2 — Distinguish abort/timeout from real errors so log scanning is
      // actually useful. AbortError comes from the timeout watchdog in
      // flashcardService.ts; everything else is a real failure (HTTP, parse,
      // Prisma write, etc.).
      const isAbort = err instanceof Error && err.name === "AbortError";
      const cause = isAbort
        ? `timeout (${failedAttempts.length} prior attempts)`
        : err instanceof Error
          ? `${err.name}: ${err.message}`
          : String(err);
      console.error(
        `[flashcards] Generation failed user=${userId} problem=${problemId} cause=${cause}`,
      );
    } finally {
      generatingSet.delete(key);
    }
  })();
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

export default router;
