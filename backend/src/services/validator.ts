// ── Validator ─────────────────────────────────────────────────────────────────
//
// Two-stage validation of mentor replies:
//
//   Stage 1 — heuristic (fast, free):
//     • Banned "solution giveaway" phrases.
//     • Fenced code block ≥ 10 non-empty lines, or ≥ 3 separate fenced blocks.
//   Heuristic verdict is the floor: if it blocks, we always block.
//
//   Stage 2 — AI validator (Tutor/Student simulation, per Architecture §2.2):
//     A small fast model (qwen2.5:3b-instruct) decides whether the mentor's
//     reply could be turned into a working solution without thinking.
//     Output is a strict JSON verdict — never a rewrite — so the mentor's
//     response is either passed through unchanged or replaced by the same
//     SAFE_HINT used by the heuristic path. The AI cannot mangle the response.
//
//   Skip rules — stage 2 is skipped (cost optimisation, no spec impact) when:
//     • Heuristic already blocked     (no point double-checking a block)
//     • Reply is under 80 chars       (too short to leak meaningfully)
//     • OLLAMA_VALIDATOR_MODEL is set to "validator-heuristic" (explicit opt-out)
//     • Reply has no code fence AND no code-like lines AND mode !== "hint"
//
//   Failsafe — stage 2 errors / timeouts fall back to the heuristic verdict
//   so the validator can only ever INCREASE strictness, never decrease it.

export type ValidatorDecision = "allow" | "block";

export type ValidatorAiVerdict = {
  verdict: "safe" | "leak";
  reason:  string;
};

export type ValidatorResult = {
  riskScore:  number;
  decision:   ValidatorDecision;
  violations: string[];
  reason:     string;
  source:     "heuristic" | "heuristic+ai";
  /** AI verdict, when we ran the AI validator. null on skip / failure. */
  aiVerdict?:    ValidatorAiVerdict | null;
  /** Wall-clock latency for the AI call only, in ms. Omitted when skipped. */
  aiLatencyMs?:  number;
  /** True if the AI call ran but failed/timed out (verdict null but call attempted). */
  aiFailed?:     boolean;
};

export type ValidateInput = {
  studentQuestion: string;
  mentorReply:     string;
  runStatus?:      string;
  /** Assignment / problem description. Used by the AI validator to reason
   *  about leakage relative to the specific problem the student is solving. */
  assignmentText?: string | null;
  /** Chat mode — "hint" mode always triggers AI validation (highest leak risk). */
  mode?:           string | null;
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

function countCodeLikeLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) =>
      /^(def |class |function |const |let |var |if\b|for\b|while\b|return\b|print\(|input\(|console\.log\(|\w+\s*=\s*.+)/.test(l),
    ).length;
}

// ── Stage 1: heuristic ────────────────────────────────────────────────────────

function heuristicValidate(input: ValidateInput): ValidatorResult {
  const reply      = normalize(input.mentorReply);
  const lowerReply = reply.toLowerCase();
  const violations: string[] = [];

  if (BANNED_PHRASES.some((p) => lowerReply.includes(p))) {
    violations.push("explicit_solution_language");
  }

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
    reason:     "Heuristic checks passed.",
    source:     "heuristic",
  };
}

// ── Stage 2: AI validator ─────────────────────────────────────────────────────

const HEURISTIC_ONLY_SENTINEL = "validator-heuristic";
const AI_VALIDATOR_TIMEOUT_MS = 8_000;

/**
 * Returns the configured AI validator model, or `null` if the AI validator is
 * explicitly disabled. Default model is qwen2.5:3b-instruct (pulled by
 * the ollama-init container in the main docker-compose).
 */
function getAiValidatorModel(): string | null {
  const model = process.env.OLLAMA_VALIDATOR_MODEL ?? "qwen2.5:3b-instruct";
  if (!model || model === HEURISTIC_ONLY_SENTINEL) return null;
  return model;
}

function getOllamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
}

/**
 * Decide whether the AI validator is worth calling for this reply.
 * Skips the AI call when the reply has no realistic leak risk.
 */
function shouldRunAiValidator(input: ValidateInput): boolean {
  const reply = normalize(input.mentorReply);
  if (reply.length < 80) return false;

  // Hint mode is always validated — highest leak surface in the system.
  if (normalize(input.mode).toLowerCase() === "hint") return true;

  // Any fenced code block triggers validation, regardless of length —
  // even short blocks can be the entire "trick" of the problem.
  if (reply.includes("```")) return true;

  // 3+ code-like lines without a fence — the model might be smuggling
  // a solution outside a fenced block.
  if (countCodeLikeLines(reply) >= 3) return true;

  return false;
}

