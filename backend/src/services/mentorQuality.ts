export type MentorConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MentorQualityInput = {
  reply: string;
  studentQuestion?: string | null;
  selectedCodeContext?: string | null;
  stderr?: string | null;
  errorMessage?: string | null;
  conversationHistory?: MentorConversationMessage[] | null;
};

export type MentorQualityResult = {
  ok: boolean;
  reasons: string[];
};

const GENERIC_PATTERNS = [
  /let'?s focus on your question/i,
  /i can help with (the )?(concept|syntax|next step)/i,
  /tell me the exact line or behavior/i,
  /show me the exact part/i,
  /i can give a focused hint or a tiny example/i,
  /i need the exact error text/i,
];

const TRANSCRIPT_PATTERNS = [
  /\bAI response\s*:/i,
  /\bUser message\s*:/i,
  /\bStudent message\s*:/i,
  /\bAssistant\s*:/i,
  /\bMentor reply\s*:/i,
];

function normalizeForSimilarity(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/`[^`]*`/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .filter(
      (token) =>
        ![
          "the",
          "and",
          "you",
          "your",
          "that",
          "this",
          "with",
          "for",
          "can",
          "but",
          "not",
          "line",
          "code",
        ].includes(token),
    );
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

function lastAssistantReplies(history: MentorConversationMessage[] | null | undefined): string[] {
  return (history ?? [])
    .filter((message) => message.role === "assistant" && message.content.trim())
    .slice(-3)
    .map((message) => message.content.trim());
}

function echoesQuestion(reply: string, question: string): boolean {
  const quotedQuestion = new RegExp(question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (question.length >= 12 && quotedQuestion.test(reply)) return true;
  return jaccardSimilarity(reply, question) >= 0.82 && reply.length < question.length + 80;
}

function mentionsFocusedContext(reply: string, selectedCodeContext?: string | null): boolean {
  const context = selectedCodeContext ?? "";
  if (!context.trim()) return true;

  const focusedLine = context
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith(">"))
    ?.replace(/^>\s*\d+:\s*/, "")
    .trim();

  if (!focusedLine || focusedLine.length < 3) return true;

  const firstIdentifier = focusedLine.match(/[A-Za-z_][A-Za-z0-9_]*/)?.[0];
  if (!firstIdentifier) return true;

  return reply.toLowerCase().includes(firstIdentifier.toLowerCase()) || /\bline\s+\d+/i.test(reply);
}

function questionRefersToEditor(question: string): boolean {
  const explicitEditorReference =
    /\b(editor|my code|code|line|cursor|error|compile|runtime|output|look at|take a look|check|inspect|debug)\b/i.test(
      question,
    );
  const contextualPointer =
    /\b(this|here)\b/i.test(question) && /\b(code|line|error|output|editor)\b/i.test(question);

  return explicitEditorReference || contextualPointer;
}

// Detect whether a reply is Socratic — ends with a question that prompts
// thinking, OR contains a precise concept/line pointer rather than just a
// declarative explanation. A mentor reply lacking BOTH is a lecture, not a
// guided question.
function isSocratic(reply: string): boolean {
  const trimmed = reply.trim();
  if (!trimmed) return false;
  // Easy positive: ends with a question mark.
  if (/[?]\s*$/.test(trimmed)) return true;
  if (/[?]\s*[\)\]"']*\s*$/.test(trimmed)) return true;
  // Question mark anywhere in the last 40 chars (handles trailing emoji etc.)
  if (trimmed.slice(-40).includes("?")) return true;
  // Concept-pointer phrasing — "consider X", "think about X", "look at line N"
  if (
    /\b(consider|think about|notice|look at|focus on|check|examine|ask yourself|inspect|trace through)\b/i.test(trimmed) ||
    /\bline\s+\d+\b/i.test(trimmed) ||
    // Turkish equivalents
    /\b(düşün|incele|bak|kontrol et|dikkat et)\b/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

// Detect un-asked-for code blocks. A mentor reply with a code block when the
// student didn't ask for one is a quality smell.
function hasUnsolicitedCodeBlock(reply: string, question: string): boolean {
  const hasFence = /```/.test(reply);
  if (!hasFence) return false;
  const asksForCode =
    /\b(example|show me|pseudo[-\s]?code|snippet|how would.*look|nasıl yaz|örnek|sözde\s*kod|göster)\b/i.test(
      question,
    );
  return !asksForCode;
}

export function assessMentorReply(input: MentorQualityInput): MentorQualityResult {
  const reply = input.reply.trim();
  const question = (input.studentQuestion ?? "").trim();
  const hasErrorContext = Boolean((input.stderr || input.errorMessage || "").trim());
  const reasons: string[] = [];

  if (!reply) reasons.push("empty");
  if (TRANSCRIPT_PATTERNS.some((pattern) => pattern.test(reply))) reasons.push("transcript_artifact");

  const genericHits = GENERIC_PATTERNS.filter((pattern) => pattern.test(reply)).length;
  if (genericHits >= 2) reasons.push("generic_fallback");

  if (question && echoesQuestion(reply, question)) reasons.push("echoes_question");

  for (const previous of lastAssistantReplies(input.conversationHistory)) {
    if (jaccardSimilarity(reply, previous) >= 0.72) {
      reasons.push("repeats_previous_reply");
      break;
    }
  }

  if (hasErrorContext && /error|compile|runtime|exception|traceback|stderr/i.test(question)) {
    const firstErrorWord = (input.stderr || input.errorMessage || "")
      .match(/[A-Za-z_][A-Za-z0-9_]*(Error|Exception)?|expected|undefined|Traceback/i)?.[0];
    if (firstErrorWord && !reply.toLowerCase().includes(firstErrorWord.toLowerCase())) {
      reasons.push("ignores_error_context");
    }
  }

  if (questionRefersToEditor(question) && !mentionsFocusedContext(reply, input.selectedCodeContext)) {
    reasons.push("ignores_focused_line");
  }

  // ── Socratic check ─────────────────────────────────────────────────────
  // For substantive replies (not greetings/meta), require a question or a
  // concept pointer. A pure declarative explanation is a lecture, not
  // mentorship.
  if (reply.length > 80 && !isSocratic(reply)) {
    reasons.push("non_socratic_declarative");
  }

  // ── Unsolicited code block ─────────────────────────────────────────────
  if (hasUnsolicitedCodeBlock(reply, question)) {
    reasons.push("unsolicited_code_block");
  }

  return { ok: reasons.length === 0, reasons };
}

export function isProbablyRepetitive(input: MentorQualityInput): boolean {
  return assessMentorReply(input).reasons.some((reason) =>
    ["generic_fallback", "echoes_question", "repeats_previous_reply"].includes(reason),
  );
}
