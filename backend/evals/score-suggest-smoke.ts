/**
 * Score-suggest evaluation runner.
 *
 * Loads fixtures from fixtures-score-suggest.json, calls suggestScore()
 * directly (bypassing the HTTP route and auth — we're testing the AI
 * judgment, not the routing layer), and writes per-fixture output to
 *   evals/results/score-suggest-eval-<timestamp>.json
 *
 * The output file is the input to score-suggest-judge.ts which runs the
 * tri-judge evaluation on the AI's suggested scores.
 *
 * Usage (inside backend container):
 *   docker compose exec backend npx tsx evals/score-suggest-smoke.ts
 *
 * Optional:
 *   --fixtures path/to/custom.json   override the fixture file
 *   --gap-ms 7000                    delay between fixtures (default 7000)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  suggestScore,
  type ExecutionContext,
} from "../src/services/scoreSuggestionService";
import type { RubricCriterion } from "../src/services/rubricService";

// ── Types ────────────────────────────────────────────────────────────────────

type Fixture = {
  id: string;
  category: string;
  expectedBehavior: string;
  expectedScoreRange: [number, number];
  problemTitle: string;
  problemDescription: string;
  language: string;
  referenceSolution: string | null;
  studentCode: string;
  criteria: RubricCriterion[];
  exec: ExecutionContext | null;
};

type FixtureResult = {
  id: string;
  category: string;
  expectedBehavior: string;
  expectedScoreRange: [number, number];
  input: {
    problemTitle: string;
    language: string;
    studentCodeChars: number;
    criteriaCount: number;
    execStatus: string;
    publicPassed: number | null;
    publicTotal: number | null;
    hiddenPassed: number | null;
    hiddenTotal: number | null;
    studentCode: string;
    referenceSolution: string | null;
    criteria: RubricCriterion[];
    exec: ExecutionContext | null;
  };
  ok: boolean;
  error: string | null;
  latencyMs: number;
  suggestion: {
    breakdown: Array<{ name: string; maxScore: number; suggested: number; comment: string }>;
    totalScore: number;
    maxTotal: number;
    generalNotes: string;
  } | null;
  model: string | null;
};

// ── CLI ──────────────────────────────────────────────────────────────────────

type Args = { fixturesPath: string; minGapMs: number };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
  };
  return {
    fixturesPath: get("--fixtures") ?? path.join(__dirname, "fixtures-score-suggest.json"),
    minGapMs: Math.max(0, Number.parseInt(get("--gap-ms") ?? "7000", 10) || 7000),
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  const raw = await readFile(args.fixturesPath, "utf8");
  const fixtures = JSON.parse(raw) as Fixture[];

  console.log(`[score-suggest-smoke] fixtures=${fixtures.length} gap=${args.minGapMs}ms`);

  const results: FixtureResult[] = [];
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    if (i > 0) await sleep(args.minGapMs);

    process.stdout.write(`[${i + 1}/${fixtures.length}] ${f.id} (${f.category}) ... `);
    const start = Date.now();
    let result: FixtureResult;
    try {
      const r = await suggestScore(
        f.problemTitle,
        f.problemDescription,
        f.language,
        f.studentCode,
        f.criteria,
        f.referenceSolution,
        f.exec,
      );
      const latencyMs = Date.now() - start;

      if (!r.success) {
        result = {
          id: f.id,
          category: f.category,
          expectedBehavior: f.expectedBehavior,
          expectedScoreRange: f.expectedScoreRange,
          input: buildInputBlock(f),
          ok: false,
          error: r.error,
          latencyMs,
          suggestion: null,
          model: null,
        };
        process.stdout.write(`FAIL — ${r.error}\n`);
      } else {
        result = {
          id: f.id,
          category: f.category,
          expectedBehavior: f.expectedBehavior,
          expectedScoreRange: f.expectedScoreRange,
          input: buildInputBlock(f),
          ok: true,
          error: null,
          latencyMs,
          suggestion: r.suggestion,
          model: r.model,
        };
        const inRange =
          r.suggestion.totalScore >= f.expectedScoreRange[0] &&
          r.suggestion.totalScore <= f.expectedScoreRange[1];
        const rangeFlag = inRange ? "✓" : "⚠";
        process.stdout.write(
          `OK (${latencyMs} ms, score=${r.suggestion.totalScore}/${r.suggestion.maxTotal} ${rangeFlag} expected [${f.expectedScoreRange[0]}-${f.expectedScoreRange[1]}])\n`,
        );
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      result = {
        id: f.id,
        category: f.category,
        expectedBehavior: f.expectedBehavior,
        expectedScoreRange: f.expectedScoreRange,
        input: buildInputBlock(f),
        ok: false,
        error: err,
        latencyMs: Date.now() - start,
        suggestion: null,
        model: null,
      };
      process.stdout.write(`ERROR — ${err}\n`);
    }
    results.push(result);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultsDir = path.join(__dirname, "results");
  await mkdir(resultsDir, { recursive: true });

  const inRangeCount = results.filter(
    (r) =>
      r.ok &&
      r.suggestion &&
      r.suggestion.totalScore >= r.expectedScoreRange[0] &&
      r.suggestion.totalScore <= r.expectedScoreRange[1],
  ).length;

  const meta = {
    runAt: new Date().toISOString(),
    fixtureCount: results.length,
    ok: results.filter((r) => r.ok).length,
    errored: results.filter((r) => !r.ok).length,
    totalLatencyMs: results.reduce((s, r) => s + r.latencyMs, 0),
    avgLatencyMs: Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / Math.max(results.length, 1)),
    inExpectedRange: inRangeCount,
    inRangeRatio: `${inRangeCount}/${results.length}`,
  };

  const jsonPath = path.join(resultsDir, `score-suggest-eval-${stamp}.json`);
  await writeFile(jsonPath, JSON.stringify({ meta, results }, null, 2), "utf8");

  console.log("");
  console.log(`[score-suggest-smoke] done — ${meta.ok} ok, ${meta.errored} errored, ${meta.inRangeRatio} in expected range`);
  console.log(`[score-suggest-smoke] JSON: ${jsonPath}`);
}

function buildInputBlock(f: Fixture): FixtureResult["input"] {
  return {
    problemTitle: f.problemTitle,
    language: f.language,
    studentCodeChars: f.studentCode.length,
    criteriaCount: f.criteria.length,
    execStatus: f.exec?.normalizedStatus ?? "no-exec",
    publicPassed: f.exec?.publicPassed ?? null,
    publicTotal: f.exec?.publicTotal ?? null,
    hiddenPassed: f.exec?.hiddenPassed ?? null,
    hiddenTotal: f.exec?.hiddenTotal ?? null,
    studentCode: f.studentCode,
    referenceSolution: f.referenceSolution,
    criteria: f.criteria,
    exec: f.exec,
  };
}

main().catch((e) => {
  console.error("[score-suggest-smoke] fatal:", e);
  process.exit(1);
});