/**
 * Anchored prompt for the small validator model.
 *
 * Design notes:
 *   • Examples placed BEFORE the verdict format so the model's last instruction
 *     is the strict JSON output requirement.
 *   • Both sides (leak vs safe) given explicit positive examples to avoid
 *     over-blocking — the previous attempt failed because there were no
 *     positive examples of acceptable hints, so the validator flagged
 *     anything that mentioned the problem domain.
 *   • Truncation guards: 1 500 chars of assignment, 2 000 chars of reply.
 *     Anything longer doesn't add useful signal and just costs latency.
 */
function buildValidatorPrompt(input: ValidateInput): string {
  const assignment = (input.assignmentText ?? "").trim().slice(0, 1500) || "(not provided)";
  const reply      = input.mentorReply.trim().slice(0, 2000);

  return `You are an academic-integrity checker for an AI programming mentor.

The mentor must GUIDE students without giving them the answer. Your job is to decide whether the mentor's reply LEAKS the solution.

[PROBLEM]
${assignment}

[MENTOR REPLY]
${reply}

LEAK = the reply contains ANY of:
  - Copy-paste-ready code that solves the [PROBLEM]
  - The specific recurrence, formula, or equation that solves it (e.g. "dp[i] = min(dp[i-coin])+1")
  - A step-by-step algorithm that, if followed, produces the solution to THIS specific [PROBLEM]
  - Naming a specific algorithm or data structure AND explaining how to apply it to [PROBLEM]

SAFE = the reply contains ONLY:
  - Socratic questions ("What happens if the input is empty?", "How would you handle one element?")
  - Concept explanations that are NOT directly applied to [PROBLEM]
  - Pseudocode for an UNRELATED illustrative example (e.g. running maximum of a list, when the actual problem is about coin change)
  - Pointing out a specific bug in the student's existing code without writing the corrected line
  - A refusal to give the full answer
  - General language-syntax help (how to read input, how to declare a variable)

When in doubt, prefer "safe" — false positives hurt students who deserved a real hint.

Respond with ONLY one of these JSON objects, no other text:
{"verdict":"leak","reason":"<5-10 words>"}
{"verdict":"safe","reason":"<5-10 words>"}`;
}

/**
 * Call Ollama for an AI verdict. Returns `null` on any failure (network,
 * timeout, malformed response) so the caller can fall back to the heuristic.
 */
async function aiValidate(
  input: ValidateInput,
  model: string,
): Promise<ValidatorAiVerdict | null> {
  const url        = `${getOllamaBaseUrl()}/api/generate`;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), AI_VALIDATOR_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        model,
        prompt:     buildValidatorPrompt(input),
        stream:     false,
        keep_alive: -1,
        format:     "json",       // Ollama JSON mode — guarantees valid JSON
        options: {
          temperature: 0,
          top_p:       1,
          num_ctx:     4096,
          num_predict: 64,        // tight cap — verdict is one short JSON
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const data    = (await res.json()) as { response?: string };
    const rawText = (data.response ?? "").trim();
    if (!rawText) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return null;
    }

    const verdict = parsed.verdict;
    const reason  = parsed.reason;
    if (verdict !== "leak" && verdict !== "safe") return null;

    return {
      verdict,
      reason: typeof reason === "string" ? reason.slice(0, 200) : "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Two-stage validator. Returns the combined verdict.
 * Never throws — failures degrade gracefully to the heuristic verdict.
 */
export async function validateMentorReply(input: ValidateInput): Promise<ValidatorResult> {
  const heuristic = heuristicValidate(input);

  // Floor: if heuristic blocks, we block. No AI call needed.
  if (heuristic.decision === "block") {
    return heuristic;
  }

  // AI validator disabled by config?
  const model = getAiValidatorModel();
  if (!model) {
    return heuristic;
  }

  // Skip rules — no point spending latency on replies with no leak surface.
  if (!shouldRunAiValidator(input)) {
    return heuristic;
  }

  const t0          = Date.now();
  const aiVerdict   = await aiValidate(input, model);
  const aiLatencyMs = Date.now() - t0;

  // AI call failed / timed out → keep heuristic verdict (failsafe).
  if (!aiVerdict) {
    return {
      ...heuristic,
      source:      "heuristic+ai",
      aiVerdict:   null,
      aiLatencyMs,
      aiFailed:    true,
      reason:      "Heuristic checks passed; AI validator unavailable.",
    };
  }

  // AI says leak → block (override heuristic's "allow").
  if (aiVerdict.verdict === "leak") {
    return {
      riskScore:   0.95,
      decision:    "block",
      violations:  [...heuristic.violations, "ai_validator_leak"],
      reason:      `AI validator flagged leak: ${aiVerdict.reason || "no reason given"}`,
      source:      "heuristic+ai",
      aiVerdict,
      aiLatencyMs,
    };
  }

  // Both stages agree the reply is safe.
  return {
    ...heuristic,
    source:      "heuristic+ai",
    reason:      "Heuristic + AI validator both passed.",
    aiVerdict,
    aiLatencyMs,
  };
}
