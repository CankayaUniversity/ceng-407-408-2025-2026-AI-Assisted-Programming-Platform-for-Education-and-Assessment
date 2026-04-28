-- CreateTable: Flashcard
-- AI-generated feedback cards shown to a student after a correct submission.

CREATE TABLE "Flashcard" (
    "id"           SERIAL       NOT NULL,
    "userId"       INTEGER      NOT NULL,
    "problemId"    INTEGER      NOT NULL,
    "submissionId" INTEGER      NOT NULL,
    "cards"        JSONB        NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flashcard_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "Flashcard_userId_problemId_idx" ON "Flashcard"("userId", "problemId");
CREATE INDEX "Flashcard_submissionId_idx"     ON "Flashcard"("submissionId");

-- Foreign keys
ALTER TABLE "Flashcard"
    ADD CONSTRAINT "Flashcard_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Flashcard"
    ADD CONSTRAINT "Flashcard_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
