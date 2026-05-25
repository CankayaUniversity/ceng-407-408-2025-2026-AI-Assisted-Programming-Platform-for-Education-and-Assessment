-- AI-suggested test cases stored on the variation row. Each entry has
-- { input, expectedOutput, isHidden }. expectedOutput is captured from
-- running the reference solution on the AI-supplied input — never from
-- the AI's claimed output — so arithmetic hallucinations cannot corrupt
-- the grading pipeline.

ALTER TABLE "ProblemVariation"
  ADD COLUMN "generatedTestCases" JSONB;
