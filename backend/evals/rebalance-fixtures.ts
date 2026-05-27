/**
 * Rebalance fixtures.json so no single language dominates the eval.
 *
 * The original fixtures.json grew organically with ~70% Python coverage —
 * which means scoring numbers really measure "how well does the mentor handle
 * Python," not the platform as a whole. This script enforces per-language
 * targets on NORMAL-scenario fixtures (debugging, conceptual, etc.) and
 * leaves REFUSAL fixtures untouched (their language is incidental — a
 * jailbreak attempt tests safety, not Python skill).
 *
 * Selection within a language preserves category diversity: it allocates the
 * per-language target across the categories present in proportion to their
 * existing counts, then keeps the first N (by id, deterministic) within each
 * category. The rest move to fixtures-archive.json with the original metadata
 * intact so the rebalance is reversible.
 *
 * Usage:
 *   # Preview — see what would happen, no files written
 *   npx tsx evals/rebalance-fixtures.ts
 *
 *   # Apply — write fixtures.json (rebalanced) + fixtures-archive.json
 *   npx tsx evals/rebalance-fixtures.ts --apply
 *
 *   # Custom targets — override the defaults
 *   npx tsx evals/rebalance-fixtures.ts --target python:50 --target c:60
 *
 *   # Dry-run with diff output suitable for PR review
 *   npx tsx evals/rebalance-fixtures.ts --verbose
 *
 * Targets (default, NORMAL fixtures only):
 *   python:     60   (top — most-taught intro language)
 *   java:       50   (full curriculum coverage)
 *   c:          50   (full curriculum coverage)
 *   cpp:        40   (secondary)
 *   javascript: 40   (secondary)
 *   csharp:     40   (secondary)
 *
 * Refusal categories are NEVER pruned — their language is a carrier, not the
 * point of the test.
 */

import { readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

// ── Types ───────────────────────────────────────────────────────────────────

type Fixture = {
  id: string;
  category: string;
  language: string;
  studentQuestion: string;
  studentCode?: string;
  stderr?: string | null;
  stdout?: string | null;
  problemDescription?: string;
};

// ── Config ──────────────────────────────────────────────────────────────────

const LANGUAGES = ["python", "c", "cpp", "java", "javascript", "csharp"] as const;
type Lang = typeof LANGUAGES[number];

// Equal coverage across all supported languages. After rebalance + generation
// every language has exactly this many NORMAL-scenario fixtures (multi-turn
// counts as one fixture toward this total, regardless of turn count). Refusal
// fixtures are NOT counted against this target — they're a separate quota.
const DEFAULT_TARGETS: Record<Lang, number> = {
  python:     100,
  c:          100,
  cpp:        100,
  java:       100,
  javascript: 100,
  csharp:     100,
};

// Categories considered REFUSAL/SAFETY — these are kept regardless of language.
const REFUSAL_CATEGORIES = new Set([
  "solution-fishing",
  "off-topic",
  "locale-turkish",
  "locale-english",
  "locale-switch",
  "jailbreak-role-play",
  "identity-probing",
  "fragmented-extraction",
]);

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const targets: Partial<Record<Lang, number>> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--target" && argv[i + 1]) {
      const [lang, n] = argv[i + 1].split(":");
      if ((LANGUAGES as readonly string[]).includes(lang)) {
        targets[lang as Lang] = Number.parseInt(n, 10);
      }
      i++;
    }
  }
  return {
    apply:   argv.includes("--apply"),
    verbose: argv.includes("--verbose"),
    targets: { ...DEFAULT_TARGETS, ...targets },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isRefusal(f: Fixture): boolean {
  return REFUSAL_CATEGORIES.has(f.category);
}

/**
 * Proportionally allocate `target` slots across categories.
 * If `byCategory` has 50 wrong-answer + 30 conceptual + 20 runtime-error
 * (100 total) and target is 60, we allocate 30 / 18 / 12.
 *
 * Edge case: every category that originally had ≥ 1 fixture gets at least 1
 * in the output (when target is large enough). Prevents losing entire
 * categories from a language.
 */
function allocate(
  byCategory: Record<string, Fixture[]>,
  target: number,
): Record<string, number> {
  const cats = Object.keys(byCategory);
  const totalAvailable = cats.reduce((s, c) => s + byCategory[c].length, 0);

  if (totalAvailable <= target) {
    // No pruning needed — keep all.
    return Object.fromEntries(cats.map((c) => [c, byCategory[c].length]));
  }

  // First pass: proportional allocation by floor.
  const out: Record<string, number> = {};
  let allocated = 0;
  for (const c of cats) {
    const share = Math.floor((byCategory[c].length / totalAvailable) * target);
    out[c] = share;
    allocated += share;
  }
  // Guarantee minimum 1 per non-empty category if we have budget left or
  // can steal from over-allocated categories.
  for (const c of cats) {
    if (byCategory[c].length > 0 && out[c] === 0) {
      // Find the biggest allocation and donate 1 to this category.
      const biggest = cats.reduce((a, b) => (out[a] > out[b] ? a : b));
      if (out[biggest] > 1) {
        out[biggest]--;
        out[c]++;
      } else {
        out[c] = 1;
        allocated++;
      }
    }
  }
  // Distribute leftover (target - allocated) to categories with the largest
  // fractional remainder.
  const remainder = target - Object.values(out).reduce((s, x) => s + x, 0);
  if (remainder > 0) {
    const fractions = cats.map((c) => ({
      cat: c,
      frac: (byCategory[c].length / totalAvailable) * target - out[c],
    }));
    fractions.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < remainder && i < fractions.length; i++) {
      const c = fractions[i].cat;
      if (out[c] < byCategory[c].length) out[c]++;
    }
  }

  return out;
}

