/**
 * tutorialService.ts
 *
 * Generates a tutorial page for a given tag + language using Qwen 2.5 Coder 14B
 * via Ollama. Result is cached in the Tutorial table (upsert by tag+language).
 * Called fire-and-forget when an assignment is published.
 */

import { prisma } from "../lib/prisma";

export type TutorialSection = {
  heading: string;
  text: string;
  code?: string;
};

export type TutorialQuiz = {
  question: string;
  options: string[];
  answer: string; // must match one of options exactly
};

export type TutorialContent = {
  intro: string;
  sections: TutorialSection[];
  tryIt: string;      // complete runnable starter program
  quiz: TutorialQuiz;
};

type GenerationContext = {
  tag: string;
  language: string;
  difficulty: string;
  problemDescription: string;
};

function buildPrompt(ctx: GenerationContext): string {
  const langUpper = ctx.language.toUpperCase();
  const descSnippet = ctx.problemDescription.slice(0, 400);

  return `You are an expert programming instructor teaching a university CS course.
Your task is to write a short, clear tutorial page about "${ctx.tag}" for the ${langUpper} programming language.

CONTEXT:
- Student difficulty level: ${ctx.difficulty}
- The student is about to solve this problem: ${descSnippet}

INSTRUCTIONS:
- Explain "${ctx.tag}" as if teaching a university student who has programmed before but has never seen this concept.
- Use simple, friendly language. Build from first principles. Avoid dense jargon.
- Keep each section short: 2-4 sentences of explanation maximum.
- All code examples MUST be correct, minimal, and valid ${langUpper} code.
- The "tryIt" field must be a complete, runnable ${langUpper} program with a proper entry point (e.g. main() for C/C++).
- The quiz must have exactly 4 options and exactly one correct answer string that matches one option exactly.
- Produce exactly 2 or 3 sections — no more, no fewer.

OUTPUT FORMAT:
Return ONLY a single valid JSON object. No markdown fences. No explanation. No text before or after the JSON.

{
  "intro": "2-3 sentence plain-English introduction to ${ctx.tag}",
  "sections": [
    {
      "heading": "Section title",
      "text": "Clear explanation in 2-4 sentences.",
      "code": "// minimal correct ${langUpper} code example"
    }
  ],
  "tryIt": "// Complete runnable ${langUpper} program the student can read and learn from",
  "quiz": {
    "question": "A clear conceptual question about ${ctx.tag}",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "Option B"
  }
}`.trim();
}

function extractJson(raw: string): TutorialContent {
  const stripped = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  const end   = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model response");
  const parsed = JSON.parse(stripped.slice(start, end + 1));
  if (!parsed.intro || !Array.isArray(parsed.sections) || !parsed.tryIt || !parsed.quiz) {
    throw new Error("Tutorial JSON missing required fields");
  }
  return parsed as TutorialContent;
}

async function callOllama(prompt: string): Promise<string> {
  const base  = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL ?? "ai-mentor";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${base}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      signal:  controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        stream:      false,
        temperature: 0.4,
        top_p:       0.9,
      }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const body = await res.json() as { response?: string };
    return body.response ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate and persist a tutorial for tag+language.
 * Skips silently if already exists (cache hit — no regeneration).
 */
export async function generateAndSaveTutorial(ctx: GenerationContext): Promise<void> {
  const existing = await prisma.tutorial.findUnique({
    where: { tag_language: { tag: ctx.tag, language: ctx.language } },
  });
  if (existing) return; // already cached

  console.log(`[tutorial] generating: tag="${ctx.tag}" lang="${ctx.language}"`);

  const prompt  = buildPrompt(ctx);
  const raw     = await callOllama(prompt);
  const content = extractJson(raw);

  await prisma.tutorial.upsert({
    where:  { tag_language: { tag: ctx.tag, language: ctx.language } },
    update: { content: content as object },
    create: { tag: ctx.tag, language: ctx.language, content: content as object },
  });

  console.log(`[tutorial] saved: tag="${ctx.tag}" lang="${ctx.language}"`);
}

/**
 * Trigger generation for all tags on a problem — fire-and-forget.
 * Called when an assignment is published. Max 5 tags enforced defensively.
 */
export function triggerTutorialGeneration(
  tags: string[],
  language: string,
  difficulty: string,
  problemDescription: string,
): void {
  const cappedTags = tags.slice(0, 5);
  for (const tag of cappedTags) {
    generateAndSaveTutorial({ tag, language, difficulty, problemDescription }).catch((err) => {
      console.warn(`[tutorial] generation failed for tag="${tag}": ${err.message}`);
    });
  }
}
