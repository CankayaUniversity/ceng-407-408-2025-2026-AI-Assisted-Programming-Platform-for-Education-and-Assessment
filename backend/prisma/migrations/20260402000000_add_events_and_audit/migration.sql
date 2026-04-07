-- CreateEnum
CREATE TYPE "AttemptMode" AS ENUM ('raw', 'tests');

-- CreateEnum
CREATE TYPE "NormalizedStatus" AS ENUM ('accepted', 'wrong_answer', 'syntax_error', 'runtime_error', 'time_limit_exceeded', 'memory_limit_exceeded', 'compile_error', 'internal_error');

-- AlterTable
ALTER TABLE "Problem" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

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

-- CreateTable
CREATE TABLE "HintEvent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "problemId" INTEGER NOT NULL,
    "attemptId" INTEGER,
    "aiLogId" INTEGER,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "mode" TEXT NOT NULL DEFAULT 'hint',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HintEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInteractionAudit" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "problemId" INTEGER,
    "submissionId" INTEGER,
    "attemptId" INTEGER,
    "aiLogId" INTEGER,
    "mentorRaw" TEXT,
    "validatorJson" JSONB,
    "policyAction" TEXT NOT NULL,
    "finalText" TEXT NOT NULL,
    "mentorModel" TEXT,
    "validatorModel" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInteractionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionAttempt_userId_problemId_createdAt_idx" ON "SubmissionAttempt"("userId", "problemId", "createdAt");

-- CreateIndex
CREATE INDEX "SubmissionAttempt_problemId_createdAt_idx" ON "SubmissionAttempt"("problemId", "createdAt");

-- CreateIndex
CREATE INDEX "HintEvent_userId_problemId_createdAt_idx" ON "HintEvent"("userId", "problemId", "createdAt");

-- CreateIndex
CREATE INDEX "HintEvent_problemId_createdAt_idx" ON "HintEvent"("problemId", "createdAt");

-- CreateIndex
CREATE INDEX "AiInteractionAudit_userId_problemId_createdAt_idx" ON "AiInteractionAudit"("userId", "problemId", "createdAt");

-- CreateIndex
CREATE INDEX "AiInteractionAudit_problemId_createdAt_idx" ON "AiInteractionAudit"("problemId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubmissionAttempt" ADD CONSTRAINT "SubmissionAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAttempt" ADD CONSTRAINT "SubmissionAttempt_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAttempt" ADD CONSTRAINT "SubmissionAttempt_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HintEvent" ADD CONSTRAINT "HintEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HintEvent" ADD CONSTRAINT "HintEvent_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HintEvent" ADD CONSTRAINT "HintEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "SubmissionAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HintEvent" ADD CONSTRAINT "HintEvent_aiLogId_fkey" FOREIGN KEY ("aiLogId") REFERENCES "AiLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInteractionAudit" ADD CONSTRAINT "AiInteractionAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInteractionAudit" ADD CONSTRAINT "AiInteractionAudit_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInteractionAudit" ADD CONSTRAINT "AiInteractionAudit_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInteractionAudit" ADD CONSTRAINT "AiInteractionAudit_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "SubmissionAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInteractionAudit" ADD CONSTRAINT "AiInteractionAudit_aiLogId_fkey" FOREIGN KEY ("aiLogId") REFERENCES "AiLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
