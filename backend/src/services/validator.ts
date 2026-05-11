// ── Validator ─────────────────────────────────────────────────────────────────
//
// Option A: pure heuristic — no second LLM call.
//
// Only two high-confidence BLOCK conditions:
//   1. Banned "solution giveaway" phrases in the reply text.
//   2. A fenced code block with ≥ 10 non-empty lines (complete function / class)
//      OR ≥ 3 separate fenced blocks (gives away the whole structure).
//
// Everything else is ALLOW.  No "rewrite" outcome — rewrites produced generic
// 3-sentence responses that were worse than the original, and a 3 billion-param
// model running a second Ollama call added ~10 s of latency per turn.

export type ValidatorDecision = "allow" | "block";

export type ValidatorResult = {
  riskScore:  number;
  decision:   ValidatorDecision;
  violations: string[];
  reason:     string;
  source:     "heuristic";
};

export type ValidateInput = {
  studentQuestion: string;
  mentorReply:     string;
  runStatus?:      string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim();
}

// Phrases that unambiguously signal "I am handing you the finished answer."
// Keep the list short and HIGH-confidence — do not add borderline cases.
const BANNED_PHRASES = [
  "complete solution",
  "full solution",
  "full code",
  "copy and paste",
  "submit this",
  "use this exact code",
  "here is the corrected version",
  "here's the corrected version",
  "your code should look like",
  "final code",
  "here is the solution",
  "here's the solution",
  "the answer is",
] as const;

/**
 * Count fenced code blocks (``` … ```) and find the largest one.
 * We measure non-empty lines inside the fence because whitespace-only
 * lines are just formatting.
 */
function countFencedCodeBlocks(text: string): {
  blockCount:    number;
  maxBlockLines: number;
} {
  const fenceRe = /```(?:\w+)?\r?\n([\s\S]*?)```/g;
  let blockCount    = 0;
  let maxBlockLines = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRe.exec(text)) !== null) {
    blockCount++;
    const nonEmptyLines = match[1]
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0).length;
    if (nonEmptyLines > maxBlockLines) maxBlockLines = nonEmptyLines;
  }

  return { blockCount, maxBlockLines };
}

// ── Core heuristic ─────────────────────────────────────────────────────────

function heuristicValidate(input: ValidateInput): ValidatorResult {
  const reply      = normalize(input.mentorReply);
  const lowerReply = reply.toLowerCase();
  const violations: string[] = [];

  // Check 1 — explicit solution language
  if (BANNED_PHRASES.some((p) => lowerReply.includes(p))) {
    violations.push("explicit_solution_language");
  }

  // Check 2 — large or numerous fenced code blocks
  const { blockCount, maxBlockLines } = countFencedCodeBlocks(reply);
  if (maxBlockLines >= 10 || blockCount >= 3) {
    violations.push("large_code_block");
  }

  if (violations.length > 0) {
    return {
      riskScore:  0.92,
      decision:   "block",
      violations,
      reason:     "Reply discloses too much of the solution.",
      source:     "heuristic",
    };
  }

  return {
    riskScore:  0.05,
    decision:   "allow",
    violations: [],
    reason:     "Response is acceptable.",
    source:     "heuristic",
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/require-await
export async function validateMentorReply(input: ValidateInput): Promise<ValidatorResult> {
  return heuristicValidate(input);
}
