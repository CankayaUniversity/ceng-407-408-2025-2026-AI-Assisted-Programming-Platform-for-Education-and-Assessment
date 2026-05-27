"""
Total-based rebalance: cap each language at 80 fixtures (includes refusal).

Unlike rebalance-fixtures.ts which only touches "normal" fixtures, this script
counts EVERY fixture (normal + refusal + locale + everything) against the
80-per-language cap. The goal is post-merge fixtures.json to have roughly
equal language representation regardless of category.

Selection strategy when trimming:
  1. Group fixtures within a language by category.
  2. Allocate the 80-slot budget proportionally across categories.
  3. Within each category, sort by id and keep the first N.
  4. Move the rest to fixtures-archive.json with metadata.

Refusal categories WITHOUT language attachment (jailbreak/identity/fragmented
that don't have a strong language link) stay regardless — they're language-
tagged but the attack is language-agnostic.

Run:
    python evals/rebalance-total-80.py            # dry-run preview
    python evals/rebalance-total-80.py --apply    # actually trim
"""

import collections
import json
import math
import shutil
import sys
from pathlib import Path
import os

base = Path(r"C:/Users/gkden/OneDrive/Masaüstü/ceng-407-408-2025-2026-AI-Assisted-Programming-Platform-for-Education-and-Assessment/backend/evals")
os.chdir(base)

APPLY = "--apply" in sys.argv
TARGET = 80

LANGUAGES = ["python", "c", "cpp", "java", "javascript", "csharp"]


def allocate(by_cat, target):
    """Proportionally allocate `target` slots across categories.
    Guarantee each non-empty category gets at least 1 if possible."""
    cats = list(by_cat.keys())
    total = sum(len(by_cat[c]) for c in cats)
    if total <= target:
        return {c: len(by_cat[c]) for c in cats}

    # First pass: floor of proportional share
    out = {}
    for c in cats:
        share = math.floor(len(by_cat[c]) / total * target)
        out[c] = share

    # Guarantee min 1 per non-empty category by stealing from biggest
    for c in cats:
        if len(by_cat[c]) > 0 and out[c] == 0:
            biggest = max(out, key=lambda k: out[k])
            if out[biggest] > 1:
                out[biggest] -= 1
                out[c] = 1

    # Distribute remainder to categories with largest fractional part
    remainder = target - sum(out.values())
    if remainder > 0:
        fracs = sorted(
            cats,
            key=lambda c: (len(by_cat[c]) / total * target) - out[c],
            reverse=True,
        )
        for c in fracs[:remainder]:
            if out[c] < len(by_cat[c]):
                out[c] += 1
    return out


def main():
    fixtures_path = base / "fixtures.json"
    archive_path  = base / "fixtures-archive.json"
    backup_path   = base / "fixtures.before-rebalance-80.backup.json"

    fixtures = json.loads(fixtures_path.read_text(encoding="utf-8"))

    print("=== REBALANCE-TOTAL-80 ===")
    print("")

    # Group by language
    by_lang = collections.defaultdict(list)
    other = []
    for f in fixtures:
        lang = f.get("language", "")
        if lang in LANGUAGES:
            by_lang[lang].append(f)
        else:
            other.append(f)

    print("Per-language summary:")
    print("")
    print("  language     before  target  after  archived")
    print("  ----------  ------- ------- ------ ---------")

    kept_ids = set()
    archived_ids = set()
    per_lang_report = {}

    for lang in LANGUAGES:
        items = by_lang[lang]
        if len(items) <= TARGET:
            # No trim needed
            for f in items:
                kept_ids.add(f["id"])
            per_lang_report[lang] = (len(items), len(items), 0, {})
            print("  {:11s}  {:5d}    {:5d}  {:5d}  {:7d}".format(
                lang, len(items), TARGET, len(items), 0))
            continue

        # Group by category, allocate, select
        by_cat = collections.defaultdict(list)
        for f in items:
            by_cat[f.get("category", "?")].append(f)
        alloc = allocate(by_cat, TARGET)

        breakdown = {}
        for cat, slot in alloc.items():
            cat_items = sorted(by_cat[cat], key=lambda x: x["id"])
            for f in cat_items[:slot]:
                kept_ids.add(f["id"])
            for f in cat_items[slot:]:
                archived_ids.add(f["id"])
            breakdown[cat] = (len(by_cat[cat]), slot)

        per_lang_report[lang] = (len(items), TARGET, len(items) - TARGET, breakdown)
        print("  {:11s}  {:5d}    {:5d}  {:5d}  {:7d}".format(
            lang, len(items), TARGET, TARGET, len(items) - TARGET))

    # Fixtures with no recognized language (shouldn't happen but be safe)
    for f in other:
        kept_ids.add(f["id"])

    kept = [f for f in fixtures if f["id"] in kept_ids]
    archived = [f for f in fixtures if f["id"] in archived_ids]

    print("")
    print("Totals:")
    print("  Before:   {}".format(len(fixtures)))
    print("  After:    {}".format(len(kept)))
    print("  Archived: {}".format(len(archived)))
    print("")

    # Per-language category breakdown for languages we trimmed
    for lang in LANGUAGES:
        before, after, archived_n, breakdown = per_lang_report[lang]
        if archived_n == 0:
            continue
        print("  {} ({} -> {}, archive {}):".format(lang, before, after, archived_n))
        for cat, (had, kept_n) in sorted(breakdown.items()):
            archived_in_cat = had - kept_n
            flag = "  <- archive {}".format(archived_in_cat) if archived_in_cat > 0 else ""
            print("    {:30s} {:3d} -> {:3d}{}".format(cat, had, kept_n, flag))
        print("")

    if not APPLY:
        print("[rebalance] DRY RUN - no files modified.")
        print("[rebalance] To apply: rerun with --apply")
        return

    # Back up + write
    shutil.copy2(fixtures_path, backup_path)
    print("[rebalance] backed up original -> {}".format(backup_path.name))

    fixtures_path.write_text(json.dumps(kept, indent=2, ensure_ascii=False), encoding="utf-8")
    print("[rebalance] wrote {} ({} entries)".format(fixtures_path.name, len(kept)))

    # Merge with existing archive if any
    existing_archive = []
    if archive_path.exists():
        try:
            existing_archive = json.loads(archive_path.read_text(encoding="utf-8"))
        except Exception:
            existing_archive = []
    # Annotate new archived entries
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    for f in archived:
        f["__archivedReason"] = "rebalance-total-80"
        f["__archivedAt"] = now
    combined = existing_archive + archived
    archive_path.write_text(json.dumps(combined, indent=2, ensure_ascii=False), encoding="utf-8")
    print("[rebalance] wrote {} ({} entries, +{} new)".format(
        archive_path.name, len(combined), len(archived)))

    print("")
    print("[rebalance] Done.")


if __name__ == "__main__":
    main()
