-- CreateEnum
CREATE TYPE "VariationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "Assignment" (
    "id"          SERIAL NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "problemId"   INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "dueDate"     TIMESTAMP(3),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentEnrollment" (
    "id"           SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "userId"       INTEGER NOT NULL,
    "enrolledAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rubric" (
    "id"          SERIAL NOT NULL,
    "problemId"   INTEGER NOT NULL,
    "title"       TEXT NOT NULL DEFAULT 'Default Rubric',
    "criteria"    JSONB NOT NULL,
    "totalPoints" INTEGER NOT NULL DEFAULT 100,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id"           SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "userId"       INTEGER NOT NULL,
    "rubricId"     INTEGER,
    "score"        DOUBLE PRECISION NOT NULL,
    "maxScore"     DOUBLE PRECISION NOT NULL DEFAULT 100,
    "breakdown"    JSONB,
    "feedback"     TEXT,
    "aiSuggested"  BOOLEAN NOT NULL DEFAULT false,
    "gradedById"   INTEGER NOT NULL,
    "gradedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemVariation" (
    "id"              SERIAL NOT NULL,
    "sourceProblemId" INTEGER NOT NULL,
    "createdById"     INTEGER NOT NULL,
    "title"           TEXT NOT NULL,
    "description"     TEXT NOT NULL,
    "starterCode"     TEXT,
    "difficulty"      TEXT,
    "language"        TEXT NOT NULL,
    "status"          "VariationStatus" NOT NULL DEFAULT 'pending',
    "aiModel"         TEXT,
    "promptVersion"   TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemVariation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assignment_createdById_idx" ON "Assignment"("createdById");

-- CreateIndex
CREATE INDEX "Assignment_problemId_idx" ON "Assignment"("problemId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentEnrollment_assignmentId_userId_key" ON "AssignmentEnrollment"("assignmentId", "userId");

-- CreateIndex
CREATE INDEX "AssignmentEnrollment_userId_idx" ON "AssignmentEnrollment"("userId");

-- CreateIndex
CREATE INDEX "Rubric_problemId_idx" ON "Rubric"("problemId");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_assignmentId_userId_key" ON "Grade"("assignmentId", "userId");

-- CreateIndex
CREATE INDEX "Grade_assignmentId_idx" ON "Grade"("assignmentId");

-- CreateIndex
CREATE INDEX "Grade_userId_idx" ON "Grade"("userId");

-- CreateIndex
CREATE INDEX "ProblemVariation_sourceProblemId_idx" ON "ProblemVariation"("sourceProblemId");

-- CreateIndex
CREATE INDEX "ProblemVariation_createdById_idx" ON "ProblemVariation"("createdById");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentEnrollment" ADD CONSTRAINT "AssignmentEnrollment_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentEnrollment" ADD CONSTRAINT "AssignmentEnrollment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rubric" ADD CONSTRAINT "Rubric_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_gradedById_fkey"
    FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_rubricId_fkey"
    FOREIGN KEY ("rubricId") REFERENCES "Rubric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemVariation" ADD CONSTRAINT "ProblemVariation_sourceProblemId_fkey"
    FOREIGN KEY ("sourceProblemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemVariation" ADD CONSTRAINT "ProblemVariation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
