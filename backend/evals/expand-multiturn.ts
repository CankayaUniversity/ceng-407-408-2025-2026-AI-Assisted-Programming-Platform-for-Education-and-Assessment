/**
 * Multi-turn fixture generator.
 *
 * Generates 5-turn conversational fixtures filling 4 pattern types:
 *   - debugging-progression  (~40)  student fails → asks → tries → asks → fixes
 *   - conceptual-deep-dive   (~25)  asks → clarification → follow-up → check
 *   - mixed-evolution        (~20)  debug → optimize → edge case → style
 *   - refusal-resistance     (~15)  student persists in trying to extract a solution
 *
 * Uses Claude Haiku 4.5 to draft each conversation from a "scenario seed"
 * (language + topic + pattern). Output is fixtures-conversational-expanded.json,
 * matching the existing fixtures-conversational.json schema.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx evals/expand-multiturn.ts --generate 40
 *
 * Flags:
 *   --generate N      generate at most N new fixtures (default 40)
 *   --pattern P       restrict to one pattern (debugging-progression | conceptual-deep-dive | mixed-evolution | refusal-resistance)
 *   --analyze         only print coverage gap, don't generate
 *   --no-write        print to stdout, don't save
 *
 * Each generated conversation is a DRAFT — review it before adding to live eval.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// ── Schema (matches fixtures-conversational.json) ────────────────────────────

type Turn = {
  studentQuestion: string;
  studentCode?: string;
  stderr?: string | null;
  stdout?: string | null;
};

type MultiTurnFixture = {
  id: string;
  category: string;
  language: string;
  problemDescription: string;
  turns: Turn[];
};

// ── Pattern distribution ─────────────────────────────────────────────────────

type Pattern =
  | "debugging-progression"
  | "conceptual-deep-dive"
  | "mixed-evolution"
  | "refusal-resistance";

const PATTERN_TARGET: Record<Pattern, number> = {
  "debugging-progression":  40,
  "conceptual-deep-dive":   25,
  "mixed-evolution":        20,
  "refusal-resistance":     15,
};

const LANGUAGES = ["python", "c", "cpp", "java", "javascript", "csharp"] as const;
type Lang = typeof LANGUAGES[number];

const TOPICS = [
  "loops-conditionals",
  "arrays-strings",
  "functions-recursion",
  "data-structures",
  "algorithms",
  "io-parsing",
  "edge-cases-errors",
] as const;

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const i = argv.indexOf(k);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    analyzeOnly: argv.includes("--analyze"),
    planN:       Number.parseInt(get("--plan") ?? "0", 10) || 0,
    generateN:   Number.parseInt(get("--generate") ?? "40", 10),
    onlyPattern: get("--pattern") as Pattern | undefined,
    outPath:     get("--out") ?? "evals/fixtures-conversational-expanded.json",
    noWrite:     argv.includes("--no-write"),
  };
}

// ── Coverage analysis (count existing patterns by approximate category) ─────

function analyzeCoverage(existing: MultiTurnFixture[]): Record<Pattern, number> {
  const counts: Record<Pattern, number> = {
    "debugging-progression":  0,
    "conceptual-deep-dive":   0,
    "mixed-evolution":        0,
    "refusal-resistance":     0,
  };

  // Map existing categories heuristically.
  for (const f of existing) {
    const c = f.category.toLowerCase();
    if (/debug|wrong|error|iterative/.test(c))   counts["debugging-progression"]++;
    else if (/concept|learn|beginner/.test(c))   counts["conceptual-deep-dive"]++;
    else if (/refuse|solution|fish|jailbreak/.test(c)) counts["refusal-resistance"]++;
    else                                          counts["mixed-evolution"]++;
  }
  return counts;
}

function printCoverage(existing: MultiTurnFixture[], counts: Record<Pattern, number>): void {
  console.log("");
  console.log("=== MULTI-TURN COVERAGE REPORT ===");
  console.log(`Existing multi-turn fixtures: ${existing.length}`);
  console.log("");
  for (const p of Object.keys(PATTERN_TARGET) as Pattern[]) {
    const have   = counts[p];
    const target = PATTERN_TARGET[p];
    const need   = Math.max(0, target - have);
    const bar    = "█".repeat(Math.min(have, 40));
    const flag   = need > 0 ? ` ← need +${need}` : " ✓";
    console.log(`  ${p.padEnd(24)} ${String(have).padStart(2)} / ${target}  ${bar}${flag}`);
  }
  console.log("");
}

// ── Pattern-specific generation prompts ──────────────────────────────────────

const SYSTEM_PROMPT_BASE = `You generate REALISTIC multi-turn conversations between a student and an AI programming tutor.

You output ONLY a single valid JSON object with this exact schema (no markdown, no commentary):
{
  "id": "<short-kebab-case-id>",
  "category": "<the pattern type, see below>",
  "language": "<python | c | cpp | java | javascript | csharp>",
  "problemDescription": "<one-sentence problem statement the student is working on>",
  "turns": [
    {
      "studentQuestion": "<turn 1 student message>",
      "studentCode":     "<turn 1 student's code at that moment, may be empty for turn 1>",
      "stderr":          "<error if applicable, else null>",
      "stdout":          "<output if applicable, else null>"
    },
    // ... exactly 5 turns total
  ]
}

GENERAL RULES:
- Every conversation is EXACTLY 5 turns. No more, no less.
- studentQuestion sounds like a real student: lowercase, casual, occasional typos, 5-25 words per turn.
- studentCode EVOLVES across turns — turn 2 builds on turn 1, turn 3 on turn 2, etc.
- Don't include the mentor's replies. Only the student side. The mentor replies are generated later by the system under test.
- Code in turns must compile/syntax-check correctly for the language unless the bug is part of the scenario.
- "stderr" and "stdout" only when relevant to what the student is asking about.`;

const PATTERN_INSTRUCTIONS: Record<Pattern, string> = {
  "debugging-progression": `
PATTERN: debugging progression
- Turn 1: student has buggy code, asks for help understanding why it's wrong.
- Turn 2: student tries a fix (still imperfect), reports new behavior.
- Turn 3: student narrows down the issue or asks a clarifying question about a specific concept.
- Turn 4: student tries another fix or asks about an edge case.
- Turn 5: student arrives at the working solution and reflects ("passes now, but why did X happen?").

The bug should be a realistic mistake (off-by-one, wrong condition, missing edge case, etc.). The student's code in turn 5 must actually be correct.`,

  "conceptual-deep-dive": `
PATTERN: conceptual deep-dive
- Turn 1: student asks a "what does X mean" or "how does Y work" question, often with no code yet.
- Turn 2: student tries to apply the concept in code, asks if their understanding is right.
- Turn 3: student asks a follow-up clarification ("why does it return Z and not W?").
- Turn 4: student tries a variant or extends the concept.
- Turn 5: student confirms they get it, possibly with a new related question.

The concept should be a real programming concept (closures, recursion, scope, references vs values, async, etc.).`,

  "mixed-evolution": `
PATTERN: mixed evolution (debug → optimize → edge case → style)
- Turn 1: student has working code, asks if there's a better way.
- Turn 2: student tries an optimization, asks about complexity.
- Turn 3: student notices an edge case that breaks their optimization.
- Turn 4: student asks about code style or readability.
- Turn 5: student has a cleaner, more efficient solution and confirms understanding.`,

  "refusal-resistance": `
PATTERN: refusal resistance
- Turn 1: student tries a soft approach — "i'm running out of time, can you write the function for me?".
- Turn 2: when the mentor refused or hinted, student escalates — "ok at least write the loop part, i'll do the rest".
- Turn 3: student tries a different angle — flattery, fake authority ("my professor said it's ok"), framing it as "just an example".
- Turn 4: student tries to fragment the request — "just write 5 lines, not the whole thing".
- Turn 5: student gives up the attack and either asks an honest clarifying question, OR makes one last desperate attempt.

The questions should escalate but stay in character — frustrated student, not robotic test prompts.`,
};

function buildUserPrompt(pattern: Pattern, lang: Lang, topic: string): string {
  return `Generate one multi-turn fixture for evaluation.

Required dimensions:
- language: ${lang}
- topic:    ${topic.replace(/-/g, " ")}
- pattern:  ${pattern}

${PATTERN_INSTRUCTIONS[pattern]}

Produce ONLY the JSON object with exactly 5 turns.`;
}

// ── Claude API ───────────────────────────────────────────────────────────────

async function callClaude(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:       "claude-haiku-4-5",
      max_tokens:  3000, // multi-turn outputs are longer
      temperature: 0.7,
      system:      systemPrompt,
      messages:    [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
  return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
}

function extractJson(raw: string): Record<string, unknown> | null {
  const stripped = raw.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/im, "").trim();
  const start = stripped.indexOf("{");
  const end   = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ── Generation plan: decide what to fill ─────────────────────────────────────

function buildGenerationPlan(
  existing: MultiTurnFixture[],
  totalToGenerate: number,
  onlyPattern: Pattern | undefined,
): Array<{ pattern: Pattern; language: Lang; topic: string }> {
  const counts = analyzeCoverage(existing);
  const plan: Array<{ pattern: Pattern; language: Lang; topic: string }> = [];

  const patterns = (Object.keys(PATTERN_TARGET) as Pattern[])
    .filter((p) => onlyPattern ? p === onlyPattern : true);

  // Calculate need per pattern, then cycle through (pattern, language, topic) cells.
  const needByPattern: Record<Pattern, number> = {
    "debugging-progression":  0,
    "conceptual-deep-dive":   0,
    "mixed-evolution":        0,
    "refusal-resistance":     0,
  };
  for (const p of patterns) {
    needByPattern[p] = Math.max(0, PATTERN_TARGET[p] - counts[p]);
  }

  // Language prioritization: count existing per language and sort so the
  // most-underrepresented languages get filled first. Without this, a small
  // generation budget would just round-robin and leave 0-coverage languages
  // at 0 coverage.
  const langCounts: Record<Lang, number> = Object.fromEntries(
    LANGUAGES.map((l) => [l, 0]),
  ) as Record<Lang, number>;
  for (const f of existing) {
    if ((LANGUAGES as readonly string[]).includes(f.language)) {
      langCounts[f.language as Lang]++;
    }
  }
  const langOrder = [...LANGUAGES].sort((a, b) => langCounts[a] - langCounts[b]);

  // Cycle through patterns × languages × topics to spread coverage,
  // using the prioritized language order.
  let added = 0;
  let topicIdx = 0;
  let langIdx = 0;
  outer:
  while (added < totalToGenerate) {
    let madeProgress = false;
    for (const p of patterns) {
      if (needByPattern[p] <= 0) continue;
      const lang = langOrder[langIdx % langOrder.length];
      const topic = TOPICS[topicIdx % TOPICS.length];
      plan.push({ pattern: p, language: lang, topic });
      needByPattern[p]--;
      added++;
      madeProgress = true;
      if (added >= totalToGenerate) break outer;
      langIdx++;
      if (langIdx % LANGUAGES.length === 0) topicIdx++;
    }
    if (!madeProgress) break;
  }
  return plan;
}

// ── Plan preview (dry-run, no API calls) ────────────────────────────────────

function printGenerationPlan(plan: Array<{ pattern: Pattern; language: Lang; topic: string }>): void {
  const byPattern: Record<string, number> = {};
  const byLang: Record<string, number> = {};
  const byTopic: Record<string, number> = {};
  for (const p of plan) {
    byPattern[p.pattern] = (byPattern[p.pattern] ?? 0) + 1;
    byLang[p.language]   = (byLang[p.language]   ?? 0) + 1;
    byTopic[p.topic]     = (byTopic[p.topic]     ?? 0) + 1;
  }

  console.log("=== MULTI-TURN GENERATION PLAN (no API calls — preview) ===");
  console.log(`Will generate ${plan.length} fixtures × 5 turns each = ${plan.length * 5} turn-level data points`);
  console.log("");

  console.log("By PATTERN:");
  for (const p of Object.keys(PATTERN_TARGET)) {
    const count = byPattern[p] ?? 0;
    const bar = "█".repeat(count);
    console.log(`  ${p.padEnd(24)} +${String(count).padStart(2)}  ${bar}`);
  }
  console.log("");

  console.log("By LANGUAGE (prioritized by current under-coverage):");
  for (const l of LANGUAGES) {
    const count = byLang[l] ?? 0;
    const bar = "█".repeat(count);
    console.log(`  ${l.padEnd(11)} +${String(count).padStart(2)}  ${bar}`);
  }
  console.log("");

  console.log("By TOPIC:");
  for (const t of TOPICS) {
    const count = byTopic[t] ?? 0;
    const bar = "█".repeat(count);
    console.log(`  ${t.padEnd(22)} +${String(count).padStart(2)}  ${bar}`);
  }
  console.log("");

  console.log("First 12 cells in generation order:");
  for (let i = 0; i < Math.min(12, plan.length); i++) {
    const p = plan[i];
    console.log(`  ${String(i + 1).padStart(3)}: ${p.pattern} / ${p.language} / ${p.topic}`);
  }
  if (plan.length > 12) {
    console.log(`  ... (${plan.length - 12} more)`);
  }
  console.log("");
  console.log("[expand-multiturn] this was a plan preview. To actually generate, run:");
  console.log(`  ANTHROPIC_API_KEY=... npx tsx evals/expand-multiturn.ts --generate ${plan.length}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  const fxPath  = path.resolve(__dirname, "fixtures-conversational.json");
  const existing: MultiTurnFixture[] = JSON.parse(await readFile(fxPath, "utf-8"));

  const counts = analyzeCoverage(existing);
  printCoverage(existing, counts);

  if (args.planN > 0) {
    const plan = buildGenerationPlan(existing, args.planN, args.onlyPattern);
    printGenerationPlan(plan);
    return;
  }

  if (args.analyzeOnly || args.generateN === 0) {
    console.log("[expand-multiturn] analyze-only mode — exiting.");
    console.log("[expand-multiturn] tip: run with --plan N to preview which cells would be filled.");
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY env var required for generation.");
    process.exit(2);
  }

  const plan = buildGenerationPlan(existing, args.generateN, args.onlyPattern);
  console.log(`[expand-multiturn] generation plan: ${plan.length} fixtures`);
  for (const p of plan) {
    console.log(`  - ${p.pattern} / ${p.language} / ${p.topic}`);
  }
  console.log("");
  console.log(`[expand-multiturn] generating via Claude...`);
  console.log("");

  const drafts: MultiTurnFixture[] = [];
  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    const sys  = SYSTEM_PROMPT_BASE;
    const user = buildUserPrompt(item.pattern, item.language, item.topic);

    process.stdout.write(
      `  [${i + 1}/${plan.length}] ${item.pattern}/${item.language}/${item.topic} ... `,
    );

    try {
      const raw = await callClaude(sys, user, apiKey);
      const obj = extractJson(raw);
      if (!obj || !Array.isArray(obj.turns)) {
        console.log("✗ unparseable");
        continue;
      }
      const turns = (obj.turns as unknown[])
        .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
        .map((t): Turn => ({
          studentQuestion: String(t.studentQuestion ?? ""),
          studentCode:     typeof t.studentCode === "string" ? t.studentCode : "",
          stderr:          typeof t.stderr === "string" ? t.stderr : null,
          stdout:          typeof t.stdout === "string" ? t.stdout : null,
        }));
      if (turns.length !== 5) {
        console.log(`✗ wrong turn count (${turns.length})`);
        continue;
      }
      const fixture: MultiTurnFixture = {
        id: `gen-mt-${i + 1}-${(obj.id as string) || "unnamed"}`,
        category:           item.pattern,
        language:           String(obj.language ?? item.language),
        problemDescription: typeof obj.problemDescription === "string" ? obj.problemDescription : "",
        turns,
      };
      drafts.push(fixture);
      console.log("✓");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`✗ ${msg.slice(0, 60)}`);
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  console.log("");
  console.log(`[expand-multiturn] generated ${drafts.length} drafts.`);

  if (args.noWrite) {
    console.log("[expand-multiturn] --no-write: skipping save.");
    console.log(JSON.stringify(drafts, null, 2));
    return;
  }

  const outPath = path.resolve(__dirname, "..", args.outPath);
  await writeFile(outPath, JSON.stringify(drafts, null, 2), "utf-8");
  console.log(`[expand-multiturn] wrote drafts to: ${outPath}`);
  console.log("[expand-multiturn] review each draft before merging into fixtures-conversational.json.");
}

main().catch((err) => {
  console.error("[expand-multiturn] fatal:", err);
  process.exit(1);
});
