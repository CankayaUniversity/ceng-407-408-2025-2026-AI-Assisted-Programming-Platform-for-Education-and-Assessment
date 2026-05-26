/**
 * Tri-judge evaluator for flashcard outputs.
 *
 * Takes a flashcard-eval-*.json (output of flashcard-smoke.ts) and asks
 * three independent LLM judges (GPT-4o-mini, Claude Haiku 4.5, DeepSeek
 * Chat) to score each generated card SET on five axes:
 *
 *   - specificity (1-5):       Do the cards cite real, specific evidence
 *                              (variable names, error messages, exact bug
 *                              patterns) — or are they generic platitudes?
 *   - diagnosisAccuracy (1-5): Does each card CORRECTLY identify the issue
 *                              it claims? Is the rootCause plausible? Does
 *                              the suggested fix actually fix the bug?
 *   - pedagogicalValue (1-5):  Would a student reading these cards actually
 *                              learn something useful for next time?
 *   - noHallucination (1-5):   Every claim must be grounded in the inputs
 *                              shown (acceptedCode, failedAttempts,
 *                              referenceSolution). No invented errors,
 *                              fabricated test labels, or made-up code.
 *   - distinctness (1-5):      Do the cards cover MEANINGFULLY different
 *                              issues, or is there redundant overlap?
 *
 * Each fixture gets scored by all 3 judges. Outputs:
 *   evals/results/scored-flashcard-<ts>.json   per-fixture × per-judge scores
 *   evals/results/scored-flashcard-<ts>.md     per-judge averages + per-fixture
 *                                              verdicts (human-readable)
 *
 * Usage (inside backend container):
 *   docker compose exec \
 *     -e OPENAI_API_KEY=... -e ANTHROPIC_API_KEY=... -e DEEPSEEK_API_KEY=... \
 *     backend npx tsx evals/flashcard-judge.ts evals/results/flashcard-eval-<ts>.json
 *
 * Optional:
 *   --fixtures path/to/fixtures.json   (default: evals/fixtures-flashcards.json)
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// ── Types (mirror flashcard-smoke output) ────────────────────────────────────

type FlashcardItem = {
  type: "error" | "shortcoming" | "improvement";
  title: string;
  concept: string;
  body: string;
  rootCause: string;
  codeSnippet?: { bad?: string; good?: string } | null;
};

type AssertionResult = { name: string; ok: boolean; detail?: string };

type FixtureResult = {
  id: string;
  category: string;
  ok: boolean;
  latencyMs: number;
  cards: FlashcardItem[];
  assertions: AssertionResult[];
  passedAssertions: number;
  totalAssertions: number;
  error: string | null;
};

type FailedAttempt = {
  normalizedStatus: string;
  sourceCode: string;
  stderr: string | null;
  compileOutput: string | null;
  stdout: string | null;
};

type Fixture = {
  id: string;
  category: string;
  expectedBehavior: string;
  problemTitle: string;
  language: string;
  referenceSolution: string | null;
  acceptedCode: string;
  failedAttempts: FailedAttempt[];
};

type JudgeName = "gpt-4o-mini" | "claude-haiku-4-5" | "deepseek-chat";

type JudgeScore = {
  judge: JudgeName;
  specificity: number;
  diagnosisAccuracy: number;
  pedagogicalValue: number;
  noHallucination: number;
  distinctness: number;
  notes: string;
  error: string | null;
  latencyMs: number;
};

type ScoredFixture = FixtureResult & {
  fixture: Fixture | null;
  judges: JudgeScore[];
};

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flags     = argv.filter((a) => a.startsWith("--"));

  const inputPath = positional[0];
  if (!inputPath) {
    console.error("Usage: npx tsx evals/flashcard-judge.ts <flashcard-eval-XXX.json> [--fixtures path]");
    process.exit(2);
  }

  let fixturesPath = path.resolve(__dirname, "fixtures-flashcards.json");
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === "--fixtures") {
      const next = argv[argv.indexOf(flags[i]) + 1];
      if (next) fixturesPath = path.resolve(next);
    }
  }

  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath).replace(/^flashcard-eval-/, "scored-flashcard-");
  return {
    inputPath,
    fixturesPath,
    outputPath: path.join(dir, base),
    reportPath: path.join(dir, base.replace(/\.json$/, ".md")),
  };
}

// ── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(fx: Fixture, result: FixtureResult): string {
  const failedSection =
    fx.failedAttempts.length === 0
      ? "(none — student solved it on the first attempt)"
      : fx.failedAttempts
          .map((a, i) => {
            const parts: string[] = [`--- Attempt ${i + 1} [${a.normalizedStatus}] ---`];
            if (a.compileOutput?.trim()) parts.push(`Compile: ${a.compileOutput.trim().slice(0, 400)}`);
            if (a.stderr?.trim())        parts.push(`Stderr:  ${a.stderr.trim().slice(0, 400)}`);
            if (a.stdout?.trim())        parts.push(`Stdout:  ${a.stdout.trim().slice(0, 200)}`);
            parts.push("Code:");
            parts.push("```" + fx.language);
            parts.push(a.sourceCode.slice(0, 1500));
            parts.push("```");
            return parts.join("\n");
          })
          .join("\n\n");

  const cardsSection = result.cards.length === 0
    ? "(the AI produced no cards)"
    : result.cards
        .map((c, i) => {
          const parts: string[] = [
            `--- Card ${i + 1} [type=${c.type}] ---`,
            `Title:     ${c.title}`,
            `Concept:   ${c.concept}`,
            `Body:      ${c.body}`,
            `RootCause: ${c.rootCause}`,
          ];
          if (c.codeSnippet?.bad)  parts.push(`Bad snippet:\n${c.codeSnippet.bad}`);
          if (c.codeSnippet?.good) parts.push(`Good snippet:\n${c.codeSnippet.good}`);
          return parts.join("\n");
        })
        .join("\n\n");

  return [
    "You are evaluating an AI tutor's feedback flashcards generated for a student programming submission.",
    "Score the flashcard SET (not individual cards) on five axes (1-5 each). Be a strict, calibrated evaluator.",
    "",
    "CONTEXT — the inputs the AI tutor saw",
    "=====================================",
    `Problem:  ${fx.problemTitle}  (${fx.language})`,
    `Scenario: ${fx.expectedBehavior}`,
    "",
    "Student's ACCEPTED code (the final, correct submission):",
    "```" + fx.language,
    fx.acceptedCode.slice(0, 2000),
    "```",
    "",
    "Reference solution (canonical):",
    fx.referenceSolution
      ? "```" + fx.language + "\n" + fx.referenceSolution.slice(0, 2000) + "\n```"
      : "(none provided)",
    "",
    "All FAILED attempts (chronological):",
    failedSection,
    "",
    "AI-GENERATED FLASHCARDS (what you are scoring)",
    "==============================================",
    cardsSection,
    "",
    "RUBRIC FOR YOUR JUDGMENT (every axis is 1-5, integer only)",
    "===========================================================",
    "1. specificity",
    "   5 = every card cites specific tokens from the actual code/errors above (variable names, exact error strings, line numbers, real patterns).",
    "   3 = mix of specific and generic.",
    "   1 = generic platitudes ('be careful', 'pay attention') with no concrete evidence.",
    "",
    "2. diagnosisAccuracy",
    "   5 = every diagnosis is correct; root causes are plausible; suggested fixes actually fix the bug.",
    "   3 = most cards diagnose correctly but at least one has a wrong or misleading claim.",
    "   1 = misdiagnoses the bug, recommends wrong fixes, or claims problems that don't exist.",
    "",
    "3. pedagogicalValue",
    "   5 = a student reading these would clearly learn something useful for next time (explains WHY, not just WHAT).",
    "   3 = useful but missing the 'why' or only partially actionable.",
    "   1 = unhelpful: too vague, too obvious, or fails to give the student something to do differently.",
    "",
    "4. noHallucination",
    "   5 = every code snippet, error message, variable name, and behavioral claim is grounded in the inputs above.",
    "   3 = mostly grounded but contains one fabricated detail (e.g. a citation that doesn't appear in the code, or an invented test case label).",
    "   1 = repeatedly invents things not in the input (fake test numbers like 'Test 1', code that doesn't exist, errors that didn't happen).",
    "",
    "5. distinctness",
    "   5 = each card covers a clearly different issue; no redundant overlap.",
    "   3 = mostly distinct but two cards lean on the same concept.",
    "   1 = multiple cards say essentially the same thing.",
    "   NOTE: if there is only 1 card, score this 5 (a single card cannot be redundant).",
    "",
    "OUTPUT (strict JSON, no markdown, no prose before or after):",
    "{",
    '  "specificity":       <1-5>,',
    '  "diagnosisAccuracy": <1-5>,',
    '  "pedagogicalValue":  <1-5>,',
    '  "noHallucination":   <1-5>,',
    '  "distinctness":      <1-5>,',
    '  "notes": "<one short sentence explaining your overall judgment>"',
    "}",
  ].join("\n");
}

// ── Judge callers (retry-on-429 pattern, mirrors score-suggest-judge) ────────

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterSeconds(header: string | null, fallback: number): number {
  if (!header) return fallback;
  const n = Number.parseFloat(header);
  if (Number.isFinite(n) && n > 0) return Math.min(n, 120);
  return fallback;
}

function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const stripped = text.replace(/^```(?:json)?\s*/im, "").replace(/```\s*$/im, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clampInt(value: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function parseScore(raw: string, judge: JudgeName, latencyMs: number): JudgeScore {
  const obj = extractJson(raw);
  if (!obj) {
    return {
      judge,
      specificity: 3, diagnosisAccuracy: 3, pedagogicalValue: 3,
      noHallucination: 3, distinctness: 3,
      notes: "Judge returned unparseable output.",
      error: "json_parse_failed",
      latencyMs,
    };
  }
  return {
    judge,
    specificity:       clampInt(obj.specificity,       1, 5, 3),
    diagnosisAccuracy: clampInt(obj.diagnosisAccuracy, 1, 5, 3),
    pedagogicalValue:  clampInt(obj.pedagogicalValue,  1, 5, 3),
    noHallucination:   clampInt(obj.noHallucination,   1, 5, 3),
    distinctness:      clampInt(obj.distinctness,      1, 5, 3),
    notes: typeof obj.notes === "string" ? obj.notes.slice(0, 400) : "",
    error: null,
    latencyMs,
  };
}

function fallbackScore(judge: JudgeName, error: string, latencyMs: number): JudgeScore {
  return {
    judge,
    specificity: 3, diagnosisAccuracy: 3, pedagogicalValue: 3,
    noHallucination: 3, distinctness: 3,
    notes: "", error, latencyMs,
  };
}

async function callOpenAI(prompt: string, key: string): Promise<JudgeScore> {
  const start = Date.now();
  try {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a strict evaluator. Respond only with valid JSON." },
            { role: "user", content: prompt },
          ],
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      });
      if (res.status !== 429) break;
      await sleep(parseRetryAfterSeconds(res.headers.get("retry-after"), 20) * 1000);
    }
    const latencyMs = Date.now() - start;
    const text = await res!.text();
    if (!res!.ok) return fallbackScore("gpt-4o-mini", `HTTP ${res!.status}: ${text.slice(0, 200)}`, latencyMs);
    const data = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
    return parseScore(data.choices?.[0]?.message?.content ?? "", "gpt-4o-mini", latencyMs);
  } catch (e) {
    return fallbackScore("gpt-4o-mini", e instanceof Error ? e.message : String(e), Date.now() - start);
  }
}

async function callAnthropic(prompt: string, key: string): Promise<JudgeScore> {
  const start = Date.now();
  try {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 400,
          temperature: 0,
          system: "You are a strict evaluator. Respond only with valid JSON.",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.status !== 429) break;
      await sleep(parseRetryAfterSeconds(res.headers.get("retry-after"), 30) * 1000);
    }
    const latencyMs = Date.now() - start;
    const text = await res!.text();
    if (!res!.ok) return fallbackScore("claude-haiku-4-5", `HTTP ${res!.status}: ${text.slice(0, 200)}`, latencyMs);
    const data = JSON.parse(text) as { content?: Array<{ type?: string; text?: string }> };
    const content = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
    return parseScore(content, "claude-haiku-4-5", latencyMs);
  } catch (e) {
    return fallbackScore("claude-haiku-4-5", e instanceof Error ? e.message : String(e), Date.now() - start);
  }
}

async function callDeepSeek(prompt: string, key: string): Promise<JudgeScore> {
  const start = Date.now();
  try {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: "You are a strict evaluator. Respond only with valid JSON." },
            { role: "user", content: prompt },
          ],
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      });
      if (res.status !== 429) break;
      await sleep(parseRetryAfterSeconds(res.headers.get("retry-after"), 30) * 1000);
    }
    const latencyMs = Date.now() - start;
    const text = await res!.text();
    if (!res!.ok) return fallbackScore("deepseek-chat", `HTTP ${res!.status}: ${text.slice(0, 200)}`, latencyMs);
    const data = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
    return parseScore(data.choices?.[0]?.message?.content ?? "", "deepseek-chat", latencyMs);
  } catch (e) {
    return fallbackScore("deepseek-chat", e instanceof Error ? e.message : String(e), Date.now() - start);
  }
}

// ── Markdown report ──────────────────────────────────────────────────────────

function renderReport(scoredAt: string, scored: ScoredFixture[]): string {
  const lines: string[] = [];
  lines.push("# Flashcard evaluation — tri-judge report");
  lines.push("");
  lines.push(`Scored at: \`${scoredAt}\``);
  lines.push(`Fixtures: ${scored.length}`);
  lines.push("");

  // Per-judge averages
  const judges: JudgeName[] = ["gpt-4o-mini", "claude-haiku-4-5", "deepseek-chat"];
  lines.push("## Per-judge axis averages");
  lines.push("");
  lines.push("| Judge | Specificity | Diagnosis | Pedagogy | No Hallucination | Distinctness | Errors |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const j of judges) {
    const judged = scored.flatMap((s) => s.judges.filter((x) => x.judge === j && !x.error));
    const errs   = scored.flatMap((s) => s.judges.filter((x) => x.judge === j && x.error)).length;
    const n      = judged.length || 1;
    const avg = (k: keyof JudgeScore) =>
      (judged.reduce((sum, x) => sum + (x[k] as number), 0) / n).toFixed(2);
    lines.push(
      `| \`${j}\` | ${avg("specificity")} | ${avg("diagnosisAccuracy")} | ${avg("pedagogicalValue")} | ${avg("noHallucination")} | ${avg("distinctness")} | ${errs} |`,
    );
  }
  lines.push("");

  // Per-axis overall (median across judges, averaged across fixtures)
  lines.push("## Per-axis overall median (across judges, then averaged)");
  lines.push("");
  lines.push("| Axis | Value |");
  lines.push("|---|---:|");
  const axes: Array<keyof JudgeScore> = [
    "specificity", "diagnosisAccuracy", "pedagogicalValue", "noHallucination", "distinctness",
  ];
  for (const axis of axes) {
    const perFixtureMedians: number[] = [];
    for (const s of scored) {
      const vals = s.judges
        .filter((j) => !j.error)
        .map((j) => j[axis] as number)
        .sort((a, b) => a - b);
      if (vals.length === 0) continue;
      const median = vals[Math.floor(vals.length / 2)];
      perFixtureMedians.push(median);
    }
    const avg = perFixtureMedians.length === 0
      ? "—"
      : (perFixtureMedians.reduce((s, x) => s + x, 0) / perFixtureMedians.length).toFixed(2);
    lines.push(`| ${axis} | ${avg} |`);
  }
  lines.push("");

  // Per-fixture audit
  lines.push("## Per-fixture details");
  for (const f of scored) {
    lines.push("");
    lines.push(`### \`${f.id}\` — ${f.category}`);
    lines.push("");
    if (f.fixture) {
      lines.push(`*Scenario:* ${f.fixture.expectedBehavior}`);
    }
    lines.push(`*Cards produced:* ${f.cards.length}`);
    lines.push(`*Structural assertions:* ${f.passedAssertions} / ${f.totalAssertions} passed`);
    lines.push("");

    if (f.cards.length > 0) {
      lines.push("Cards:");
      lines.push("");
      lines.push("| # | Type | Title | Concept |");
      lines.push("|---|---|---|---|");
      f.cards.forEach((c, i) => {
        const safe = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 100);
        lines.push(`| ${i + 1} | ${c.type} | ${safe(c.title)} | ${safe(c.concept)} |`);
      });
      lines.push("");
    }

    lines.push("Judge verdicts:");
    lines.push("");
    lines.push("| Judge | Specificity | Diagnosis | Pedagogy | NoHalluc | Distinctness | Notes |");
    lines.push("|---|:---:|:---:|:---:|:---:|:---:|---|");
    for (const j of f.judges) {
      if (j.error) {
        lines.push(`| \`${j.judge}\` | — | — | — | — | — | ⚠ error: ${j.error.slice(0, 80)} |`);
        continue;
      }
      const n = (j.notes ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 200);
      lines.push(
        `| \`${j.judge}\` | ${j.specificity} | ${j.diagnosisAccuracy} | ${j.pedagogicalValue} | ${j.noHallucination} | ${j.distinctness} | ${n} |`,
      );
    }
  }
  return lines.join("\n") + "\n";
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  const openAiKey    = process.env.OPENAI_API_KEY    ?? null;
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? null;
  const deepseekKey  = process.env.DEEPSEEK_API_KEY  ?? null;

  if (!openAiKey || !anthropicKey || !deepseekKey) {
    console.error("Error: OPENAI_API_KEY, ANTHROPIC_API_KEY, and DEEPSEEK_API_KEY must all be set.");
    process.exit(2);
  }

  // Load eval + fixtures, join by ID.
  const rawEval     = await readFile(args.inputPath,    "utf8");
  const rawFixtures = await readFile(args.fixturesPath, "utf8");
  const evalFile    = JSON.parse(rawEval)     as { at: string; fixtures: number; results: FixtureResult[] };
  const fixtures    = JSON.parse(rawFixtures) as Fixture[];
  const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

  console.log(
    `[flashcard-judge] eval=${args.inputPath}`,
  );
  console.log(
    `[flashcard-judge] judging ${evalFile.results.length} fixtures with 3 judges = ${evalFile.results.length * 3} calls`,
  );

  const scored: ScoredFixture[] = [];
  for (let i = 0; i < evalFile.results.length; i++) {
    const f  = evalFile.results[i];
    const fx = fixtureById.get(f.id) ?? null;
    process.stdout.write(`  [${i + 1}/${evalFile.results.length}] ${f.id} `);

    if (!fx) {
      scored.push({ ...f, fixture: null, judges: [] });
      process.stdout.write(`skipped (fixture id not found in ${path.basename(args.fixturesPath)})\n`);
      continue;
    }
    if (f.error || f.cards.length === 0) {
      scored.push({ ...f, fixture: fx, judges: [] });
      process.stdout.write(`skipped (no cards to judge)\n`);
      continue;
    }

    const prompt = buildPrompt(fx, f);
    // Sequential to respect rate limits.
    const j1 = await callOpenAI(prompt, openAiKey);
    const j2 = await callAnthropic(prompt, anthropicKey);
    const j3 = await callDeepSeek(prompt, deepseekKey);
    const judges = [j1, j2, j3];
    scored.push({ ...f, fixture: fx, judges });
    const errCount = judges.filter((j) => j.error).length;
    process.stdout.write(`done${errCount ? ` (${errCount} judge errors)` : ""}\n`);
  }

  const scoredAt = new Date().toISOString();
  const output = {
    meta: {
      scoredAt,
      evalSource:    path.basename(args.inputPath),
      fixturesUsed:  path.basename(args.fixturesPath),
      judges:        ["gpt-4o-mini", "claude-haiku-4-5", "deepseek-chat"],
    },
    results: scored,
  };

  await writeFile(args.outputPath, JSON.stringify(output, null, 2), "utf8");
  await writeFile(args.reportPath, renderReport(scoredAt, scored), "utf8");

  console.log("");
  console.log(`[flashcard-judge] done`);
  console.log(`[flashcard-judge] JSON   : ${args.outputPath}`);
  console.log(`[flashcard-judge] report : ${args.reportPath}`);
}

main().catch((e) => {
  console.error("[flashcard-judge] fatal:", e);
  process.exit(1);
});
