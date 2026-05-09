-- Add exam scheduling fields to Assignment table.
-- examType: "scheduled" (has startDate + dueDate window) or "unscheduled" (only dueDate)
-- startDate: when a scheduled exam becomes accessible to students

ALTER TABLE "Assignment"
  ADD COLUMN IF NOT EXISTS "examType"  TEXT,
  ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
