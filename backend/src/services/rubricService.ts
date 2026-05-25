/**
 * AI-powered rubric generator.
 * Given a problem description, calls Ollama to produce a structured grading rubric.
 */

export type RubricCriterion = {
  name:         string;
  description:  string;
  maxScore:     number;
  scoringGuide: string;
};

export type GeneratedRubric = {
  criteria:     RubricCriterion[];
  totalPoints:  number;
  gradingNotes: string;
};

export type RubricResult =
  | { success: true;  rubric: GeneratedRubric; model: string }
  | { success: false; error: string };

// ── Ollama helpers ────────────────────────────────────────────────────────────

function getOllamaGenerateUrl(): string {
  const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  return `${base}/api/generate`;
}

function getModelName(): string {
  // Allow a dedicated rubric model distinct from the mentor/variation model.
  return process.env.OLLAMA_RUBRIC_MODEL ?? process.env.OLLAMA_MODEL ?? "ai-mentor";
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJson(raw: string): GeneratedRubric | null {
  const stripped = raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();

  const start = stripped.indexOf("{");
  const end   = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    const obj = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;

    const rawCriteria = Array.isArray(obj.criteria) ? obj.criteria : [];
    let criteria: RubricCriterion[] = rawCriteria
      .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
      .map((c) => ({
        name:         typeof c.name         === "string" ? c.name.trim()         : "Criterion",
        description:  typeof c.description  === "string" ? c.description.trim()  : "",
        maxScore:     typeof c.maxScore      === "number" ? Math.round(c.maxScore) : 10,
        scoringGuide: typeof c.scoringGuide  === "string" ? c.scoringGuide.trim() : "",
      }))
      .filter((c) => c.name && c.maxScore > 0);

    if (criteria.length === 0) return null;

    // Deduplicate criterion names — if the AI returns two "Correctness" criteria,
    // suffix duplicates so grading logic can tell them apart.
    const nameCount = new Map<string, number>();
    for (const c of criteria) {
      const count = nameCount.get(c.name) ?? 0;
      if (count > 0) {
        c.name = `${c.name} (${count + 1})`;
      }
      nameCount.set(c.name, count + 1);
    }

    // Normalize so the rubric always totals exactly 100 points.
    const rawTotal = criteria.reduce((sum, c) => sum + c.maxScore, 0);
    if (rawTotal !== 100 && rawTotal > 0) {
      const scale = 100 / rawTotal;
      criteria = criteria.map((c) => ({ ...c, maxScore: Math.round(c.maxScore * scale) }));
      // Fix rounding drift on the last criterion
      const newTotal = criteria.reduce((s, c) => s + c.maxScore, 0);
      if (newTotal !== 100) {
        criteria[criteria.length - 1].maxScore += 100 - newTotal;
      }
    }

    const totalPoints  = criteria.reduce((sum, c) => sum + c.maxScore, 0);
    const gradingNotes = typeof obj.gradingNotes === "string" ? obj.gradingNotes.trim() : "";

    return { criteria, totalPoints, gradingNotes };
  } catch {
    return null;
  }
}

// ── Prompt ────────────────────────────────────────────────────────────────────

/**
 * A minimal test-case shape — matches Prisma's TestCase model. The rubric
 * service only needs input + expectedOutput + isHidden to inform criteria.
 */
export type RubricTestCase = {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
};

/**
 * Render test cases as a compact, judge-readable block. Public tests show
 * input/expected pairs; hidden tests only get a count + a brief category
 * hint (so the AI knows what edge cases exist without leaking specifics
 * that would let a student trivially reverse-engineer hidden tests if the
 * rubric ever leaked to them).
 */
