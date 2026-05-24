/**
 * flashcardService.ts
 *
 * Generates AI-powered feedback flashcards for a student after a correct submission.
 * Analyses the accepted code, ALL previous failed attempts, and the reference solution.
 *
 * Card count scales with error count:
 *   0 errors (first try) → 2 cards (improvement only)
 *   1–2 errors           → 3–4 cards
 *   3–5 errors           → 5–7 cards
 *   6+ errors            → up to 10 cards
 *
 * Each card includes:
 *   type        — "error" | "shortcoming" | "improvement"
 *   title       — max 8 words
 *   concept     — the programming concept involved (e.g. "off-by-one error", "null pointer")
 *   body        — 3–5 sentence explanation
 *   rootCause   — one sentence: why this mistake typically happens
 *   codeSnippet — optional { bad, good } showing before/after
 */

export type FlashcardType = "error" | "shortcoming" | "improvement";

export type FlashcardItem = {
  type: FlashcardType;
  title: string;
  concept: string;
  body: string;
  rootCause: string;
  codeSnippet?: {
    bad?: string;
    good?: string;
  } | null;
};

export type FailedAttempt = {
  normalizedStatus: string;
  sourceCode: string;
  stderr: string | null;
  compileOutput: string | null;
  stdout: string | null;
};

export type FlashcardInput = {
  problemTitle: string;
  problemDescription: string;
  referenceSolution: string | null;
  language: string;
  acceptedCode: string;
  failedAttempts: FailedAttempt[];
};

// ─────────────────────────────────────────────────────────────────────────────

function getOllamaUrl(): string {
  return (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "") + "/api/generate";
}

function getModelName(): string {
  return process.env.OLLAMA_MODEL ?? "ai-mentor";
}

/**
 * Compute how many cards to request based on error count.
 *
 * Ladder re-tuned to fit a VRAM-constrained 30B mentor model: every additional
 * card costs ~200-400 generated tokens, and the previous ladder (max 10) was
 * the main driver of generation timeouts. Lower counts also mean the model
 * has more "budget" per card → fewer generic / truncated cards.
 */
function targetCardCount(errorCount: number): number {
  if (errorCount === 0) return 2;
  if (errorCount <= 2)  return 3;
  if (errorCount <= 5)  return 5;
  return 7;
}

/**
 * Summarise the error pattern across all failed attempts.
 * Returns a human-readable string the AI can use to focus its feedback.
 */
