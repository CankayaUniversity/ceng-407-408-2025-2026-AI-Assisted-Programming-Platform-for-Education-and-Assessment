-- CreateEnum
CREATE TYPE "PolicyAction" AS ENUM ('allow', 'rewrite', 'fallback_safe_hint', 'block');

-- CreateTable
CREATE TABLE "AIInteractionAudit" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "problemId" INTEGER NOT NULL,
    "attemptId" INTEGER,
    "mentorModel" TEXT NOT NULL,
    "validatorModel" TEXT,
    "mentorRaw" TEXT NOT NULL,
    "validatorJson" JSONB,
    "policyAction" "PolicyAction" NOT NULL,
    "finalText" TEXT NOT NULL,
    "rewriteCount" INTEGER NOT NULL DEFAULT 0,
    "latencyMsMentor" INTEGER,
    "latencyMsValidator" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInteractionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIInteractionAudit_userId_problemId_createdAt_idx" ON "AIInteractionAudit"("userId", "problemId", "createdAt");

-- CreateIndex
CREATE INDEX "AIInteractionAudit_problemId_createdAt_idx" ON "AIInteractionAudit"("problemId", "createdAt");

-- AddForeignKey
ALTER TABLE "AIInteractionAudit" ADD CONSTRAINT "AIInteractionAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInteractionAudit" ADD CONSTRAINT "AIInteractionAudit_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInteractionAudit" ADD CONSTRAINT "AIInteractionAudit_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "SubmissionAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
