-- Create ExamViolation table.
-- The Prisma model was added to schema.prisma earlier but no migration file
-- was generated, so production databases are missing the table. This
-- migration backfills the table + indexes + FK exactly as the schema defines.

CREATE TABLE IF NOT EXISTS "ExamViolation" (
    "id"            SERIAL       NOT NULL,
    "userId"        INTEGER      NOT NULL,
    "assignmentId"  INTEGER,
    "problemId"     INTEGER,
    "type"          TEXT         NOT NULL,
    "count"         INTEGER      NOT NULL DEFAULT 1,
    "autoSubmitted" BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamViolation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExamViolation_userId_assignmentId_idx"
    ON "ExamViolation"("userId", "assignmentId");

CREATE INDEX IF NOT EXISTS "ExamViolation_createdAt_idx"
    ON "ExamViolation"("createdAt");

-- FK to User. ON DELETE CASCADE so removing a user cleans up their rows.
-- Wrapped in a DO block so re-running is safe (some envs may already have it).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ExamViolation_userId_fkey'
    ) THEN
        ALTER TABLE "ExamViolation"
            ADD CONSTRAINT "ExamViolation_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
