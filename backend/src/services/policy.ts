// ── Policy ────────────────────────────────────────────────────────────────────
//
// Maps the validator decision to the final text shown to the student.
//
// With Option A (heuristic-only validator) decisions are either "allow" or
// "block".  The "rewrite" path is kept in the type for API compatibility but
// will never be reached under normal conditions — it maps to the same SAFE_HINT
// as block so that any stale call sites still produce a safe result.

import type { ValidatorResult } from "./validator";
import { normalizeMentorLocale, type MentorLocale } from "./mentor";

// Strips LLM prompt delimiter markers to prevent injected text from being
// re-injected into any future retry prompts via the studentQuestion field.
const PROMPT_DELIMITER_RE =
  /\[(CODE|ASSIGNMENT|STUDENT_MESSAGE|LANGUAGE|MODE|RUN_STATUS|OUTPUT|ERROR|STDERR|INSTRUCTOR|SYSTEM)\]/gi;
export function sanitizeForPrompt(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(PROMPT_DELIMITER_RE, (m) => m.replace("[", "⟦").replace("]", "⟧"));
}

export type PolicyResult = {
  action:       "allow" | "rewrite" | "block";
  finalText:    string;
  rewriteCount: number;
};

const SAFE_HINT_EN =
  "I can't give the full final solution directly, but I can still help with one next step or one specific concept. What part is giving you the most trouble right now?";

const SAFE_HINT_TR =
  "Tam final çözümü doğrudan veremem, ama bir sonraki adımda veya belirli bir kavramda yardımcı olabilirim. Şu an seni en çok ne zorluyor?";

function safeHint(locale: MentorLocale): string {
  return locale === "tr" ? SAFE_HINT_TR : SAFE_HINT_EN;
}

// ── applyPolicy (synchronous, no retry) ──────────────────────────────────────

export function applyPolicy(params: {
  mentorReply:     string;
  validator:       ValidatorResult;
  studentQuestion?: string | null;
  mentorLocale?:    unknown;
}): PolicyResult {
  const { mentorReply, validator, mentorLocale } = params;

  if (validator.decision === "allow") {
    return { action: "allow", finalText: mentorReply, rewriteCount: 0 };
  }

  const locale = normalizeMentorLocale(mentorLocale);
  // block (or legacy "rewrite" — treated the same)
  return { action: "block", finalText: safeHint(locale), rewriteCount: 0 };
}

// ── applyPolicyWithRetry (async, previously called getMentorReply) ────────────
//
// The retry path has been removed along with the AI validator.  Keeping the
// async signature so callers in ai.ts don't need a signature change.

export async function applyPolicyWithRetry(params: {
  mentorReply:      string;
  validator:        ValidatorResult;
  studentQuestion?: string | null;
  // originalInput kept in signature for backward compat; we extract
  // mentorLocale from it so the block-message is in the right language.
  originalInput?:   { mentorLocale?: unknown } | unknown;
}): Promise<PolicyResult> {
  const mentorLocale =
    params.originalInput && typeof params.originalInput === "object"
      ? (params.originalInput as { mentorLocale?: unknown }).mentorLocale
      : undefined;
  return applyPolicy({ ...params, mentorLocale });
}
