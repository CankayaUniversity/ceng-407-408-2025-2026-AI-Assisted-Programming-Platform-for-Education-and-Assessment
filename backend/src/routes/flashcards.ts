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
import { AttemptMode, Prisma } from "@prisma/client";
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
//
// Concurrency model:
//   • generatingSet acts as an in-process mutex keyed by `${userId}:${problemId}`.
//   • We RESERVE the key BEFORE any await so two concurrent POSTs from the
//     same user+problem can't both pass the existence check and both spawn
//     duplicate background jobs (which would silently create two Flashcard
//     rows because the schema lacks @@unique on (userId, problemId)).
//   • A second re-check is performed inside the background IIFE just before
//     the insert, defending against the case where the lock was lost (e.g.
//     backend restart) and another generation completed in the meantime.
//   • Empty cards arrays are NOT persisted — the student would otherwise see
//     a "ready" row with nothing in it and be unable to retry.
router.post("/generate", async (req, res) => {
  const userId    = req.auth!.userId;
  const problemId = Number(req.body.problemId);

  if (!problemId || isNaN(problemId)) {
    res.status(400).json({ error: "problemId is required" });
    return;
  }

  const key = `${userId}:${problemId}`;

  // ── Step 1: synchronous reservation (no awaits before this point) ──
  // If the slot is already taken, bail out immediately. Otherwise claim it
  // — this is safe even under racing requests because Set.add is synchronous
  // and the Node event loop won't context-switch within these two lines.
  if (generatingSet.has(key)) {
    res.status(202).json({ status: "generating" });
    return;
  }
  generatingSet.add(key);

  // From here on, every early-return path MUST release the lock first.
  // We use a try/catch at the top level to guarantee that.
  try {
    // ── Step 2: re-check existence inside the lock ──
    const existing = await prisma.flashcard.count({ where: { userId, problemId } });
    if (existing > 0) {
      generatingSet.delete(key);
      res.status(200).json({ status: "already_exists" });
      return;
    }

    // Verify the student actually solved this problem
    const solved = await prisma.submissionAttempt.count({
      where: { userId, problemId, allPassed: true },
    });
    if (solved === 0) {
      generatingSet.delete(key);
      res.status(403).json({ error: "Flashcards can only be generated after solving the problem." });
      return;
    }

    // Fetch the problem
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { title: true, description: true, referenceSolution: true, language: true },
    });
    if (!problem) {
      generatingSet.delete(key);
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
      generatingSet.delete(key);
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

    // ── Step 3: return 202 immediately and run generation in background ──
    res.status(202).json({ status: "generating" });

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

        // Bug fix #2 — Don't persist empty card arrays. The post-generation
        // filters in flashcardService can reject every card (e.g. all
        // ungrounded). A `cards: []` row would set `ready=true` permanently
        // and lock the student out of regenerating. Treat this as a soft
        // failure so a future POST can try again.
        if (!Array.isArray(cards) || cards.length === 0) {
          console.warn(
            `[flashcards] Empty card set after filtering — not persisting. user=${userId} problem=${problemId}`,
          );
          return;
        }

        // Bug fix #1b — Re-check existence right before insert. Defends
        // against the case where the in-memory lock was lost (process
        // restart) and another generation already finished.
        const stillEmpty = await prisma.flashcard.count({ where: { userId, problemId } });
        if (stillEmpty > 0) {
          console.warn(
            `[flashcards] Skipping insert — another job already created cards. user=${userId} problem=${problemId}`,
          );
          return;
        }

        try {
          await prisma.flashcard.create({
            data: {
              userId,
              problemId,
              submissionId: acceptedAttempt.submissionId ?? null,
              cards,
            },
          });
          console.log(`[flashcards] Generated ${cards.length} cards for user=${userId} problem=${problemId}`);
        } catch (createErr) {
          // P2002 = unique constraint violation. Means another job inserted
          // between our existence re-check and this create. Treat as a soft
          // race-loss, not an error.
          if (
            createErr instanceof Prisma.PrismaClientKnownRequestError &&
            createErr.code === "P2002"
          ) {
            console.warn(
              `[flashcards] Insert race lost (P2002) — another job won. user=${userId} problem=${problemId}`,
            );
          } else {
            throw createErr;
          }
        }
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
  } catch (err) {
    // An error in the pre-generation phase (Prisma read failure, etc.).
    // Release the lock so the next request can retry, and propagate.
    generatingSet.delete(key);
    if (!res.headersSent) {
      console.error("[flashcards] Pre-generation error:", err);
      res.status(500).json({ error: "Internal error preparing flashcard generation" });
    }
  }
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
