/**
 * AI-powered problem variation generator.
 * Calls Ollama to produce a harder / easier / similar variant of an existing problem.
 */

export type VariationType = "harder" | "easier" | "similar";

export type VariationInput = {
  title: string;
  description: string;
  difficulty: string | null;
  language: string;
  starterCode: string | null;
};

export type GeneratedVariation = {
  title: string;
  description: string;
  difficulty: string;
  language: string;
  starterCode: string;
};

export type VariationResult =
  | { success: true; variation: GeneratedVariation; model: string }
  | { success: false; error: string };

// ── Ollama helpers (mirrors mentor.ts) ───────────────────────────────────────

function getOllamaGenerateUrl(): string {
  const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  return `${base}/api/generate`;
}

function getModelName(): string {
  return process.env.OLLAMA_MODEL ?? "ai-mentor";
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function difficultyTarget(type: VariationType, current: string | null): string {
  const d = (current ?? "medium").toLowerCase();
  if (type === "harder") {
    if (d.includes("easy"))   return "Medium";
    if (d.includes("medium")) return "Hard";
    return "Hard";
  }
  if (type === "easier") {
    if (d.includes("hard"))   return "Medium";
    if (d.includes("medium")) return "Easy";
    return "Easy";
  }
  return current ?? "Medium"; // similar keeps same difficulty
}

function buildVariationPrompt(input: VariationInput, type: VariationType): string {
  const targetDifficulty = difficultyTarget(type, input.difficulty);

  const typeInstructions: Record<VariationType, string> = {
    harder: `Create a HARDER version of this problem at difficulty "${targetDifficulty}".

STRICT RULES:
- DO NOT simply use bigger numbers or longer strings — that is NOT harder.
- The harder version MUST require a different or more complex algorithm.
- Good strategies: require an additional data structure (stack, map, set), add a constraint that breaks the naive solution (e.g. must run in O(n)), combine two concepts (e.g. sorting + searching, string parsing + arithmetic), introduce meaningful edge cases (negative numbers, empty input, duplicates).
- The student must think differently to solve it, not just write the same code with minor changes.
- Keep language: ${input.language}`,

    easier: `Create an EASIER version of this problem at difficulty "${targetDifficulty}".

STRICT RULES:
- Remove the most complex requirement, replacing it with a simpler one.
- The solution should require only a basic loop or conditional — no advanced data structures.
- Include at least one clear worked example: Input → Output.
- Be precise and unambiguous in the problem statement.
- Keep language: ${input.language}`,

    similar: `Create a SIMILAR problem on the same topic at difficulty "${targetDifficulty}".

STRICT RULES:
- Use the exact same core algorithmic concept as the original.
- Change the real-world context entirely (different domain, scenario, variable names).
- A student who solved the original should still find this a fresh, distinct challenge.
- Include at least one clear worked example: Input → Output.
- Keep language: ${input.language}`,
  };

  return `You are an expert computer-science educator creating university-level programming exercises.
You MUST respond in English only.

ORIGINAL PROBLEM
================
Title: ${input.title}
Difficulty: ${input.difficulty ?? "Medium"}
Language: ${input.language}
Description:
${input.description}
${input.starterCode ? `\nStarter Code:\n${input.starterCode}` : ""}

YOUR TASK
=========
${typeInstructions[type]}

RESPONSE FORMAT
===============
Respond with ONLY a valid JSON object — no markdown, no explanation, no code fences.
The JSON must have exactly these fields:
{
  "title": "<string — new problem title>",
  "description": "<string — full problem statement with at least one Input/Output example>",
  "difficulty": "${targetDifficulty}",
  "language": "${input.language}",
  "starterCode": "<string — starter code skeleton for the student, may be empty>"
}`.trim();
}

// ── JSON extractor ────────────────────────────────────────────────────────────

function extractJson(raw: string): GeneratedVariation | null {
  // Strip markdown code fences if the model wraps the JSON
  const stripped = raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();

  // Find the first { ... } block
  const start = stripped.indexOf("{");
  const end   = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    const obj = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;

    const title       = typeof obj.title       === "string" ? obj.title.trim()       : "";
    const description = typeof obj.description === "string" ? obj.description.trim() : "";
    const difficulty  = typeof obj.difficulty  === "string" ? obj.difficulty.trim()  : "Medium";
    const language    = typeof obj.language    === "string" ? obj.language.trim()    : "python";
    const starterCode = typeof obj.starterCode === "string" ? obj.starterCode        : "";

    if (!title || !description) return null;

    return { title, description, difficulty, language, starterCode };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateVariation(
  input: VariationInput,
  type: VariationType,
): Promise<VariationResult> {
  const url   = getOllamaGenerateUrl();
  const model = getModelName();
  const prompt = buildVariationPrompt(input, type);

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 120_000);

  try {
    console.log(`[variation] type=${type} model=${model} problem="${input.title}"`);

    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        keep_alive: -1,
        options: {
          temperature: 0.75, // more creative than the mentor
          top_p: 0.95,
        },
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

    const variation = extractJson(raw);
    if (!variation) {
      throw new Error(`Could not parse JSON from model output: ${raw.slice(0, 300)}`);
    }

    return { success: true, variation, model };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[variation] error:", message);
    return { success: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