function buildErrorPatternSummary(attempts: FailedAttempt[]): string {
  if (attempts.length === 0) return "No failed attempts — the student solved it on the first try.";

  const counts: Record<string, number> = {};
  for (const a of attempts) {
    counts[a.normalizedStatus] = (counts[a.normalizedStatus] ?? 0) + 1;
  }

  const lines: string[] = [`Total failed attempts: ${attempts.length}`];
  for (const [status, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${status}: ${count} time${count > 1 ? "s" : ""}`);
  }

  // Highlight the most repeated single error message (if any)
  const allErrors = attempts
    .flatMap((a) => [a.compileOutput, a.stderr].filter(Boolean) as string[])
    .map((s) => s.trim().slice(0, 120));
  if (allErrors.length > 0) {
    const errorFreq: Record<string, number> = {};
    for (const e of allErrors) errorFreq[e] = (errorFreq[e] ?? 0) + 1;
    const [topError, topCount] = Object.entries(errorFreq).sort((a, b) => b[1] - a[1])[0];
    if (topCount >= 2) {
      lines.push(`Most repeated error (${topCount}×): "${topError}"`);
    }
  }

  return lines.join("\n");
}

function buildPrompt(input: FlashcardInput): string {
  const { problemTitle, problemDescription, referenceSolution, language, acceptedCode, failedAttempts } = input;
  const cardCount = targetCardCount(failedAttempts.length);
  const errorSummary = buildErrorPatternSummary(failedAttempts);

  // Build failed attempts section — all attempts, full code up to 1500 chars each
  const failedSection = failedAttempts.length === 0
    ? "None — the student solved it on the first attempt."
    : failedAttempts
        .map((a, i) => {
          const lines: string[] = [`--- Attempt ${i + 1} (status: ${a.normalizedStatus}) ---`];
          if (a.compileOutput?.trim()) lines.push(`Compile output:\n${a.compileOutput.trim().slice(0, 500)}`);
          if (a.stderr?.trim())        lines.push(`Stderr:\n${a.stderr.trim().slice(0, 500)}`);
          if (a.stdout?.trim())        lines.push(`Stdout (actual output):\n${a.stdout.trim().slice(0, 300)}`);
          lines.push(`Code:\n\`\`\`${language}\n${a.sourceCode.slice(0, 1500)}\n\`\`\``);
          return lines.join("\n");
        })
        .join("\n\n");

  const referenceSection = referenceSolution
    ? `\`\`\`${language}\n${referenceSolution.slice(0, 3000)}\n\`\`\``
    : "Not provided.";

  return `You are an expert programming instructor reviewing a student's complete submission history for a problem.
Your goal is to generate highly specific, educational flashcards that will genuinely help this student improve.
Do NOT be generic. Every card must reference specific details from the student's actual code or error messages.

[PROBLEM]
Title: ${problemTitle}
Language: ${language}
Description:
${problemDescription.slice(0, 1200)}

[REFERENCE SOLUTION]
${referenceSection}

[STUDENT'S FINAL ACCEPTED CODE]
\`\`\`${language}
${acceptedCode.slice(0, 3000)}
\`\`\`

[ERROR PATTERN SUMMARY]
${errorSummary}

[ALL PREVIOUS FAILED ATTEMPTS — COMPLETE HISTORY]
${failedSection}

[INSTRUCTIONS]
Generate exactly ${cardCount} flashcard${cardCount > 1 ? "s" : ""}. Distribute them across these types based on what the evidence actually shows:

- "error": A concrete mistake the student made in a failed attempt that caused a compile error, wrong output, or runtime crash.
  → Only use this type if there is clear evidence in the failed attempts. Quote the actual error message or wrong output.
  → Focus on the most impactful or most repeated error.

- "shortcoming": Something in the ACCEPTED code that works but has a weakness — inefficiency, missing edge case handling,
  hard-coded values, poor variable naming, global state, no input validation, ignoring return values, etc.
  → Reference the exact line or pattern in the accepted code.

- "improvement": A better approach compared to the reference solution — cleaner algorithm, better data structure,
  proper function decomposition, standard library usage, better naming, reduced complexity, etc.
  → Only include if the reference solution actually demonstrates something meaningfully better.
  → If the student's code is nearly identical to the reference, skip this type or note a minor style improvement.

Rules:
- Each card MUST address a DISTINCT issue. Never create two cards covering the same problem.
- "body" must be 3–5 sentences. Explain what happened, why it is a problem, and what the student should do differently.
- "rootCause" is one sentence explaining WHY this class of mistake typically happens (the underlying cognitive/conceptual reason).
- "concept" is the programming concept name (e.g. "off-by-one error", "integer overflow", "dangling pointer", "loop invariant").
- "codeSnippet" — include ONLY when a before/after comparison makes the issue visually obvious. Keep snippets minimal (5–15 lines max).
- Do NOT invent errors that are not present in the failed attempt history.
- Do NOT be vague or use filler praise. Every sentence must be informative.
- **EVERY "body" MUST quote at least one specific token from the student's actual code or an actual error message**: a variable name, a function call, a literal value, or an exact error string. Wrap it in backticks. Generic statements like "be careful with loops" or "make sure to handle edge cases" are FORBIDDEN — if you cannot point to a specific piece of evidence, do not produce that card.
- If the student had zero failed attempts, generate ${cardCount} "improvement" or "shortcoming" cards only.

[EXAMPLES — for calibration]

BAD card (do NOT produce this — too generic, no specific evidence):
{
  "type": "error",
  "title": "Be careful with loops",
  "concept": "loops",
  "body": "Make sure your loops are correct. Loops are very important in programming and you should pay attention to them.",
  "rootCause": "Students often make mistakes with loops."
}

GOOD card (specific, grounded in the student's actual code):
{
  "type": "error",
  "title": "Off-by-one when reading n+1 items",
  "concept": "off-by-one error in loop bound",
  "body": "In Attempt 2 your loop was \`for i in range(n+1):\` and called \`int(input())\` inside it, so on the final iteration you tried to read one value past the array end and the program raised \`EOFError\`. The problem statement said 'read the next n values', so the correct bound is \`range(n)\`. Inclusive vs exclusive bounds are easy to confuse when reading the spec quickly.",
  "rootCause": "Students often anchor on the count itself ('there are n+1 things') instead of the iteration bound, especially when the loop index is conceptually 0-based but the count feels 1-based."
}

[OUTPUT FORMAT]
Return ONLY a valid JSON object. No markdown outside code snippets. No explanation before or after.

{
  "cards": [
    {
      "type": "error | shortcoming | improvement",
      "title": "Short title — max 8 words",
      "concept": "The specific programming concept this card is about",
      "body": "3–5 sentences of specific, actionable feedback referencing the student's actual code.",
      "rootCause": "One sentence: why this type of mistake typically happens.",
      "codeSnippet": {
        "bad": "optional — the problematic code (minimal, focused)",
        "good": "optional — the corrected version"
      }
    }
  ]
}`;
}

