-- Flashcard: enforce one set per (user, problem) at the DB layer.
-- The application's in-memory generatingSet mutex prevents most duplicates,
-- but a process restart between the mutex check and the insert could leak.
-- A unique constraint converts that race into a fail-fast P2002 error
-- which the route handler logs and skips, instead of silently persisting
-- a duplicate row.

-- Step 1: collapse any pre-existing duplicates (keep the newest set).
-- Without this the CREATE UNIQUE INDEX would fail.
DELETE FROM "Flashcard"
WHERE id NOT IN (
  SELECT DISTINCT ON ("userId", "problemId") id
  FROM "Flashcard"
  ORDER BY "userId", "problemId", "createdAt" DESC
);

-- Step 2: drop the old non-unique index and replace with a unique one.
DROP INDEX IF EXISTS "Flashcard_userId_problemId_idx";
CREATE UNIQUE INDEX "Flashcard_userId_problemId_key"
  ON "Flashcard"("userId", "problemId");
