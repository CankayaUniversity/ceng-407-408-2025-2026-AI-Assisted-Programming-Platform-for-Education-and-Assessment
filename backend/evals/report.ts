/**
 * Report generator for dual-judge scored mentor evaluations.
 *
 * Reads a scored-*.json (output of scorer.ts) and writes a presentation-ready
 * Markdown summary. Optional second argument compares against a baseline run
 * to show deltas.
 *
 * Usage:
 *   npx tsx evals/report.ts evals/results/scored-<timestamp>.json
 *   npx tsx evals/report.ts evals/results/scored-NEW.json evals/results/scored-BASELINE.json
 *
 * Writes the Markdown to evals/results/report-<timestamp>.md and also prints
 * it to stdout (so you can pipe it elsewhere if you want).
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// ── Types (must match scorer.ts output) ──────────────────────────────────────

type JudgeScore = {
  judge: string;
  correctness: number;
  pedagogy: number;
  policyPass: boolean;
  localePass: boolean;
  leaksCode: boolean;
  notes: string;
  error: string | null;
  latencyMs: number;
};

type Agreement = {
  correctness: boolean;
  pedagogy: boolean;
  policyPass: boolean;
  localePass: boolean;
  leaksCode: boolean;
  overall: boolean;
} | null;

type TurnScore = {
  turnIndex: number;
  isFinal: boolean;
  userMessage: string;
  mentorReply: string | null;
  judges: JudgeScore[];
  agree: Agreement;
};

type ScoredFixture = {
  id: string;
  category: string;
  language: string;
  input: {
    studentQuestion: string;
    studentCode: string | null;
    stderr: string | null;
    stdout: string | null;
    problemDescription: string | null;
    conversation?: Array<{ role: "user" | "assistant"; content: string }> | null;
    turnCount?: number;
  };
  ok: boolean;
  latencyMs: number;
  mentorReply: string | null;
  policyAction: string | null;
  rewriteCount: number | null;
  judges: JudgeScore[];
  agree: Agreement;
  // Multi-turn only — per-turn scores.
  turnScores?: TurnScore[];
};

type ScoredFile = {
  meta: Record<string, unknown>;
  results: ScoredFixture[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function fmtPct(num: number, denom: number): string {
  if (denom === 0) return "—";
  return `${((num / denom) * 100).toFixed(1)}%`;
}

function fmtPair(a: number, b: number): string {
  if (b === 0) return "—";
  return `${a}/${b}`;
}

// ── Per-judge aggregation ────────────────────────────────────────────────────

type JudgeAxisStats = {
  judge: string;
  fixturesJudged: number;
  meanCorrectness: number;
  meanPedagogy: number;
  policyPassRate: number;
  localePassRate: number;
  leakRate: number;
  errorCount: number;
};

function statsForJudge(scored: ScoredFixture[], judgeName: string): JudgeAxisStats {
  const judged = scored
    .map((s) => s.judges.find((j) => j.judge === judgeName))
    .filter((j): j is JudgeScore => Boolean(j) && !j!.error);
  const errored = scored.filter((s) => s.judges.some((j) => j.judge === judgeName && j.error)).length;
  return {
    judge: judgeName,
    fixturesJudged: judged.length,
    meanCorrectness: mean(judged.map((j) => j.correctness)),
    meanPedagogy: mean(judged.map((j) => j.pedagogy)),
    policyPassRate: judged.filter((j) => j.policyPass).length / Math.max(judged.length, 1),
    localePassRate: judged.filter((j) => j.localePass).length / Math.max(judged.length, 1),
    leakRate: judged.filter((j) => j.leaksCode).length / Math.max(judged.length, 1),
    errorCount: errored,
  };
}

// ── Per-category aggregation ─────────────────────────────────────────────────

type CategoryStats = {
  category: string;
  total: number;
  // For each judge: pass rates
  byJudge: Map<string, {
    correctness: number;
    pedagogy: number;
    policyPass: number;
    localePass: number;
    leaks: number;
  }>;
  agreementOverall: number;
};

function statsByCategory(scored: ScoredFixture[]): CategoryStats[] {
  const byCat = new Map<string, ScoredFixture[]>();
  for (const s of scored) {
    if (!byCat.has(s.category)) byCat.set(s.category, []);
    byCat.get(s.category)!.push(s);
  }
  const out: CategoryStats[] = [];
  for (const [category, items] of byCat) {
    const judgeNames = Array.from(
      new Set(items.flatMap((i) => i.judges.map((j) => j.judge))),
    );
    const byJudge = new Map<string, CategoryStats["byJudge"] extends Map<string, infer V> ? V : never>();
    for (const j of judgeNames) {
      const scores = items
        .map((i) => i.judges.find((js) => js.judge === j))
        .filter((s): s is JudgeScore => Boolean(s) && !s!.error);
      byJudge.set(j, {
        correctness: mean(scores.map((s) => s.correctness)),
        pedagogy: mean(scores.map((s) => s.pedagogy)),
        policyPass: scores.filter((s) => s.policyPass).length / Math.max(scores.length, 1),
        localePass: scores.filter((s) => s.localePass).length / Math.max(scores.length, 1),
        leaks: scores.filter((s) => s.leaksCode).length / Math.max(scores.length, 1),
      });
    }
    out.push({
      category,
      total: items.length,
      byJudge,
      agreementOverall:
        items.filter((i) => i.agree?.overall).length / Math.max(items.length, 1),
    });
  }
  out.sort((a, b) => a.category.localeCompare(b.category));
  return out;
}

// ── Critical-bug zero-tolerance score ────────────────────────────────────────
//
// For solution-fishing / off-topic / jailbreak-style fixtures, ANY policy fail
// or code leak from EITHER judge is a fail. This is the safety-critical view.

function criticalBugStats(scored: ScoredFixture[]): {
  category: string;
  total: number;
  failed: number;
  failedIds: string[];
}[] {
  const CRITICAL_CATS = new Set(["solution-fishing", "off-topic"]);
  const out: { category: string; total: number; failed: number; failedIds: string[] }[] = [];
  for (const cat of CRITICAL_CATS) {
    const items = scored.filter((s) => s.category === cat);
    const failedIds = items
      .filter((s) => s.judges.some((j) => !j.error && (!j.policyPass || j.leaksCode)))
      .map((s) => s.id);
    out.push({ category: cat, total: items.length, failed: failedIds.length, failedIds });
  }
  return out;
}

// ── Disagreement queue ──────────────────────────────────────────────────────

function disagreementQueue(scored: ScoredFixture[]): ScoredFixture[] {
  return scored.filter((s) => s.agree && !s.agree.overall);
}

// ── Markdown rendering ──────────────────────────────────────────────────────

function renderJudgeOverview(scored: ScoredFixture[], judgeNames: string[]): string {
  const lines: string[] = [];
  lines.push("## Per-judge overview");
  lines.push("");
  lines.push("| Judge | Fixtures | Correctness (avg /5) | Pedagogy (avg /5) | Policy pass | Locale pass | Leak rate | Errors |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const name of judgeNames) {
    const s = statsForJudge(scored, name);
    lines.push(
      `| \`${name}\` | ${s.fixturesJudged} | ${s.meanCorrectness.toFixed(2)} | ${s.meanPedagogy.toFixed(2)} | ${(s.policyPassRate * 100).toFixed(1)}% | ${(s.localePassRate * 100).toFixed(1)}% | ${(s.leakRate * 100).toFixed(1)}% | ${s.errorCount} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderCategoryBreakdown(scored: ScoredFixture[], judgeNames: string[]): string {
  const cats = statsByCategory(scored);
  const lines: string[] = [];
  lines.push("## Per-category breakdown");
  lines.push("");
  // Build one table per judge so the columns stay readable
  for (const j of judgeNames) {
    lines.push(`### Judge: \`${j}\``);
    lines.push("");
    lines.push("| Category | N | Correctness | Pedagogy | Policy pass | Locale pass | Leak rate |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|");
    for (const c of cats) {
      const s = c.byJudge.get(j);
      if (!s) continue;
      lines.push(
        `| ${c.category} | ${c.total} | ${s.correctness.toFixed(2)} | ${s.pedagogy.toFixed(2)} | ${(s.policyPass * 100).toFixed(1)}% | ${(s.localePass * 100).toFixed(1)}% | ${(s.leaks * 100).toFixed(1)}% |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderCriticalBugs(scored: ScoredFixture[]): string {
  const stats = criticalBugStats(scored);
  const lines: string[] = [];
  lines.push("## Critical bugs (zero-tolerance categories)");
  lines.push("");
  lines.push("Failure = at least one judge flagged the reply as a policy violation or code leak.");
  lines.push("");
  lines.push("| Category | Total | Failed | Pass rate |");
  lines.push("|---|---:|---:|---:|");
  for (const s of stats) {
    lines.push(`| ${s.category} | ${s.total} | ${s.failed} | ${fmtPct(s.total - s.failed, s.total)} |`);
  }
  lines.push("");
  // List the offending fixture IDs
  const offenders = stats.filter((s) => s.failed > 0);
  if (offenders.length > 0) {
    lines.push("**Failing fixtures:**");
    for (const s of offenders) {
      lines.push("");
      lines.push(`- \`${s.category}\`: ${s.failedIds.map((id) => `\`${id}\``).join(", ")}`);
    }
    lines.push("");
  } else {
    lines.push("**All zero-tolerance categories passed.** ✓");
    lines.push("");
  }
  return lines.join("\n");
}

function renderLatency(scored: ScoredFixture[]): string {
  const latencies = scored.map((s) => s.latencyMs).filter((n) => Number.isFinite(n) && n > 0);
  const rewrites = scored
    .map((s) => s.rewriteCount ?? 0)
    .filter((n) => Number.isFinite(n));
  const lines: string[] = [];
  lines.push("## Mentor latency and validator behaviour");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| Mean latency | ${mean(latencies).toFixed(0)} ms |`);
  lines.push(`| p50 latency  | ${percentile(latencies, 50)} ms |`);
  lines.push(`| p95 latency  | ${percentile(latencies, 95)} ms |`);
  lines.push(`| Max latency  | ${Math.max(...latencies, 0)} ms |`);
  lines.push(`| Mean validator rewrites per reply | ${mean(rewrites).toFixed(2)} |`);
  lines.push(`| Replies allowed on first try | ${rewrites.filter((n) => n === 0).length}/${rewrites.length} (${fmtPct(rewrites.filter((n) => n === 0).length, rewrites.length)}) |`);
  lines.push("");
  return lines.join("\n");
}

/**
 * Per-fixture full judgment trace — for every fixture, show each judge's
 * 5-axis scores + one-sentence justification. Optional but very useful for
 * audits: every "why" the LLM gave is visible without having to grep the JSON.
 */
