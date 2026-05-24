-- Add aiEnabled flag to Assignment.
-- When false the AI Mentor is blocked for that assignment.
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "aiEnabled" BOOLEAN NOT NULL DEFAULT true;
