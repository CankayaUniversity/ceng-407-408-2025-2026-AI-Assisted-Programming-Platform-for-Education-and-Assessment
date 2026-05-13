/**
 * Post-generation quality assessment for mentor replies.
 *
 * Runs AFTER the validator has decided "allow" — this layer is a final
 * guardrail against replies that are technically safe (no solution leak) but
 * still pedagogically poor: echoing the student's question, repeating a
 * previous reply, hitting generic-fallback phrasings, or ignoring the error /
 * focused code that the student explicitly asked about.
 *
 * Adapted from the feature/ai branch's mentorQuality.ts (commit a7459b3).
 * The detection logic is unchanged; only the stop-list and integration
 * points differ from upstream.
 */

export type MentorConversationMessage = {
  role:    "user" | "assistant";
  content: string;
};

export type MentorQualityInput = {
  reply:                string;
  studentQuestion?:     string | null;
  selectedCodeContext?: string | null;
  stderr?:              string | null;
  errorMessage?:        string | null;
  conversationHistory?: MentorConversationMessage[] | null;
};

export type MentorQualityResult = {
  ok:      boolean;
  reasons: string[];
};

/** Phrases that signal the model has fallen back to a non-specific stock answer. */
const GENERIC_PATTERNS: RegExp[] = [
  /let'?s focus on your question/i,
  /i can help with (the )?(concept|syntax|next step)/i,
  /tell me the exact line or behavior/i,
  /show me the exact part/i,
  /i can give a focused hint or a tiny example/i,
  /i need the exact error text/i,
];

/** Code-generating models sometimes leak the structural transcript labels. */
const TRANSCRIPT_PATTERNS: RegExp[] = [
  /\bAI response\s*:/i,
  /\bUser message\s*:/i,
  /\bStudent message\s*:/i,
  /\bAssistant\s*:/i,
  /\bMentor reply\s*:/i,
];

/** Stop-words for Jaccard similarity — common English filler. */
const SIMILARITY_STOPWORDS = new Set([
  "the", "and", "you", "your", "that", "this", "with",
  "for", "can", "but", "not", "line", "code",
]);

function normalizeForSimilarity(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/`[^`]*`/g, " ")        // strip backticked code spans
    .replace(/[^a-z0-9]+/g, " ")     // strip punctuation
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !SIMILARITY_STOPWORDS.has(token));
}

function jaccardSimilarity(a: string, b: string): number {
  const aSet = new Set(normalizeForSimilarity(a));
  const bSet = new Set(normalizeForSimilarity(b));
  if (aSet.size === 0 || bSet.size === 0) return 0;

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection++;
  }
  const union = aSet.size + bSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function lastAssistantReplies(
  history: MentorConversationMessage[] | null | undefined,
): string[] {
  return (history ?? [])
    .filter((m) => m.role === "assistant" && m.content.trim())
    .slice(-3)
    .map((m) => m.content.trim());
}

function echoesQuestion(reply: string, question: string): boolean {
  if (question.length >= 12) {
    const escaped = question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(escaped, "i").test(reply)) return true;
  }
  // High Jaccard similarity AND reply length not much greater than question →
  // the mentor restated the question with minor padding.
  return jaccardSimilarity(reply, question) >= 0.82
      && reply.length < question.length + 80;
}

/** Pull the focused-line identifier from the `>`-prefixed line in selectedCodeContext. */
function mentionsFocusedContext(
  reply: string,
  selectedCodeContext?: string | null,
): boolean {
  const context = selectedCodeContext ?? "";
  if (!context.trim()) return true; // no focused line → nothing to ignore

  const focusedLine = context
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(">"))
    ?.replace(/^>\s*\d+:\s*/, "")
    .trim();

  if (!focusedLine || focusedLine.length < 3) return true;

  const firstIdentifier = focusedLine.match(/[A-Za-z_][A-Za-z0-9_]*/)?.[0];
  if (!firstIdentifier) return true;

  return reply.toLowerCase().includes(firstIdentifier.toLowerCase())
      || /\bline\s+\d+/i.test(reply);
}

function questionRefersToEditor(question: string): boolean {
  const explicitEditorReference =
    /\b(editor|my code|code|line|cursor|error|compile|runtime|output|look at|take a look|check|inspect|debug)\b/i
      .test(question);
  const contextualPointer =
    /\b(this|here)\b/i.test(question)
    && /\b(code|line|error|output|editor)\b/i.test(question);
  return explicitEditorReference || contextualPointer;
}

/**
 * Inspect a mentor reply against the original request context.
 * Returns `{ ok: false, reasons: [...] }` when the reply has a quality issue
 * that warrants replacing it with a context-aware deflection.
 */
export function assessMentorReply(input: MentorQualityInput): MentorQualityResult {
  const reply           = input.reply.trim();
  const question        = (input.studentQuestion ?? "").trim();
  const hasErrorContext = Boolean((input.stderr || input.errorMessage || "").trim());
  const reasons: string[] = [];

  if (!reply) {
    reasons.push("empty");
  }

  if (TRANSCRIPT_PATTERNS.some((p) => p.test(reply))) {
    reasons.push("transcript_artifact");
  }

  // ≥2 generic patterns = the model defaulted to stock guidance.
  const genericHits = GENERIC_PATTERNS.filter((p) => p.test(reply)).length;
  if (genericHits >= 2) {
    reasons.push("generic_fallback");
  }

  if (question && echoesQuestion(reply, question)) {
    reasons.push("echoes_question");
  }

  for (const previous of lastAssistantReplies(input.conversationHistory)) {
    if (jaccardSimilarity(reply, previous) >= 0.72) {
      reasons.push("repeats_previous_reply");
      break;
    }
  }

  // Student asked about an error/exception/traceback but reply mentions no
  // token from the actual error output → ignored the error.
  if (hasErrorContext
      && /error|compile|runtime|exception|traceback|stderr/i.test(question)) {
    const firstErrorWord = (input.stderr || input.errorMessage || "")
      .match(/[A-Za-z_][A-Za-z0-9_]*(Error|Exception)?|expected|undefined|Traceback/i)?.[0];
    if (firstErrorWord
        && !reply.toLowerCase().includes(firstErrorWord.toLowerCase())) {
      reasons.push("ignores_error_context");
    }
  }

  // Student pointed at editor/code/line but reply doesn't reference the
  // focused line's first identifier or any "line N" phrasing.
  if (questionRefersToEditor(question)
      && !mentionsFocusedContext(reply, input.selectedCodeContext)) {
    reasons.push("ignores_focused_line");
  }

  return { ok: reasons.length === 0, reasons };
}

/** Helper for callers that only want a boolean. */
export function isProbablyRepetitive(input: MentorQualityInput): boolean {
  return assessMentorReply(input).reasons.some((r) =>
    ["generic_fallback", "echoes_question", "repeats_previous_reply"].includes(r),
  );
}
