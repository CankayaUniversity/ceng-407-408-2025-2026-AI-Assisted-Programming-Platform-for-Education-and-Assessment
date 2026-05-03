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

/** Compute how many cards to request based on error count. */
function targetCardCount(errorCount: number): number {
  if (errorCount === 0) return 2;
  if (errorCount <= 2)  return 4;
  if (errorCount <= 5)  return 7;
  return 10;
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
- If the student had zero failed attempts, generate ${cardCount} "improvement" or "shortcoming" cards only.

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
  const prompt = buildPrompt(input);

  // Scale timeout with error count: more attempts = larger prompt = longer inference
  const timeoutMs = 60_000 + input.failedAttempts.length * 15_000; // 60s base + 15s per attempt
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, 360_000));

  try {
    const res = await fetch(getOllamaUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:      getModelName(),
        prompt,
        stream:     false,
        keep_alive: -1,
        options:    { temperature: 0.3, top_p: 0.9, num_ctx: 12288 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);

    const data = (await res.json()) as { response?: string };
    const raw  = (data.response ?? "").trim();
    if (!raw) throw new Error("Empty response from model");

    return extractCards(raw);
  } finally {
    clearTimeout(timeout);
  }
}