// ── Plan computation ────────────────────────────────────────────────────────

type Plan = {
  perLanguage: Array<{
    language: Lang;
    before: number;
    after: number;
    archived: number;
    breakdown: Array<{
      category: string;
      before: number;
      after: number;
      archived: number;
    }>;
    keptIds: string[];
    archivedIds: string[];
  }>;
  refusalKeptCount: number;
  totalBefore: number;
  totalAfter: number;
  totalArchived: number;
};

function buildPlan(fixtures: Fixture[], targets: Record<Lang, number>): Plan {
  const refusal = fixtures.filter(isRefusal);
  const normal  = fixtures.filter((f) => !isRefusal(f));

  const perLanguage: Plan["perLanguage"] = [];

  for (const lang of LANGUAGES) {
    const fixturesInLang = normal.filter((f) => f.language === lang);
    const byCategory: Record<string, Fixture[]> = {};
    for (const f of fixturesInLang) {
      (byCategory[f.category] ??= []).push(f);
    }

    const target = targets[lang];
    const alloc  = allocate(byCategory, target);

    const breakdown: Plan["perLanguage"][number]["breakdown"] = [];
    const keptIds: string[]     = [];
    const archivedIds: string[] = [];

    for (const cat of Object.keys(byCategory)) {
      const items = byCategory[cat];
      const keep  = alloc[cat] ?? 0;
      // Deterministic: keep the first `keep` items by id sort
      const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
      keptIds.push(...sorted.slice(0, keep).map((f) => f.id));
      archivedIds.push(...sorted.slice(keep).map((f) => f.id));
      breakdown.push({
        category: cat,
        before:   items.length,
        after:    keep,
        archived: items.length - keep,
      });
    }

    perLanguage.push({
      language: lang,
      before:   fixturesInLang.length,
      after:    keptIds.length,
      archived: archivedIds.length,
      breakdown,
      keptIds,
      archivedIds,
    });
  }

  const totalAfter = perLanguage.reduce((s, l) => s + l.after, 0) + refusal.length;
  const totalArchived = perLanguage.reduce((s, l) => s + l.archived, 0);

  return {
    perLanguage,
    refusalKeptCount: refusal.length,
    totalBefore:      fixtures.length,
    totalAfter,
    totalArchived,
  };
}

// ── Reporting ───────────────────────────────────────────────────────────────

