/**
 * Merge fixtures.json + fixtures-conversational.json into ONE unified file.
 *
 * The two files used to live separately because they had different shapes:
 *   - fixtures.json:                each entry = a single student turn
 *   - fixtures-conversational.json: each entry has a `turns: [...]` array
 *
 * mentor-smoke.ts already accepts both shapes in one file (it auto-detects
 * `turns?` per entry). This script merges them so the team works with ONE
 * fixtures file from now on.
 *
 * Safety:
 *   - Original files are backed up to *.legacy.json before any overwrite.
 *   - The script is idempotent: re-running with already-merged data is a no-op.
 *
 * Usage:
 *   npx tsx evals/unify-fixtures.ts             # dry-run preview
 *   npx tsx evals/unify-fixtures.ts --apply     # actually merge
 */

import { readFile, writeFile, copyFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

type Turn = {
  studentQuestion: string;
  studentCode?: string;
  stderr?: string | null;
  stdout?: string | null;
};

type Fixture = {
  id: string;
  category: string;
  language: string;
  studentQuestion?: string;
  studentCode?: string;
  stderr?: string | null;
  stdout?: string | null;
  problemDescription?: string;
  turns?: Turn[];
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const singleTurnPath  = path.resolve(__dirname, "fixtures.json");
  const multiTurnPath   = path.resolve(__dirname, "fixtures-conversational.json");
  const legacySingle    = path.resolve(__dirname, "fixtures.legacy-single.json");
  const legacyMulti     = path.resolve(__dirname, "fixtures-conversational.legacy.json");

  if (!(await fileExists(singleTurnPath))) {
    console.error(`Missing: ${singleTurnPath}`);
    process.exit(2);
  }

  const single: Fixture[] = JSON.parse(await readFile(singleTurnPath, "utf-8"));

  // If conversational file doesn't exist, assume already merged.
  let multi: Fixture[] = [];
  if (await fileExists(multiTurnPath)) {
    multi = JSON.parse(await readFile(multiTurnPath, "utf-8"));
  } else {
    console.log("No fixtures-conversational.json found — assuming already merged.");
    console.log(`fixtures.json: ${single.length} entries (no changes needed)`);
    return;
  }

  // Idempotency: if every multi-file ID is already present in single, the
  // merge has already happened — don't duplicate. (Note: fixtures.json may
  // legitimately contain SOME entries with `turns` arrays from the start —
  // e.g. the "multi-turn-iterative" category was authored directly into
  // fixtures.json, separately from fixtures-conversational.json.)
  const singleIds = new Set(single.map((f) => f.id));
  const overlap = multi.filter((f) => singleIds.has(f.id));
  if (overlap.length === multi.length && multi.length > 0) {
    console.log("All fixtures-conversational entries are already present in fixtures.json.");
    console.log("Already merged. No action taken.");
    return;
  }

  // Sanity check on multi-turn entries: each must have a turns array of ≥ 2.
  for (const m of multi) {
    if (!Array.isArray(m.turns) || m.turns.length < 1) {
      console.error(`Malformed multi-turn fixture: ${m.id}`);
      process.exit(2);
    }
  }

  // ID collision check
  const ids = new Set<string>();
  const collisions: string[] = [];
  for (const f of [...single, ...multi]) {
    if (ids.has(f.id)) collisions.push(f.id);
    ids.add(f.id);
  }
  if (collisions.length > 0) {
    console.error(`ID collisions detected: ${collisions.slice(0, 5).join(", ")}${collisions.length > 5 ? "..." : ""}`);
    process.exit(2);
  }

  // Merged set: single-turn entries kept as-is (no `turns` array), multi-turn
  // entries kept as-is (with their `turns` array). mentor-smoke.ts handles
  // both shapes natively.
  const merged: Fixture[] = [...single, ...multi];

  console.log("=== MERGE PLAN ===");
  console.log(`Single-turn (fixtures.json):                   ${single.length}`);
  console.log(`Multi-turn  (fixtures-conversational.json):    ${multi.length}`);
  console.log(`After merge (one fixtures.json):               ${merged.length}`);
  console.log("");
  console.log("Backups will be created:");
  console.log(`  ${singleTurnPath} → ${legacySingle}`);
  console.log(`  ${multiTurnPath}  → ${legacyMulti}`);
  console.log("");

  if (!apply) {
    console.log("[unify] DRY RUN — no files modified.");
    console.log("[unify] To apply: re-run with --apply");
    return;
  }

  // Back up originals
  await copyFile(singleTurnPath, legacySingle);
  await copyFile(multiTurnPath,  legacyMulti);
  console.log(`[unify] backed up to ${legacySingle}`);
  console.log(`[unify] backed up to ${legacyMulti}`);

  // Write merged
  await writeFile(singleTurnPath, JSON.stringify(merged, null, 2), "utf-8");
  console.log(`[unify] wrote merged ${singleTurnPath} (${merged.length} entries)`);

  // Remove the now-redundant multi-turn file (the legacy backup remains)
  await writeFile(multiTurnPath, "[]\n", "utf-8");
  console.log(`[unify] emptied ${multiTurnPath} (kept as empty array for backward compat; can be deleted)`);

  console.log("");
  console.log("[unify] Done.");
  console.log("[unify] mentor-smoke.ts auto-detects single vs multi-turn per entry — no runner changes needed.");
  console.log("[unify] Verify with: npx tsx evals/expand-fixtures.ts --analyze");
}

main().catch((err) => {
  console.error("[unify] fatal:", err);
  process.exit(1);
});
