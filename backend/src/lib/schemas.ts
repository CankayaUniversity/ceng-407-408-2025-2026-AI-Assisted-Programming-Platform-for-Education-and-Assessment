import { z } from "zod";

// ── Auth ──────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email:    z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z.object({
  name:      z.string().min(1, "Name is required"),
  email:     z.string().email("Invalid email address"),
  password:  z.string().min(6, "Password must be at least 6 characters"),
  role:      z.enum(["student", "teacher"]).default("student"),
  classYear: z.number().int().min(1).max(5).optional().nullable(), // students only; 1–4 = year, 5 = graduate
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

const VALID_RUN_STATUSES = [
  "idle",
  "accepted",
  "wrong_answer",
  "runtime_error",
  "run_success",          // interactive terminal: exit code 0, no judge verdict
  "compile_error",
  "time_limit_exceeded",
  "memory_limit_exceeded",
  "presentation_error",
] as const;

const VALID_CHAT_MODES = ["practice", "hint", "tip", "mentor"] as const;

export const aiChatSchema = z.object({
  problemId:          z.number().int().optional(),
  submissionId:       z.number().int().optional(),
  problemDescription: z.string().max(10_000).optional().nullable(),
  assignmentText:     z.string().max(10_000).optional().nullable(),
  // 50 000 chars ≈ ~1 250 lines — generous but bounded
  studentCode:        z.string().max(50_000).optional().nullable(),
  errorMessage:       z.string().max(2_000).optional().nullable(),
  studentQuestion:    z.string().max(2_000).optional().nullable(),
  // Only accept known status strings to prevent prompt injection via this field
  runStatus:          z.enum(VALID_RUN_STATUSES).optional().nullable(),
  stdout:             z.string().max(2_000).optional().nullable(),
  stderr:             z.string().max(2_000).optional().nullable(),
  language:           z.string().max(50).optional().nullable(),
  // Only accept known chat modes
  mode:               z.enum(VALID_CHAT_MODES).optional().nullable(),
  hintLevel:          z.number().int().min(0).max(10).optional().nullable(),
  // Conversation history — last N turns injected into the mentor prompt so the
  // model can build on previous exchanges instead of answering from scratch each time.
  // Capped at 20 entries (10 turns) with 2 000-char per message to bound prompt size.
  conversationHistory: z.array(
    z.object({
      role:    z.enum(["user", "assistant"]),
      content: z.string().max(2_000),
    }),
  ).max(20).optional().nullable(),

  // ── Editor context (Phase 2 — adopted from feature/ai) ─────────────────────
  // Lets the mentor reference the exact file, line, and code window the
  // student is looking at right now. All three are optional; if absent, the
  // mentor falls back to the bigger studentCode field.
  activeFileName:      z.string().max(200).optional().nullable(),
  activeLineNumber:    z.number().int().positive().optional().nullable(),
  // Up to ~50 lines of code around the cursor. Frontend should prefix the
  // focused line with "> " so the quality-check module (mentorQuality.ts) can
  // detect when a reply ignored that line.
  selectedCodeContext: z.string().max(4_000).optional().nullable(),

  // ── Locale (Phase 4 — bilingual support) ───────────────────────────────────
  // "en" (default) or "tr" — controls reply language and fallback wording.
  mentorLocale:        z.enum(["en", "tr"]).optional().nullable(),
});

// ── Assignments ───────────────────────────────────────────────────────────────

export const assignmentSchema = z.object({
  problemId:   z.number().int({ message: "problemId must be an integer" }),
  title:       z.string().optional().nullable(),
  mode:        z.enum(["practice", "homework", "exam"]).default("homework"),
  deadline:    z.string().datetime({ offset: true }).optional().nullable(),
  aiEnabled:   z.boolean().default(true),
  description: z.string().max(5_000).optional().nullable(),
});

export const assignmentUpdateSchema = z.object({
  title:       z.string().optional().nullable(),
  mode:        z.enum(["practice", "homework", "exam"]).optional(),
  deadline:    z.string().datetime({ offset: true }).optional().nullable(),
  aiEnabled:   z.boolean().optional(),
  description: z.string().max(5_000).optional().nullable(),
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
