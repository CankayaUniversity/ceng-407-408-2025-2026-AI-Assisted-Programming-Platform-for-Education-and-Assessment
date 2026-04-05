-- CreateEnum
CREATE TYPE "AttemptMode" AS ENUM ('raw', 'tests');

-- CreateEnum
CREATE TYPE "NormalizedStatus" AS ENUM ('accepted', 'wrong_answer', 'syntax_error', 'runtime_error', 'time_limit_exceeded', 'memory_limit_exceeded', 'compile_error', 'internal_error');

-- CreateTable
CREATE TABLE "SubmissionAttempt" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "problemId" INTEGER,
    "submissionId" INTEGER,
    "mode" "AttemptMode" NOT NULL,
    "language" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "judge0Status" TEXT,
    "normalizedStatus" "NormalizedStatus" NOT NULL,
    "publicPassed" INTEGER,
    "publicTotal" INTEGER,
    "hiddenPassed" INTEGER,
    "hiddenTotal" INTEGER,
    "allPassed" BOOLEAN,
    "stdout" TEXT,
    "stderr" TEXT,
    "compileOutput" TEXT,
    "executionTimeMs" DOUBLE PRECISION,
    "memoryKb" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionAttempt_userId_problemId_createdAt_idx" ON "SubmissionAttempt"("userId", "problemId", "createdAt");

-- CreateIndex
CREATE INDEX "SubmissionAttempt_problemId_createdAt_idx" ON "SubmissionAttempt"("problemId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubmissionAttempt" ADD CONSTRAINT "SubmissionAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAttempt" ADD CONSTRAINT "SubmissionAttempt_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAttempt" ADD CONSTRAINT "SubmissionAttempt_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