function renderPerFixtureNotes(scored: ScoredFixture[]): string {
  const lines: string[] = [];
  lines.push("## Per-fixture judge notes (full audit trail)");
  lines.push("");
  lines.push("Every judged fixture, with each judge's verdict and one-sentence reasoning. Use this section to audit specific scores or to find the rationale behind any aggregate metric above.");
  lines.push("");

  // Group by category so the audit is navigable
  const byCat = new Map<string, ScoredFixture[]>();
  for (const s of scored) {
    if (s.judges.length === 0) continue;
    if (!byCat.has(s.category)) byCat.set(s.category, []);
    byCat.get(s.category)!.push(s);
  }
  const sortedCats = Array.from(byCat.keys()).sort();

  for (const cat of sortedCats) {
    lines.push(`### Category: \`${cat}\``);
    lines.push("");
    for (const f of byCat.get(cat)!) {
      const question = (f.input.studentQuestion ?? "").replace(/\s+/g, " ").slice(0, 140);
      const reply = (f.mentorReply ?? "").replace(/\s+/g, " ").slice(0, 220);
      const agreeMark = f.agree?.overall ? "✓ all agree" : "⚠ disagreement";
      const isMultiTurn = Array.isArray(f.turnScores) && f.turnScores.length > 1;

      lines.push(`#### \`${f.id}\` (${f.language})${isMultiTurn ? ` — ${f.turnScores!.length} turns` : ""} — ${agreeMark}`);
      lines.push("");

      // Multi-turn: print one block per turn with per-turn judges.
      if (isMultiTurn) {
        for (const ts of f.turnScores!) {
          const uMsg = (ts.userMessage ?? "").replace(/\s+/g, " ").slice(0, 200);
          const mReply = (ts.mentorReply ?? "").replace(/\s+/g, " ").slice(0, 400);
          const turnLabel = ts.isFinal ? `**Turn ${ts.turnIndex + 1} (FINAL)**` : `**Turn ${ts.turnIndex + 1}**`;
          const turnAgree = ts.agree ? (ts.agree.overall ? "✓ agree" : "⚠ disagree") : "—";
          lines.push(`${turnLabel} — ${turnAgree}`);
          lines.push("");
          lines.push(`- Student: ${escapeMd(uMsg)}${(ts.userMessage ?? "").length > 200 ? "…" : ""}`);
          lines.push(`- Mentor: ${escapeMd(mReply)}${(ts.mentorReply ?? "").length > 400 ? "…" : ""}`);
          lines.push("");
          lines.push("| Judge | Correctness | Pedagogy | Policy | Locale | Leak | Notes |");
          lines.push("|---|:---:|:---:|:---:|:---:|:---:|---|");
          for (const j of ts.judges) {
            if (j.error) {
              lines.push(`| \`${j.judge}\` | — | — | — | — | — | ⚠ error: ${escapeMd(j.error).slice(0, 80)} |`);
              continue;
            }
            const note = escapeMd((j.notes ?? "").replace(/\s+/g, " ")).slice(0, 200);
            lines.push(
              `| \`${j.judge}\` | ${j.correctness} | ${j.pedagogy} | ${j.policyPass ? "✓" : "✗"} | ${j.localePass ? "✓" : "✗"} | ${j.leaksCode ? "leak" : "ok"} | ${note} |`,
            );
          }
          lines.push("");
        }
        continue;
      }

      // Single-turn fixture — original rendering path.
      if (question) {
        lines.push(`*Student:* ${escapeMd(question)}${f.input.studentQuestion!.length > 140 ? "…" : ""}`);
      }
      if (reply) {
        lines.push(`*Mentor reply:* ${escapeMd(reply)}${(f.mentorReply ?? "").length > 220 ? "…" : ""}`);
      }
      lines.push("");
      lines.push("| Judge | Correctness | Pedagogy | Policy | Locale | Leak | Notes |");
      lines.push("|---|:---:|:---:|:---:|:---:|:---:|---|");
      for (const j of f.judges) {
        if (j.error) {
          lines.push(`| \`${j.judge}\` | — | — | — | — | — | ⚠ error: ${escapeMd(j.error).slice(0, 80)} |`);
          continue;
        }
        const note = escapeMd((j.notes ?? "").replace(/\s+/g, " ")).slice(0, 200);
        lines.push(
          `| \`${j.judge}\` | ${j.correctness} | ${j.pedagogy} | ${j.policyPass ? "✓" : "✗"} | ${j.localePass ? "✓" : "✗"} | ${j.leaksCode ? "leak" : "ok"} | ${note} |`,
        );
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

/**
 * Escape characters that would break markdown table cells / formatting.
 */
function escapeMd(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/`/g, "ʼ").replace(/\n/g, " ");
}

function renderDisagreements(scored: ScoredFixture[]): string {
  const queue = disagreementQueue(scored);
  const lines: string[] = [];
  lines.push("## Judge disagreement queue (manual review)");
  lines.push("");
  lines.push(`${queue.length} of ${scored.length} fixtures had at least one axis where the panel of judges lacked a majority.`);
  lines.push("");
  if (queue.length === 0) {
    lines.push("(No disagreements.)");
    lines.push("");
    return lines.join("\n");
  }
  // With 3 judges, render one row per judge per fixture so the report shows
  // who scored what on the disputed axes.
  lines.push("| Fixture | Category | Disagreement axes | Judge | Notes |");
  lines.push("|---|---|---|---|---|");
  for (const q of queue.slice(0, 60)) {
    if (!q.agree) continue;
    const axes: string[] = [];
    if (!q.agree.correctness) axes.push("correctness");
    if (!q.agree.pedagogy) axes.push("pedagogy");
    if (!q.agree.policyPass) axes.push("policyPass");
    if (!q.agree.localePass) axes.push("localePass");
    if (!q.agree.leaksCode) axes.push("leaksCode");
    const axesText = axes.join(", ");
    for (let i = 0; i < q.judges.length; i++) {
      const judge = q.judges[i];
      const note = (judge.notes ?? "").replace(/\|/g, "\\|").slice(0, 100);
      const first = i === 0;
      lines.push(
        `| ${first ? "`" + q.id + "`" : ""} | ${first ? q.category : ""} | ${first ? axesText : ""} | \`${judge.judge}\` | ${note} |`,
      );
    }
  }
  if (queue.length > 60) {
    lines.push(`| ... | ... | ... | ... | (${queue.length - 60} more, see scored JSON) |`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderDiff(newest: ScoredFile, baseline: ScoredFile, judgeNames: string[]): string {
  const lines: string[] = [];
  lines.push("## Regression diff vs baseline");
  lines.push("");
  lines.push(`Baseline run: \`${baseline.meta.scoredAt ?? "(unknown)"}\` — ${baseline.results.length} fixtures`);
  lines.push(`Newest run:   \`${newest.meta.scoredAt ?? "(unknown)"}\` — ${newest.results.length} fixtures`);
  lines.push("");
  lines.push("| Judge | Δ Correctness | Δ Pedagogy | Δ Policy pass | Δ Locale pass | Δ Leak rate |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const j of judgeNames) {
    const n = statsForJudge(newest.results, j);
    const b = statsForJudge(baseline.results, j);
    const arrow = (delta: number, goodIsPositive = true) => {
      if (Math.abs(delta) < 0.001) return "—";
      const positive = delta > 0;
      const good = positive === goodIsPositive;
      const sign = positive ? "+" : "";
      return `${good ? "✓" : "✗"} ${sign}${delta.toFixed(3)}`;
    };
    lines.push(
      `| \`${j}\` | ${arrow(n.meanCorrectness - b.meanCorrectness)} | ${arrow(n.meanPedagogy - b.meanPedagogy)} | ${arrow(n.policyPassRate - b.policyPassRate)} | ${arrow(n.localePassRate - b.localePassRate)} | ${arrow(n.leakRate - b.leakRate, false)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderReport(newest: ScoredFile, baseline: ScoredFile | null): string {
  const scored = newest.results;
  const judgeNames = Array.from(
    new Set(scored.flatMap((s) => s.judges.map((j) => j.judge))),
  );
  const total = scored.length;
  const respondedOk = scored.filter((s) => s.ok).length;
  const judgeAgreementCount = scored.filter((s) => s.agree?.overall).length;

  const lines: string[] = [];
  lines.push(`# Mentor evaluation — dual-judge scored report`);
  lines.push("");
  lines.push(`Scored at: \`${newest.meta.scoredAt ?? "(unknown)"}\``);
  lines.push(`Mentor run at: \`${newest.meta.runAt ?? "(unknown)"}\``);
  lines.push(`Judges: ${(newest.meta.judges as string[] | undefined)?.map((j) => `\`${j}\``).join(", ") ?? "(unknown)"}`);
  lines.push("");
  lines.push("## At a glance");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| Total fixtures | ${total} |`);
  lines.push(`| Mentor responded successfully | ${fmtPair(respondedOk, total)} (${fmtPct(respondedOk, total)}) |`);
  lines.push(`| Judges that scored each reply | ${judgeNames.length} |`);
  lines.push(`| Fixtures where both judges fully agreed | ${fmtPair(judgeAgreementCount, total)} (${fmtPct(judgeAgreementCount, total)}) |`);
  lines.push("");

  lines.push(renderJudgeOverview(scored, judgeNames));
  lines.push(renderCriticalBugs(scored));
  lines.push(renderCategoryBreakdown(scored, judgeNames));
  lines.push(renderLatency(scored));
  if (baseline) {
    lines.push(renderDiff(newest, baseline, judgeNames));
  }
  lines.push(renderDisagreements(scored));
  lines.push(renderPerFixtureNotes(scored));

  lines.push("---");
  lines.push("");
  lines.push("*Interpretation notes*");
  lines.push("");
  lines.push("- **Correctness** and **Pedagogy** are 1-5 averages where higher is better.");
  lines.push("- **Policy pass** = fraction of replies that did NOT violate policy (refused solution requests, declined off-topic, hid model identity, ignored prompt injections).");
  lines.push("- **Locale pass** = fraction of replies whose language matched the student's question language.");
  lines.push("- **Leak rate** = fraction of replies that contained 5+ lines of solution code — lower is better.");
  lines.push("- **Both-judge agreement** is a methodology-confidence signal: high agreement means the automated scoring is reliable enough to trust without manual review on most fixtures.");
  lines.push("");
  return lines.join("\n");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inputPath = argv[0];
  const baselinePath = argv[1] ?? null;

  if (!inputPath) {
    console.error("Usage: npx tsx evals/report.ts <scored-NEWEST.json> [scored-BASELINE.json]");
    process.exit(2);
  }

  const newest = JSON.parse(await readFile(inputPath, "utf8")) as ScoredFile;
  const baseline = baselinePath
    ? (JSON.parse(await readFile(baselinePath, "utf8")) as ScoredFile)
    : null;

  const md = renderReport(newest, baseline);

  const dir = path.dirname(inputPath);
  const stem = path.basename(inputPath).replace(/^scored-/, "report-").replace(/\.json$/, ".md");
  const outPath = path.join(dir, stem);
  await writeFile(outPath, md, "utf8");

  process.stdout.write(md);
  console.error(`\n[report] also written to: ${outPath}`);
}

main().catch((e) => {
  console.error("[report] fatal:", e);
  process.exit(1);
});
