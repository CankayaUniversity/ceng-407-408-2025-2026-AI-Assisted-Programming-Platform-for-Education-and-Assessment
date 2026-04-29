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
  return process.env.OLLAMA_MODEL ?? "ai-mentor";
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
    const criteria: RubricCriterion[] = rawCriteria
      .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
      .map((c) => ({
        name:         typeof c.name         === "string" ? c.name.trim()         : "Criterion",
        description:  typeof c.description  === "string" ? c.description.trim()  : "",
        maxScore:     typeof c.maxScore      === "number" ? Math.round(c.maxScore) : 10,
        scoringGuide: typeof c.scoringGuide  === "string" ? c.scoringGuide.trim() : "",
      }))
      .filter((c) => c.name && c.maxScore > 0);

    if (criteria.length === 0) return null;

    const totalPoints  = criteria.reduce((sum, c) => sum + c.maxScore, 0);
    const gradingNotes = typeof obj.gradingNotes === "string" ? obj.gradingNotes.trim() : "";

    return { criteria, totalPoints, gradingNotes };
  } catch {
    return null;
  }
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildRubricPrompt(
  title: string,
  description: string,
  language: string,
  difficulty: string | null,
  referenceSolution: string | null,
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

YOUR TASK
=========
Create a detailed grading rubric for this problem. The rubric should:
- Have 4 to 6 criteria that cover the key aspects of a correct solution
- Total exactly 100 points distributed across all criteria
- Each criterion must have a clear name, a description of what is being assessed, a maxScore, and a brief scoringGuide explaining what earns full, partial, and zero points
- Criteria should cover: correctness (test cases passing), code quality/readability, edge case handling, algorithm efficiency, and any problem-specific requirements

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
): Promise<RubricResult> {
  const url    = getOllamaGenerateUrl();
  const model  = getModelName();
  const prompt = buildRubricPrompt(title, description, language, difficulty, referenceSolution);

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
