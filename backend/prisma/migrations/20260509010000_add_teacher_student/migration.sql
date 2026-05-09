-- TeacherStudent: admin assigns each student to exactly one teacher.
-- Non-admin teachers see only their assigned students.
-- Admin sees all students and can reassign.

CREATE TABLE "TeacherStudent" (
    "id"         SERIAL          NOT NULL,
    "teacherId"  INTEGER         NOT NULL,
    "studentId"  INTEGER         NOT NULL,
    "assignedAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherStudent_pkey"      PRIMARY KEY ("id"),
    CONSTRAINT "TeacherStudent_studentId_key" UNIQUE ("studentId")
);

CREATE INDEX "TeacherStudent_teacherId_idx" ON "TeacherStudent"("teacherId");

ALTER TABLE "TeacherStudent"
    ADD CONSTRAINT "TeacherStudent_teacherId_fkey"
        FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "TeacherStudent_studentId_fkey"
        FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
