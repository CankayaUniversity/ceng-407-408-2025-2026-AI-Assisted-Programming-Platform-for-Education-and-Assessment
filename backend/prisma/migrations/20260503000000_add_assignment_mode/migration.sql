-- Add mode column to Assignment table (practice | homework | exam)
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'homework';