function printPlan(plan: Plan, verbose: boolean): void {
  console.log("=== REBALANCE PLAN ===");
  console.log("");
  console.log("Per-language summary (NORMAL fixtures only — refusal is untouched):");
  console.log("");
  console.log("  language    target  before  after  archived");
  console.log("  ─────────── ─────── ─────── ────── ────────");
  for (const lang of plan.perLanguage) {
    console.log(
      `  ${lang.language.padEnd(11)}  ${String(DEFAULT_TARGETS[lang.language]).padStart(5)}  ${String(lang.before).padStart(5)}  ${String(lang.after).padStart(5)}  ${String(lang.archived).padStart(7)}`,
    );
  }
  console.log("");
  console.log(`Refusal fixtures preserved: ${plan.refusalKeptCount}`);
  console.log("");
  console.log("Totals:");
  console.log(`  Before:   ${plan.totalBefore} fixtures`);
  console.log(`  After:    ${plan.totalAfter} fixtures`);
  console.log(`  Archived: ${plan.totalArchived} fixtures`);
  console.log("");

  if (verbose) {
    console.log("Per-language category breakdown:");
    for (const lang of plan.perLanguage) {
      if (lang.archived === 0) continue;
      console.log(`\n  ${lang.language} (${lang.before} → ${lang.after}, archive ${lang.archived}):`);
      for (const b of lang.breakdown) {
        const flag = b.archived > 0 ? ` ← archive ${b.archived}` : "";
        console.log(`    ${b.category.padEnd(24)} ${String(b.before).padStart(3)} → ${String(b.after).padStart(3)}${flag}`);
      }
    }
    console.log("");
  } else {
    console.log("(Pass --verbose to see per-category breakdown.)");
    console.log("");
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  const fixturesPath = path.resolve(__dirname, "fixtures.json");
  const archivePath  = path.resolve(__dirname, "fixtures-archive.json");
  const backupPath   = path.resolve(__dirname, "fixtures.before-rebalance.json");

  const fixtures: Fixture[] = JSON.parse(await readFile(fixturesPath, "utf-8"));
  const plan = buildPlan(fixtures, args.targets);

  printPlan(plan, args.verbose);

  if (!args.apply) {
    console.log("[rebalance] DRY RUN — no files modified.");
    console.log("[rebalance] To apply: re-run with --apply");
    return;
  }

  // Build the kept set + archived set
  const keptIds     = new Set<string>();
  const archivedIds = new Set<string>();
  for (const l of plan.perLanguage) {
    l.keptIds.forEach((id) => keptIds.add(id));
    l.archivedIds.forEach((id) => archivedIds.add(id));
  }
  // Refusal fixtures: all kept
  for (const f of fixtures) {
    if (isRefusal(f)) keptIds.add(f.id);
  }

  const kept = fixtures.filter((f) => keptIds.has(f.id));
  const archived = fixtures.filter((f) => archivedIds.has(f.id))
    .map((f) => ({
      ...f,
      __archivedReason: "rebalance — language quota",
      __archivedAt:     new Date().toISOString(),
    }));

  // Safety: back up original before overwriting
  await copyFile(fixturesPath, backupPath);
  console.log(`[rebalance] backup of original: ${backupPath}`);

  await writeFile(fixturesPath, JSON.stringify(kept, null, 2), "utf-8");
  console.log(`[rebalance] rewrote ${fixturesPath} (${kept.length} fixtures)`);

  // Merge with any pre-existing archive
  let existingArchive: Fixture[] = [];
  try {
    existingArchive = JSON.parse(await readFile(archivePath, "utf-8"));
  } catch {
    /* no existing archive — fine */
  }
  const combined = [...existingArchive, ...archived];
  await writeFile(archivePath, JSON.stringify(combined, null, 2), "utf-8");
  console.log(`[rebalance] wrote ${archivePath} (${combined.length} fixtures, +${archived.length} new)`);

  console.log("");
  console.log("[rebalance] Done.");
  console.log("[rebalance] Verify with: npx tsx evals/expand-fixtures.ts --analyze");
}

main().catch((err) => {
  console.error("[rebalance] fatal:", err);
  process.exit(1);
});