function formatTestCases(tests: RubricTestCase[] | null): string {
  if (!tests || tests.length === 0) return "";
  const publicTests = tests.filter((t) => !t.isHidden);
  const hiddenTests = tests.filter((t) => t.isHidden);

  const lines: string[] = ["", "TEST CASES (what 'correctness' actually means for this problem)", "================================================================"];

  if (publicTests.length > 0) {
    lines.push(`Public test cases (${publicTests.length}):`);
    publicTests.slice(0, 8).forEach((t, i) => {
      const inp = t.input.replace(/\n/g, " ↵ ").slice(0, 200);
      const out = t.expectedOutput.replace(/\n/g, " ↵ ").slice(0, 200);
      lines.push(`  [${i + 1}] Input: ${inp}`);
      lines.push(`      Expected: ${out}`);
    });
    if (publicTests.length > 8) lines.push(`  ... and ${publicTests.length - 8} more public tests`);
  }

  if (hiddenTests.length > 0) {
    lines.push(`Hidden test cases: ${hiddenTests.length} (inputs withheld; consider edge cases like empty input, boundary values, large input, special characters)`);
  }

  lines.push("");
  lines.push("Use these test cases to make the rubric SPECIFIC to this problem. The 'Correctness' criterion's scoringGuide must describe what kinds of inputs the tests actually exercise (e.g. 'handles empty arrays, boundary values, negative numbers'), not generic phrasings.");
  return lines.join("\n");
}

function buildRubricPrompt(
  title: string,
  description: string,
  language: string,
  difficulty: string | null,
  referenceSolution: string | null,
  tests: RubricTestCase[] | null = null,
): string {
  return `You are an expert computer-science educator creating a grading rubric for a programming assignment.
You MUST respond in English only.

PROBLEM
=======
Title: ${title}
Difficulty: ${difficulty ?? "Medium"}
Language: ${language}
Description:
${description}
${referenceSolution ? `\nReference Solution (for your context only — not shown to students):\n${referenceSolution}` : ""}
${formatTestCases(tests)}
YOUR TASK
=========
Create a detailed grading rubric for this problem. The rubric should:
- Have 4 to 6 criteria that cover the key aspects of a correct solution
- Total exactly 100 points distributed across all criteria
- Each criterion must have a clear name, a description of what is being assessed, a maxScore, and a brief scoringGuide explaining what earns full, partial, and zero points
- Criteria should cover: correctness (test cases passing), code quality/readability, edge case handling, algorithm efficiency, and any problem-specific requirements
- The 'Correctness' criterion (or equivalent) MUST reference the actual test categories shown above when test cases are provided — NOT generic 'handles all test cases' phrasing.
- If the test cases reveal specific edge cases (empty input, negative numbers, boundary values, multiple-space separators, etc.), the rubric SHOULD include a problem-specific 'Edge Cases' criterion that names them.

RESPONSE FORMAT
===============
Respond with ONLY a valid JSON object — no markdown, no explanation, no code fences.
{
  "criteria": [
    {
      "name": "<criterion name>",
      "description": "<what this criterion assesses>",
      "maxScore": <integer points for this criterion>,
      "scoringGuide": "<full points: ..., partial: ..., zero: ...>"
    }
  ],
  "gradingNotes": "<optional overall notes for the grader>"
}`.trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateRubric(
  title:             string,
  description:       string,
  language:          string,
  difficulty:        string | null,
  referenceSolution: string | null,
  tests:             RubricTestCase[] | null = null,
): Promise<RubricResult> {
  const url    = getOllamaGenerateUrl();
  const model  = getModelName();
  const prompt = buildRubricPrompt(title, description, language, difficulty, referenceSolution, tests);

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 240_000);

  try {
    console.log(`[rubric] model=${model} problem="${title}"`);

    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        keep_alive: -1,
        options: { temperature: 0.3, top_p: 0.9, num_ctx: 8192 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as { response?: string };
    const raw  = (data.response ?? "").trim();
    if (!raw) throw new Error("Ollama returned an empty response");

    const rubric = extractJson(raw);
    if (!rubric) throw new Error(`Could not parse rubric JSON from model output: ${raw.slice(0, 300)}`);

    return { success: true, rubric, model };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const message = raw.toLowerCase().includes("abort")
      ? "AI is busy — please try again in a moment."
      : raw;
    console.error("[rubric] error:", message);
    return { success: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
