"""
Merge all mentor-eval fixtures into a single unified fixtures.json.

Reads:
  - fixtures.json                              (existing 295 single-turn)
  - fixtures-conversational.json               (existing 60 multi-turn)
  - fixtures-batch-01-javascript.json          (35 JS single-turn)
  - fixtures-batch-01b-javascript-multiturn.json (15 JS multi-turn)
  - fixtures-batch-02-csharp.json              (35 C# single-turn)
  - fixtures-batch-02b-csharp-multiturn.json   (15 C# multi-turn)
  - fixtures-batch-03-cpp.json                 (35 C++ single-turn)
  - fixtures-batch-03b-cpp-multiturn.json      (15 C++ multi-turn)
  - fixtures-batch-04-c.json                   (35 C single-turn)
  - fixtures-batch-04b-c-multiturn.json        (15 C multi-turn)
  - fixtures-batch-05-java.json                (35 Java single-turn)
  - fixtures-batch-05b-java-multiturn.json     (15 Java multi-turn)
  - fixtures-batch-06-refusal.json             (72 refusal/safety)

Writes:
  - fixtures.json                              (unified — all entries here)
  - fixtures.before-merge.backup.json          (safety backup of original)
  - fixtures-conversational.legacy.json        (legacy file, kept as-is)

After the merge, mentor-smoke.ts reads one file. Single-turn entries omit
`turns`; multi-turn entries include a `turns` array. The runner auto-detects.

Run:
    python evals/merge-all-fixtures.py            # dry-run (preview)
    python evals/merge-all-fixtures.py --apply    # actually merge
"""

import json
import sys
import shutil
import collections
from pathlib import Path

HERE = Path(__file__).parent.resolve()
APPLY = "--apply" in sys.argv

EXISTING = [
    ("fixtures.json",                              "single-turn-legacy"),
    ("fixtures-conversational.json",               "multi-turn-legacy"),
]

BATCHES = [
    ("fixtures-batch-01-javascript.json",          "single-turn-new"),
    ("fixtures-batch-01b-javascript-multiturn.json", "multi-turn-new"),
    ("fixtures-batch-02-csharp.json",              "single-turn-new"),
    ("fixtures-batch-02b-csharp-multiturn.json",   "multi-turn-new"),
    ("fixtures-batch-03-cpp.json",                 "single-turn-new"),
    ("fixtures-batch-03b-cpp-multiturn.json",      "multi-turn-new"),
    ("fixtures-batch-04-c.json",                   "single-turn-new"),
    ("fixtures-batch-04b-c-multiturn.json",        "multi-turn-new"),
    ("fixtures-batch-05-java.json",                "single-turn-new"),
    ("fixtures-batch-05b-java-multiturn.json",     "multi-turn-new"),
    ("fixtures-batch-06-refusal.json",             "single-turn-new"),
]


def load(name):
    p = HERE / name
    if not p.exists():
        print(f"  ⚠ missing: {name}")
        return []
    with p.open(encoding="utf-8") as f:
        return json.load(f)


def main():
    print("=== MERGE-ALL-FIXTURES ===\n")

    all_entries = []
    source_counts = {}

    for name, label in EXISTING + BATCHES:
        entries = load(name)
        source_counts[name] = len(entries)
        for e in entries:
            all_entries.append(e)
        print(f"  {name:55s} +{len(entries)}  ({label})")

    print()
    print(f"Total entries collected: {len(all_entries)}")

    # ID collision check
    ids = collections.Counter(e.get("id", "") for e in all_entries)
    dups = [i for i, c in ids.items() if c > 1 and i]
    if dups:
        print(f"\n  ⚠ DUPLICATE IDs ({len(dups)}):")
        for d in dups[:10]:
            print(f"    - {d}")
        if len(dups) > 10:
            print(f"    ... and {len(dups) - 10} more")
        print("\nAborting: resolve duplicate IDs before merging.")
        sys.exit(1)

    # Stats: per language
    by_lang = collections.Counter(e.get("language", "?") for e in all_entries)
    print("\nFinal language distribution:")
    for lang, n in by_lang.most_common():
        bar = "#" * min(n, 60)
        print(f"  {lang:11s} {n:4d}  {bar}")

    # Stats: per category
    by_cat = collections.Counter(e.get("category", "?") for e in all_entries)
    print("\nFinal category distribution (top 20):")
    for cat, n in by_cat.most_common(20):
        bar = "#" * min(n, 40)
        print(f"  {cat:32s} {n:4d}  {bar}")

    # Stats: shape (single vs multi)
    single = sum(1 for e in all_entries if not isinstance(e.get("turns"), list))
    multi  = len(all_entries) - single
    print(f"\nShape breakdown:")
    print(f"  single-turn (no 'turns' array): {single}")
    print(f"  multi-turn  (with 'turns'):     {multi}")
    multi_turns = sum(len(e["turns"]) for e in all_entries if isinstance(e.get("turns"), list))
    print(f"  total turn-level data points:   {single} + {multi_turns} = {single + multi_turns}")

    if not APPLY:
        print("\n[merge] DRY RUN — no files modified.")
        print("[merge] To apply: rerun with --apply")
        return

    # Backups
    fixtures_path = HERE / "fixtures.json"
    backup_path   = HERE / "fixtures.before-merge.backup.json"
    multi_path    = HERE / "fixtures-conversational.json"
    multi_legacy  = HERE / "fixtures-conversational.legacy.json"

    if fixtures_path.exists():
        shutil.copy2(fixtures_path, backup_path)
        print(f"\n[merge] backed up original → {backup_path.name}")
    if multi_path.exists():
        shutil.copy2(multi_path, multi_legacy)
        print(f"[merge] backed up multi-turn → {multi_legacy.name}")

    # Write merged
    with fixtures_path.open("w", encoding="utf-8") as f:
        json.dump(all_entries, f, indent=2, ensure_ascii=False)
    print(f"[merge] wrote {fixtures_path.name} with {len(all_entries)} entries")

    # Empty the legacy multi-turn file (it's now redundant; legacy preserved as backup)
    with multi_path.open("w", encoding="utf-8") as f:
        f.write("[]\n")
    print(f"[merge] emptied {multi_path.name} (data is now in fixtures.json)")

    print("\n[merge] Done.")
    print(f"[merge] mentor-smoke.ts will read just fixtures.json ({len(all_entries)} entries).")


if __name__ == "__main__":
    main()