// ─── Post-generation filters ─────────────────────────────────────────────────
//
// extractCards is intentionally lenient (it preserves what the model returned),
// then the three filters below progressively narrow the set to "real" cards.

/**
 * A2 — Structural validity check.
 *
 * Rejects cards that are missing required fields, have the default fallback
 * title ("Feedback"), or have a body that's too short / not a real sentence.
 */
function isValidCard(c: FlashcardItem): boolean {
  const title     = c.title.trim();
  const body      = c.body.trim();
  const concept   = c.concept.trim();
  const rootCause = c.rootCause.trim();

  if (!title || title === "Feedback") return false;
  if (!concept)   return false;
  if (!rootCause) return false;

  // Body must be at least ~2 real sentences. 80 chars + sentence-terminator is
  // a rough but effective floor; one-liners and fragments fail it.
  if (body.length < 80) return false;
  if (!/[.!?]/.test(body)) return false;

  return true;
}

/**
 * A3 — De-duplicate cards covering the same concept.
 *
 * The model occasionally produces two cards with subtly different titles but
 * the same `concept` (e.g. "off-by-one error" twice). Keep the first
 * occurrence of each concept (case-insensitive) and drop later ones.
 */
function dedupeCards(cards: FlashcardItem[]): FlashcardItem[] {
  const seen = new Set<string>();
  const out: FlashcardItem[] = [];
  for (const c of cards) {
    const key = c.concept.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

/**
 * A5 — Evidence grounding check.
 *
 * A card is "grounded" if its body mentions at least one substantive token
 * (a backticked identifier or a 4+ char alphanumeric word) that actually
 * appears in the student's source code or error output. Cards that fail
 * this check are usually hallucinated — the model invented an issue that
 * wasn't there in the attempt history.
 */
function hasGrounding(
  c: FlashcardItem,
  failedAttempts: FailedAttempt[],
  acceptedCode: string,
): boolean {
  const sourceCorpus = [
    acceptedCode,
    ...failedAttempts.flatMap((a) => [a.sourceCode, a.stderr, a.compileOutput, a.stdout]),
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join("\n")
    .toLowerCase();

  // Pull "interesting" tokens from the body:
  //   1. backticked spans  (e.g. `dp[i]`, `range(n)`)
  //   2. identifier-like words ≥ 4 chars (filters out common English)
  const backticked = (c.body.match(/`([^`]+)`/g) ?? [])
    .map((s) => s.replace(/`/g, "").trim().toLowerCase())
    .filter((s) => s.length >= 2);

  const identifiers = (c.body.match(/\b[a-zA-Z_][a-zA-Z0-9_]{3,}\b/g) ?? [])
    .map((s) => s.toLowerCase())
    // Skip plain English filler that often appears in good cards too.
    .filter((s) => !COMMON_ENGLISH_WORDS.has(s));

  const candidates = [...backticked, ...identifiers];
  return candidates.some((t) => sourceCorpus.includes(t));
}

/**
 * Short stop-list of common English / generic programming words that shouldn't
 * be treated as "evidence". This list intentionally stays small — anything
 * not on it is a candidate that must appear in the actual code to ground.
 */
const COMMON_ENGLISH_WORDS = new Set([
  "your", "this", "that", "with", "from", "into", "when", "while", "where",
  "what", "have", "will", "would", "should", "could", "must", "make", "made",
  "code", "line", "loop", "function", "variable", "value", "result", "output",
  "input", "error", "problem", "solution", "attempt", "case", "test",
  "student", "students", "instead", "because", "since", "however", "though",
  "always", "never", "often", "sometimes", "every", "each", "more", "less",
  "best", "good", "bad", "wrong", "right", "correct", "incorrect", "issue",
  "first", "second", "third", "last", "final", "before", "after", "above",
  "below", "between", "inside", "outside", "specific", "general", "important",
  "really", "very", "still", "again", "then", "than", "their", "them",
]);

function extractCards(raw: string): FlashcardItem[] {
  const stripped = raw
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = stripped.indexOf("{");
  const end   = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model response");

  const parsed = JSON.parse(stripped.slice(start, end + 1));
  if (!Array.isArray(parsed.cards)) throw new Error("Response missing 'cards' array");

  return parsed.cards
    .filter((c: unknown) => c && typeof c === "object")
    .map((c: Record<string, unknown>) => ({
      type: (["error", "shortcoming", "improvement"].includes(c.type as string)
        ? c.type
        : "improvement") as FlashcardType,
      title:     String(c.title     ?? "Feedback").slice(0, 100),
      concept:   String(c.concept   ?? "").slice(0, 120),
      body:      String(c.body      ?? "").slice(0, 1200),
      rootCause: String(c.rootCause ?? "").slice(0, 400),
      codeSnippet: c.codeSnippet
        ? {
            bad:  typeof (c.codeSnippet as Record<string, unknown>).bad  === "string"
              ? String((c.codeSnippet as Record<string, unknown>).bad)  : undefined,
            good: typeof (c.codeSnippet as Record<string, unknown>).good === "string"
              ? String((c.codeSnippet as Record<string, unknown>).good) : undefined,
          }
        : null,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────

export async function generateFlashcards(input: FlashcardInput): Promise<FlashcardItem[]> {
  const target = targetCardCount(input.failedAttempts.length);
  const prompt = buildPrompt(input);

  // C1 — Scale timeout with error count: longer prompts + more cards = longer
  // inference. Base raised to 180s (was 60s) to fit a VRAM-constrained 30B
  // mentor model; cap raised to 8 min so heavy histories don't get cut off.
  const timeoutMs     = 180_000 + input.failedAttempts.length * 30_000;
  const cappedTimeout = Math.min(timeoutMs, 480_000);
  const controller    = new AbortController();
  const timeout       = setTimeout(() => controller.abort(), cappedTimeout);

  try {
    const res = await fetch(getOllamaUrl(), {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        model:      getModelName(),
        prompt,
        stream:     false,
        keep_alive: -1,
        // A1 — JSON mode guarantees parsable JSON output, eliminating most
        // "No JSON object found" failures from stray prose or markdown fences.
        format:     "json",
        options: {
          // A1 — Lower temperature for structured output. 0.3 was too varied
          // and produced rambling JSON; 0.1 keeps the model anchored to the
          // schema while still allowing per-student wording differences.
          temperature: 0.1,
          top_p:       0.9,
          num_ctx:     12288,
          // A1 — Hard cap on generation length so a runaway can't burn the
          // full timeout window. 3000 tokens comfortably fits ~7 cards.
          num_predict: 3000,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);

    const data = (await res.json()) as { response?: string };
    const raw  = (data.response ?? "").trim();
    if (!raw) throw new Error("Empty response from model");

    // Pipeline: extract → A2 structural validity → A3 dedupe → A5 grounding.
    // Each stage only narrows; nothing is mutated. The final slice enforces
    // the target count when the model over-produces.
    const extracted = extractCards(raw);
    const valid     = extracted.filter(isValidCard);
    const deduped   = dedupeCards(valid);
    const grounded  = deduped.filter((c) =>
      hasGrounding(c, input.failedAttempts, input.acceptedCode),
    );

    console.log(
      `[flashcards] generated=${extracted.length} valid=${valid.length} ` +
      `deduped=${deduped.length} grounded=${grounded.length} target=${target}`,
    );

    return grounded.slice(0, target);
  } finally {
    clearTimeout(timeout);
  }
}
