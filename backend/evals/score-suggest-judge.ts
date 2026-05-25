/**
 * Tri-judge evaluator for score-suggestion outputs.
 *
 * Takes a score-suggest-eval-*.json (output of score-suggest-smoke.ts) and
 * judges every AI-suggested score on these axes:
 *
 *   - proportionalCorrectness (1-5): did the Correctness criterion's score
 *     reasonably match the (k passed / n total) × max formula?
 *   - citationsValid (1-5): do code-pattern citations in the comments
 *     actually appear in the student's code?
 *   - scoreRangeMatch (1-5): is the total score in the expected band for
 *     this fixture's category?
 *   - commentQuality (1-5): are the per-criterion comments specific and
 *     useful, or generic / unhelpful?
 *   - noFalsePositive (1-5): does it avoid giving full marks to broken code
 *     or zero to working code?
 *
 * Each fixture is scored by GPT-4o-mini, Claude Haiku 4.5, and DeepSeek
 * Chat. Output is written to scored-score-suggest-<timestamp>.json plus a
 * markdown report.
 *
 * Usage (inside backend container):
 *   docker compose exec \
 *     -e OPENAI_API_KEY=... -e ANTHROPIC_API_KEY=... -e DEEPSEEK_API_KEY=... \
 *     backend npx tsx evals/score-suggest-judge.ts evals/results/score-suggest-eval-<ts>.json
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// ── Types (mirror score-suggest-smoke.ts output) ─────────────────────────────

type SuggestedBreakdown = { name: string; maxScore: number; suggested: number; comment: string };

type FixtureResult = {
  id: string;
  category: string;
  expectedBehavior: string;
  expectedScoreRange: [number, number];
  input: {
    problemTitle: string;
    language: string;
    studentCode: string;
    referenceSolution: string | null;
    criteria: Array<{ name: string; description: string; maxScore: number; scoringGuide: string }>;
    exec: {
      normalizedStatus: string;
      publicPassed: number | null;
      publicTotal: number | null;
      hiddenPassed: number | null;
      hiddenTotal: number | null;
      allPassed: boolean | null;
      stdout: string | null;
      stderr: string | null;
      compileOutput: string | null;
    } | null;
    publicPassed: number | null;
    publicTotal: number | null;
    hiddenPassed: number | null;
    hiddenTotal: number | null;
    execStatus: string;
  };
  ok: boolean;
  error: string | null;
  latencyMs: number;
  suggestion: {
    breakdown: SuggestedBreakdown[];
    totalScore: number;
    maxTotal: number;
    generalNotes: string;
  } | null;
  model: string | null;
};

type JudgeName = "gpt-4o-mini" | "claude-haiku-4-5" | "deepseek-chat";

type JudgeScore = {
  judge: JudgeName;
  proportionalCorrectness: number;
  citationsValid: number;
  scoreRangeMatch: number;
  commentQuality: number;
  noFalsePositive: number;
  notes: string;
  error: string | null;
  latencyMs: number;
};

type ScoredFixture = FixtureResult & { judges: JudgeScore[] };

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const inputPath = positional[0];
  if (!inputPath) {
    console.error("Usage: npx tsx evals/score-suggest-judge.ts <score-suggest-eval-XXX.json>");
    process.exit(2);
  }
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath).replace(/^score-suggest-eval-/, "scored-score-suggest-");
  return {
    inputPath,
    outputPath: path.join(dir, base),
    reportPath: path.join(dir, base.replace(/\.json$/, ".md")),
  };
}

// ── Rubric prompt ────────────────────────────────────────────────────────────

function buildPrompt(f: FixtureResult): string {
  const s = f.suggestion;
  const breakdownLines = (s?.breakdown ?? [])
    .map(
      (b) =>
        `  - ${b.name}: ${b.suggested} / ${b.maxScore}  comment="${(b.comment ?? "").replace(/"/g, '\\"').slice(0, 300)}"`,
    )
    .join("\n");
  const totalLine = s ? `Total suggested: ${s.totalScore} / ${s.maxTotal}` : "Total: (no suggestion)";

  return [
    "You are evaluating an AI grading assistant's score suggestion for a student programming submission.",
    "Score the AI's suggestion on five axes (1-5 each). Be a strict, calibrated evaluator.",
    "",
    "CONTEXT — the inputs the AI saw",
    "================================",
    `Problem    : ${f.input.problemTitle} (${f.input.language})`,
    `Test result: ${f.input.execStatus}, ${f.input.publicPassed}/${f.input.publicTotal} public + ${f.input.hiddenPassed}/${f.input.hiddenTotal} hidden tests passed`,
    `Stderr     : ${f.input.exec?.stderr ?? "(none)"}`,
    `Compile out: ${f.input.exec?.compileOutput ?? "(none)"}`,
    "",
    "Student code:",
    "```",
    f.input.studentCode.slice(0, 2000),
    "```",
    "",
    "Rubric criteria:",
    f.input.criteria.map((c) => `  - ${c.name} (max ${c.maxScore}): ${c.description}`).join("\n"),
    "",
    "EXPECTED BEHAVIOR (calibration target)",
    "======================================",
    f.expectedBehavior,
    `Expected total-score range: [${f.expectedScoreRange[0]}, ${f.expectedScoreRange[1]}]`,
    "",
    "AI'S SUGGESTION (what you are scoring)",
    "======================================",
    breakdownLines || "(no breakdown)",
    totalLine,
    s?.generalNotes ? `General notes: ${s.generalNotes}` : "",
    "",
    "RUBRIC FOR YOUR JUDGMENT",
    "========================",
    "1. proportionalCorrectness (1-5): For the 'Correctness' criterion (or equivalent), did the AI's score land near (k passed / n total) × max?",
    "   5 = within ±10% of the proportional expectation.",
    "   3 = within ±30%.",
    "   1 = wildly off (e.g. full marks despite tests failing, or zero despite tests passing).",
    "",
    "2. citationsValid (1-5): Backticked code citations in the AI's per-criterion comments should appear in the student's actual code (above).",
    "   5 = all citations check out (or no citations made, but comments are still specific).",
    "   3 = some citations look invented but most are real.",
    "   1 = obvious hallucinations (citing functions or patterns not in the student's code).",
    "",
    "3. scoreRangeMatch (1-5): How well does the AI's TOTAL score match the expected range above?",
    "   5 = inside the expected range.",
    "   3 = within 10 points of the range.",
    "   1 = far outside the range.",
    "",
    "4. commentQuality (1-5): Are the per-criterion comments specific and useful, or generic / unhelpful?",
    "   5 = specific, evidence-based, mentions actual code patterns or test outcomes.",
    "   3 = mix of specific and generic.",
    "   1 = pure boilerplate ('the code is fine', 'could be better').",
    "",
    "5. noFalsePositive (1-5): Did the AI avoid the two failure modes — full marks on broken code, or zero on working code?",
    "   5 = score direction is correct (broken code → low, working code → high).",
    "   3 = direction is mostly right but specifics are off.",
    "   1 = scores wildly contradict the actual test outcome (e.g. allPassed=true but Correctness < 50%).",
    "",
    "OUTPUT (strict JSON, no markdown, no prose before or after):",
    "{",
    '  "proportionalCorrectness": <1-5>,',
    '  "citationsValid": <1-5>,',
    '  "scoreRangeMatch": <1-5>,',
    '  "commentQuality": <1-5>,',
    '  "noFalsePositive": <1-5>,',
    '  "notes": "<one short sentence explaining your overall judgment>"',
    "}",
  ].join("\n");
}

// ── Judge callers (same retry-on-429 pattern as scorer.ts) ───────────────────

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
      proportionalCorrectness: 3,
      citationsValid: 3,
      scoreRangeMatch: 3,
      commentQuality: 3,
      noFalsePositive: 3,
      notes: "Judge returned unparseable output.",
      error: "json_parse_failed",
      latencyMs,
    };
  }
  return {
    judge,
    proportionalCorrectness: clampInt(obj.proportionalCorrectness, 1, 5, 3),
    citationsValid: clampInt(obj.citationsValid, 1, 5, 3),
    scoreRangeMatch: clampInt(obj.scoreRangeMatch, 1, 5, 3),
    commentQuality: clampInt(obj.commentQuality, 1, 5, 3),
    noFalsePositive: clampInt(obj.noFalsePositive, 1, 5, 3),
    notes: typeof obj.notes === "string" ? obj.notes.slice(0, 400) : "",
    error: null,
    latencyMs,
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
    if (!res!.ok) {
      return { judge: "gpt-4o-mini", proportionalCorrectness: 3, citationsValid: 3, scoreRangeMatch: 3, commentQuality: 3, noFalsePositive: 3, notes: "", error: `HTTP ${res!.status}: ${text.slice(0, 200)}`, latencyMs };
    }
    const data = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
    return parseScore(data.choices?.[0]?.message?.content ?? "", "gpt-4o-mini", latencyMs);
  } catch (e) {
    return { judge: "gpt-4o-mini", proportionalCorrectness: 3, citationsValid: 3, scoreRangeMatch: 3, commentQuality: 3, noFalsePositive: 3, notes: "", error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start };
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
    if (!res!.ok) {
      return { judge: "claude-haiku-4-5", proportionalCorrectness: 3, citationsValid: 3, scoreRangeMatch: 3, commentQuality: 3, noFalsePositive: 3, notes: "", error: `HTTP ${res!.status}: ${text.slice(0, 200)}`, latencyMs };
    }
    const data = JSON.parse(text) as { content?: Array<{ type?: string; text?: string }> };
    const content = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
    return parseScore(content, "claude-haiku-4-5", latencyMs);
  } catch (e) {
    return { judge: "claude-haiku-4-5", proportionalCorrectness: 3, citationsValid: 3, scoreRangeMatch: 3, commentQuality: 3, noFalsePositive: 3, notes: "", error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start };
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
    if (!res!.ok) {
      return { judge: "deepseek-chat", proportionalCorrectness: 3, citationsValid: 3, scoreRangeMatch: 3, commentQuality: 3, noFalsePositive: 3, notes: "", error: `HTTP ${res!.status}: ${text.slice(0, 200)}`, latencyMs };
    }
    const data = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
    return parseScore(data.choices?.[0]?.message?.content ?? "", "deepseek-chat", latencyMs);
  } catch (e) {
    return { judge: "deepseek-chat", proportionalCorrectness: 3, citationsValid: 3, scoreRangeMatch: 3, commentQuality: 3, noFalsePositive: 3, notes: "", error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start };
  }
}

// ── Markdown report ──────────────────────────────────────────────────────────

function renderReport(meta: Record<string, unknown>, scored: ScoredFixture[]): string {
  const lines: string[] = [];
  lines.push("# Score-suggestion evaluation — tri-judge report");
  lines.push("");
  lines.push(`Scored at: \`${meta.scoredAt ?? new Date().toISOString()}\``);
  lines.push(`Fixtures: ${scored.length}`);
  lines.push("");

  // Per-judge averages
  const judges = ["gpt-4o-mini", "claude-haiku-4-5", "deepseek-chat"] as const;
  lines.push("## Per-judge axis averages");
  lines.push("");
  lines.push("| Judge | Proportional | Citations | Range Match | Comment Quality | No False Pos | Errors |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const j of judges) {
    const judged = scored
      .flatMap((s) => s.judges.filter((x) => x.judge === j && !x.error));
    const errs = scored.flatMap((s) => s.judges.filter((x) => x.judge === j && x.error)).length;
    const n = judged.length || 1;
    const avg = (k: keyof JudgeScore) =>
      (judged.reduce((sum, x) => sum + (x[k] as number), 0) / n).toFixed(2);
    lines.push(
      `| \`${j}\` | ${avg("proportionalCorrectness")} | ${avg("citationsValid")} | ${avg("scoreRangeMatch")} | ${avg("commentQuality")} | ${avg("noFalsePositive")} | ${errs} |`,
    );
  }
  lines.push("");

  // In-range summary
  const inRange = scored.filter(
    (s) =>
      s.ok &&
      s.suggestion &&
      s.suggestion.totalScore >= s.expectedScoreRange[0] &&
      s.suggestion.totalScore <= s.expectedScoreRange[1],
  ).length;
  lines.push("## Score-range conformance");
  lines.push("");
  lines.push(`${inRange} of ${scored.length} fixtures produced a total score inside the expected range.`);
  lines.push("");

  // Per-fixture audit
  lines.push("## Per-fixture details");
  lines.push("");
  for (const f of scored) {
    lines.push(`### \`${f.id}\` — ${f.category}`);
    lines.push("");
    lines.push(`*Expected:* ${f.expectedBehavior}`);
    lines.push(`*Expected range:* [${f.expectedScoreRange[0]}, ${f.expectedScoreRange[1]}]`);
    if (!f.suggestion) {
      lines.push(`**AI produced no suggestion** (error: ${f.error ?? "unknown"})`);
      lines.push("");
      continue;
    }
    lines.push(`*AI total:* **${f.suggestion.totalScore} / ${f.suggestion.maxTotal}**`);
    lines.push("");
    lines.push("AI per-criterion breakdown:");
    lines.push("");
    lines.push("| Criterion | Score | Comment |");
    lines.push("|---|---:|---|");
    for (const b of f.suggestion.breakdown) {
      const safeComment = (b.comment ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 280);
      lines.push(`| ${b.name} | ${b.suggested} / ${b.maxScore} | ${safeComment} |`);
    }
    lines.push("");
    lines.push("Judge verdicts:");
    lines.push("");
    lines.push("| Judge | Proportional | Citations | Range | CommentQ | NoFP | Notes |");
    lines.push("|---|:---:|:---:|:---:|:---:|:---:|---|");
    for (const j of f.judges) {
      if (j.error) {
        lines.push(`| \`${j.judge}\` | — | — | — | — | — | ⚠ error: ${j.error.slice(0, 80)} |`);
        continue;
      }
      const n = (j.notes ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 200);
      lines.push(
        `| \`${j.judge}\` | ${j.proportionalCorrectness} | ${j.citationsValid} | ${j.scoreRangeMatch} | ${j.commentQuality} | ${j.noFalsePositive} | ${n} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  const openAiKey = process.env.OPENAI_API_KEY ?? null;
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? null;
  const deepseekKey = process.env.DEEPSEEK_API_KEY ?? null;

  if (!openAiKey || !anthropicKey || !deepseekKey) {
    console.error("Error: OPENAI_API_KEY, ANTHROPIC_API_KEY, and DEEPSEEK_API_KEY must all be set.");
    process.exit(2);
  }

  const raw = await readFile(args.inputPath, "utf8");
  const inputFile = JSON.parse(raw) as { meta: Record<string, unknown>; results: FixtureResult[] };
  const fixtures = inputFile.results;
  console.log(`[score-suggest-judge] judging ${fixtures.length} fixtures with 3 judges each = ${fixtures.length * 3} calls`);

  const scored: ScoredFixture[] = [];

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    process.stdout.write(`  [${i + 1}/${fixtures.length}] ${f.id} `);
    if (!f.ok || !f.suggestion) {
      scored.push({ ...f, judges: [] });
      process.stdout.write(`skipped (AI errored)\n`);
      continue;
    }
    const prompt = buildPrompt(f);
    // Sequential to respect rate limits.
    const j1 = await callOpenAI(prompt, openAiKey);
    const j2 = await callAnthropic(prompt, anthropicKey);
    const j3 = await callDeepSeek(prompt, deepseekKey);
    const judges = [j1, j2, j3];
    scored.push({ ...f, judges });
    const errCount = judges.filter((j) => j.error).length;
    process.stdout.write(`done${errCount ? ` (${errCount} judge errors)` : ""}\n`);
  }

  const output = {
    meta: {
      ...inputFile.meta,
      scoredAt: new Date().toISOString(),
      judges: ["gpt-4o-mini", "claude-haiku-4-5", "deepseek-chat"],
    },
    results: scored,
  };

  await writeFile(args.outputPath, JSON.stringify(output, null, 2), "utf8");
  await writeFile(args.reportPath, renderReport(output.meta, scored), "utf8");

  console.log("");
  console.log(`[score-suggest-judge] done`);
  console.log(`[score-suggest-judge] JSON   : ${args.outputPath}`);
  console.log(`[score-suggest-judge] report : ${args.reportPath}`);
}

main().catch((e) => {
  console.error("[score-suggest-judge] fatal:", e);
  process.exit(1);
});
