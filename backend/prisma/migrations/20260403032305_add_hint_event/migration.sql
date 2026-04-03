-- CreateTable
CREATE TABLE "HintEvent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "problemId" INTEGER NOT NULL,
    "attemptId" INTEGER,
    "aiLogId" INTEGER,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HintEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HintEvent_userId_problemId_createdAt_idx" ON "HintEvent"("userId", "problemId", "createdAt");

-- CreateIndex
CREATE INDEX "HintEvent_problemId_createdAt_idx" ON "HintEvent"("problemId", "createdAt");

-- AddForeignKey
ALTER TABLE "HintEvent" ADD CONSTRAINT "HintEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HintEvent" ADD CONSTRAINT "HintEvent_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HintEvent" ADD CONSTRAINT "HintEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "SubmissionAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HintEvent" ADD CONSTRAINT "HintEvent_aiLogId_fkey" FOREIGN KEY ("aiLogId") REFERENCES "AiLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
