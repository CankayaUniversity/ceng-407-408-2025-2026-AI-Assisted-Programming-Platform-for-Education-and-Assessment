import { z } from "zod";

// ── Auth ──────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email:    z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z.object({
  name:     z.string().min(1, "Name is required"),
  email:    z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role:     z.enum(["student", "teacher"]).default("student"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// ── Problems ─────────────────────────────────────────────────────────────────

export const testCaseSchema = z.object({
  input:          z.string(),
  expectedOutput: z.string(),
  isHidden:       z.boolean().default(false),
});

export const problemSchema = z.object({
  title:             z.string().min(1, "Title is required"),
  description:       z.string().min(1, "Description is required"),
  difficulty:        z.enum(["Easy", "Medium", "Hard"]).optional(),
  language:          z.string().default("python"),
  category:          z.string().optional().nullable(),
  starterCode:       z.string().optional().nullable(),
  referenceSolution: z.string().optional().nullable(),
  tags:              z.array(z.string()).optional().default([]),
  testCases:         z.array(testCaseSchema).optional().default([]),
});

// ── Code Execution ────────────────────────────────────────────────────────────

export const executeSchema = z.object({
  sourceCode: z.string().min(1, "Source code is required"),
  language:   z.string().optional(),
  languageId: z.number().int().optional(),
  problemId:  z.number().int().optional(),
  stdin:      z.string().optional().default(""),
  files:      z.array(z.object({
    name:    z.string().min(1),
    content: z.string(),
  })).optional(),
});

// ── AI Mentor ─────────────────────────────────────────────────────────────────

export const aiChatSchema = z.object({
  problemId:          z.number().int().optional(),
  submissionId:       z.number().int().optional(),
  problemDescription: z.string().optional().nullable(),
  assignmentText:     z.string().optional().nullable(),
  studentCode:        z.string().optional().nullable(),
  errorMessage:       z.string().optional().nullable(),
  studentQuestion:    z.string().optional().nullable(),
  runStatus:          z.string().optional().nullable(),
  stdout:             z.string().optional().nullable(),
  stderr:             z.string().optional().nullable(),
  language:           z.string().optional().nullable(),
  mode:               z.string().optional().nullable(),
  hintLevel:          z.number().int().optional().nullable(),
});

// ── Assignments ───────────────────────────────────────────────────────────────

export const assignmentSchema = z.object({
  problemId:  z.number().int({ message: "problemId must be an integer" }),
  title:      z.string().optional().nullable(),
  mode:       z.enum(["practice", "homework", "exam"]).default("homework"),
  deadline:   z.string().datetime({ offset: true }).optional().nullable(),
  aiEnabled:  z.boolean().default(true),
});

export const assignmentUpdateSchema = z.object({
  title:     z.string().optional().nullable(),
  mode:      z.enum(["practice", "homework", "exam"]).optional(),
  deadline:  z.string().datetime({ offset: true }).optional().nullable(),
  aiEnabled: z.boolean().optional(),
});

export const enrollSchema = z.object({
  studentIds: z.array(z.number().int()).optional(),
  all:        z.boolean().optional(),
});

// ── Rubric ────────────────────────────────────────────────────────────────────

export const rubricCriterionSchema = z.object({
  name:         z.string().min(1),
  description:  z.string().min(1),
  maxScore:     z.number().int().min(1).max(100),
  scoringGuide: z.string().optional().default(""),
});

export const rubricSchema = z.object({
  criteria:     z.array(rubricCriterionSchema).min(1),
  gradingNotes: z.string().optional().default(""),
});

// ── Grade ─────────────────────────────────────────────────────────────────────

export const gradeSchema = z.object({
  submissionId:     z.number().int(),
  rubricId:         z.number().int().optional().nullable(),
  score:            z.number().min(0).max(100),
  maxScore:         z.number().min(1).default(100),
  feedback:         z.string().optional().nullable(),
  aiSuggestedScore: z.number().min(0).max(100).optional().nullable(),
  aiScoreDetails:   z.any().optional().nullable(),
});

export const gradeUpdateSchema = z.object({
  score:    z.number().min(0).max(100).optional(),
  maxScore: z.number().min(1).optional(),
  feedback: z.string().optional().nullable(),
});

// ── Variation ─────────────────────────────────────────────────────────────────

export const variationGenerateSchema = z.object({
  problemId: z.number().int().positive(),
  type:      z.enum(["easier", "similar", "harder"]),
});

export const rubricSaveSchema = z.object({
  title:    z.string().optional(),
  criteria: z.array(rubricCriterionSchema).min(1),
});

// ── Exam mode ─────────────────────────────────────────────────────────────────

export const examModeSchema = z.object({
  enabled:  z.boolean(),
  groupIds: z.array(z.number().int()).optional().default([]),
});
