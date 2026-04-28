/**
 * flashcardService.ts
 *
 * Generates AI-powered feedback flashcards for a student after a correct submission.
 * Analyses the accepted code, previous failed attempts, and the reference solution.
 */

export type FlashcardType = "error" | "shortcoming" | "improvement";

export type FlashcardItem = {
  type: FlashcardType;
  title: string;
  body: string;
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

function buildPrompt(input: FlashcardInput): string {
  const { problemTitle, problemDescription, referenceSolution, language, acceptedCode, failedAttempts } = input;

  const failedSection = failedAttempts.length === 0
    ? "None — the student solved it on the first attempt."
    : failedAttempts
        .map((a, i) => {
          const lines: string[] = [`Attempt ${i + 1} — status: ${a.normalizedStatus}`];
          if (a.compileOutput) lines.push(`  Compile output: ${a.compileOutput.slice(0, 300)}`);
          if (a.stderr)        lines.push(`  Stderr: ${a.stderr.slice(0, 300)}`);
          if (a.stdout)        lines.push(`  Stdout: ${a.stdout.slice(0, 200)}`);
          lines.push(`  Code:\n${a.sourceCode.slice(0, 600)}`);
          return lines.join("\n");
        })
        .join("\n\n");

  const referenceSection = referenceSolution
    ? `\`\`\`${language}\n${referenceSolution.slice(0, 800)}\n\`\`\``
    : "Not provided.";

  return `You are an expert programming instructor reviewing a student's submission.
Generate honest, specific, and educational feedback flashcards about the student's code.

[PROBLEM]
Title: ${problemTitle}
Language: ${language}
Description:
${problemDescription.slice(0, 600)}

[REFERENCE SOLUTION]
${referenceSection}

[STUDENT'S ACCEPTED CODE]
\`\`\`${language}
${acceptedCode.slice(0, 800)}
\`\`\`

[PREVIOUS FAILED ATTEMPTS]
${failedSection}

[INSTRUCTIONS]
Generate 2 to 5 flashcards. Each card must belong to one of these types:
- "error": Something the student got wrong in a previous attempt (compile error, wrong output, runtime error). Only include if there were failed attempts.
- "shortcoming": Something that works but could cause problems — inefficiency, no edge case handling, using prompt text in output, global variables, hard-coded values, etc.
- "improvement": A better approach compared to the reference solution — cleaner code, better algorithm, better naming, proper function decomposition, etc.

Rules:
- Be specific — reference actual lines or patterns from the student's code.
- Keep "body" to 2–4 sentences maximum. Plain language, no jargon.
- "codeSnippet" is optional. Only include it when showing a before/after makes it clearly better.
- If the student's code is very clean and close to the reference, generate only 1–2 improvement cards.
- Do NOT make up errors that didn't happen.
- Do NOT be overly positive or padded. Be direct and useful.

[OUTPUT FORMAT]
Return ONLY a valid JSON object. No markdown. No explanation. No code fences outside snippets.

{
  "cards": [
    {
      "type": "error | shortcoming | improvement",
      "title": "Short title (max 8 words)",
      "body": "2–4 sentences of clear feedback.",
      "codeSnippet": {
        "bad": "optional — the problematic code snippet",
        "good": "optional — the improved version"
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
      type:  (["error", "shortcoming", "improvement"].includes(c.type as string)
        ? c.type
        : "improvement") as FlashcardType,
      title: String(c.title ?? "Feedback").slice(0, 80),
      body:  String(c.body  ?? "").slice(0, 600),
      codeSnippet: c.codeSnippet
        ? {
            bad:  typeof (c.codeSnippet as Record<string, unknown>).bad  === "string" ? String((c.codeSnippet as Record<string, unknown>).bad)  : undefined,
            good: typeof (c.codeSnippet as Record<string, unknown>).good === "string" ? String((c.codeSnippet as Record<string, unknown>).good) : undefined,
          }
        : null,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────

export async function generateFlashcards(input: FlashcardInput): Promise<FlashcardItem[]> {
  const prompt = buildPrompt(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(getOllamaUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:    getModelName(),
        prompt,
        stream:   false,
        keep_alive: -1,
        options:  { temperature: 0.3, top_p: 0.9 },
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
