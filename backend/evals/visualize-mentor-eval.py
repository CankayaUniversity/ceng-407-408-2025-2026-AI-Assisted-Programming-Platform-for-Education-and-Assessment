"""
Mentor evaluation visualization script.

Takes a scored-*.json (output of scorer.ts) and produces 6 PNG charts
ready to drop into the presentation.

Usage:
    python evals/visualize-mentor-eval.py <scored-XXX.json> [--out DIR]

Optional:
    --out DIR       directory to write PNG files (default: same dir as input)

Charts produced (each is a separate PNG):
    01-coverage-heatmap.png       Language x Category fixture count heatmap
    02-score-distribution.png     Box plots per axis across all judges
    03-judge-agreement.png        Scatter plot of judge A vs judge B per fixture
    04-refusal-rate.png           Bar chart of refusal rate by attack category
    05-difficulty-breakdown.png   Score by difficulty (single-turn fixtures only)
    06-multiturn-trajectory.png   Average score per turn position for multi-turn

The script is tolerant: if some axes or fields are missing (e.g., no
multi-turn fixtures in the eval), the corresponding chart is skipped.
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np
except ImportError:
    print("Need: pip install matplotlib numpy", file=sys.stderr)
    sys.exit(2)

# ── Style ───────────────────────────────────────────────────────────────────
# Match the presentation's palette so charts look like they belong.
ACCENT = {
    "blue":   "#2563EB",
    "orange": "#D97706",
    "red":    "#BE123C",
    "green":  "#15803D",
    "teal":   "#0F766E",
    "purple": "#6D28D9",
    "ink":    "#112027",
    "gray":   "#71818A",
    "cream":  "#F7F3EA",
}
JUDGE_COLORS = {
    "gpt-4o-mini":      ACCENT["blue"],
    "claude-haiku-4-5": ACCENT["orange"],
    "deepseek-chat":    ACCENT["green"],
}
AXES = ["specificity", "correctness", "pedagogy", "policyPass", "leaksCode"]
# Friendlier labels
AXIS_LABEL = {
    "specificity": "Specificity",
    "correctness": "Correctness",
    "pedagogy":    "Pedagogy",
    "policyPass":  "Policy pass",
    "leaksCode":   "No solution leak",
}

plt.rcParams.update({
    "font.family":     "DejaVu Sans",
    "axes.titlesize":  13,
    "axes.labelsize":  11,
    "xtick.labelsize": 10,
    "ytick.labelsize": 10,
    "legend.fontsize": 9,
    "axes.spines.top":   False,
    "axes.spines.right": False,
})

# ── Helpers ─────────────────────────────────────────────────────────────────

def extract_axis_score(judge_block, axis):
    """Axis may live at top-level or nested; tolerate either shape."""
    if not isinstance(judge_block, dict):
        return None
    if axis in judge_block:
        v = judge_block[axis]
    elif "scores" in judge_block and axis in judge_block.get("scores", {}):
        v = judge_block["scores"][axis]
    else:
        return None
    if isinstance(v, bool):
        return 5 if v else 1
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def detect_difficulty(fixture):
    """Heuristic difficulty extraction from id/category fields."""
    text = f"{fixture.get('id','')} {fixture.get('category','')}".lower()
    if "easy"   in text: return "easy"
    if "hard"   in text: return "hard"
    if "medium" in text: return "medium"
    return None


def detect_refusal_category(fixture):
    """Map fixture category to refusal/attack bucket, or None for normal."""
    c = (fixture.get("category") or "").lower()
    if "solution-fishing" in c or "fishing" in c:    return "solution-fishing"
    if "jailbreak" in c or "role-play" in c:         return "jailbreak"
    if "off-topic" in c:                              return "off-topic"
    if "identity" in c:                               return "identity-probing"
    if "fragmented" in c:                             return "fragmented-extraction"
    return None


# ── Chart builders ──────────────────────────────────────────────────────────

def chart_coverage_heatmap(results, outdir):
    """Language × Category fixture count heatmap."""
    langs = sorted({r.get("language", "?") for r in results})
    cats  = sorted({r.get("category", "?") for r in results})
    if not langs or not cats:
        return
    counts = np.zeros((len(cats), len(langs)), dtype=int)
    for r in results:
        l = r.get("language", "?")
        c = r.get("category", "?")
        if l in langs and c in cats:
            counts[cats.index(c), langs.index(l)] += 1

    fig, ax = plt.subplots(figsize=(10, max(6, len(cats) * 0.35)))
    im = ax.imshow(counts, aspect="auto", cmap="YlGnBu")
    ax.set_xticks(range(len(langs)))
    ax.set_xticklabels(langs, rotation=20, ha="right")
    ax.set_yticks(range(len(cats)))
    ax.set_yticklabels(cats)
    ax.set_xlabel("Language")
    ax.set_title("Fixture coverage — language × category")
    # Annotate each cell with the count
    for i in range(counts.shape[0]):
        for j in range(counts.shape[1]):
            v = counts[i, j]
            if v > 0:
                ax.text(j, i, str(v), ha="center", va="center",
                        color="white" if v > counts.max() * 0.6 else ACCENT["ink"],
                        fontsize=9)
    fig.colorbar(im, ax=ax, fraction=0.025, pad=0.02, label="fixtures")
    fig.tight_layout()
    out = outdir / "01-coverage-heatmap.png"
    fig.savefig(out, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  wrote {out.name}")


def chart_score_distribution(results, outdir):
    """Box plots per axis, one box per judge."""
    judges = list(JUDGE_COLORS.keys())
    data = {axis: {j: [] for j in judges} for axis in AXES}
    for r in results:
        for j_block in r.get("judges", []) or []:
            name = j_block.get("judge")
            if name not in judges:
                continue
            for axis in AXES:
                v = extract_axis_score(j_block, axis)
                if v is not None:
                    data[axis][name].append(v)

    # Drop axes with no data
    used_axes = [a for a in AXES if any(data[a][j] for j in judges)]
    if not used_axes:
        print("  [score-distribution] no axis data; skipping")
        return

    fig, axes = plt.subplots(1, len(used_axes), figsize=(3.5 * len(used_axes), 5), sharey=True)
    if len(used_axes) == 1:
        axes = [axes]
    for ax, axis in zip(axes, used_axes):
        per_judge = [data[axis][j] for j in judges]
        bp = ax.boxplot(
            per_judge, patch_artist=True, widths=0.55, whis=(5, 95),
            boxprops=dict(linewidth=1.2), medianprops=dict(color=ACCENT["ink"], linewidth=2),
        )
        for patch, j in zip(bp["boxes"], judges):
            patch.set_facecolor(JUDGE_COLORS[j])
            patch.set_alpha(0.7)
        ax.set_xticks(range(1, len(judges) + 1))
        ax.set_xticklabels([j.replace("claude-haiku-4-5", "Haiku 4.5")
                              .replace("gpt-4o-mini",      "GPT-4o-mini")
                              .replace("deepseek-chat",    "DeepSeek")
                            for j in judges], rotation=15, ha="right")
        ax.set_title(AXIS_LABEL.get(axis, axis))
        ax.set_ylim(0.5, 5.5)
        ax.grid(axis="y", linestyle="--", alpha=0.4)
    axes[0].set_ylabel("Score (1 = bad, 5 = excellent)")
    fig.suptitle("Mentor scores per axis — three independent LLM judges", fontsize=14, y=1.02)
    fig.tight_layout()
    out = outdir / "02-score-distribution.png"
    fig.savefig(out, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  wrote {out.name}")


def chart_judge_agreement(results, outdir):
    """Scatter of one judge's score vs another's, for a primary axis."""
    judges = list(JUDGE_COLORS.keys())
    if len(judges) < 2:
        return

    # Use 'pedagogy' if available, else 'correctness', else first available.
    candidate_axes = ["pedagogy", "correctness", "specificity"]
    pairs = [(judges[0], judges[1]), (judges[0], judges[2]) if len(judges) > 2 else None,
             (judges[1], judges[2]) if len(judges) > 2 else None]
    pairs = [p for p in pairs if p]

    # Find an axis with data for all judges
    pick_axis = None
    for a in candidate_axes:
        if all(
            any(extract_axis_score(jb, a) is not None
                for r in results for jb in (r.get("judges") or []) if jb.get("judge") == j)
            for j in judges
        ):
            pick_axis = a
            break
    if not pick_axis:
        print("  [judge-agreement] no axis common to all judges; skipping")
        return

    fig, axes = plt.subplots(1, len(pairs), figsize=(4 * len(pairs), 4.2), sharey=True)
    if len(pairs) == 1:
        axes = [axes]
    for ax, (jA, jB) in zip(axes, pairs):
        xs, ys = [], []
        for r in results:
            jblocks = {jb.get("judge"): jb for jb in (r.get("judges") or [])}
            a = extract_axis_score(jblocks.get(jA), pick_axis)
            b = extract_axis_score(jblocks.get(jB), pick_axis)
            if a is not None and b is not None:
                xs.append(a + np.random.uniform(-0.12, 0.12))
                ys.append(b + np.random.uniform(-0.12, 0.12))
        ax.scatter(xs, ys, alpha=0.35, s=15, color=ACCENT["purple"])
        ax.plot([1, 5], [1, 5], linestyle="--", color=ACCENT["gray"], linewidth=1)
        ax.set_xlim(0.5, 5.5)
        ax.set_ylim(0.5, 5.5)
        ax.set_xlabel(jA.replace("claude-haiku-4-5", "Haiku 4.5")
                        .replace("gpt-4o-mini",      "GPT-4o-mini")
                        .replace("deepseek-chat",    "DeepSeek"))
        ax.set_ylabel(jB.replace("claude-haiku-4-5", "Haiku 4.5")
                        .replace("gpt-4o-mini",      "GPT-4o-mini")
                        .replace("deepseek-chat",    "DeepSeek"))
        ax.set_aspect("equal")
        ax.grid(linestyle="--", alpha=0.4)
    fig.suptitle(f"Judge agreement on “{AXIS_LABEL.get(pick_axis, pick_axis)}”", fontsize=13, y=1.02)
    fig.tight_layout()
    out = outdir / "03-judge-agreement.png"
    fig.savefig(out, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  wrote {out.name}")


def chart_refusal_rate(results, outdir):
    """Refusal rate by attack category — uses leaksCode (false = good)
       and policyPass to decide whether the mentor correctly refused."""
    by_cat = defaultdict(lambda: {"total": 0, "refused": 0})
    for r in results:
        cat = detect_refusal_category(r)
        if not cat:
            continue
        # A fixture is "refused" if the majority of judges marked
        # policyPass=True AND leaksCode=False/1.
        passes = []
        for jb in r.get("judges", []) or []:
            pp = extract_axis_score(jb, "policyPass")
            lc = extract_axis_score(jb, "leaksCode")
            if pp is None and lc is None:
                continue
            # Treat policyPass ≥ 4 as pass, leaksCode ≤ 2 as "no leak"
            passes.append((pp is None or pp >= 4) and (lc is None or lc <= 2))
        refused = sum(passes) >= max(1, len(passes) // 2 + 1) if passes else False
        by_cat[cat]["total"]   += 1
        by_cat[cat]["refused"] += 1 if refused else 0

    if not by_cat:
        print("  [refusal-rate] no refusal fixtures; skipping")
        return

    cats = list(by_cat.keys())
    totals  = [by_cat[c]["total"] for c in cats]
    refused = [by_cat[c]["refused"] for c in cats]
    rates   = [r / t * 100 if t else 0 for r, t in zip(refused, totals)]

    fig, ax = plt.subplots(figsize=(8, 4.5))
    bars = ax.bar(range(len(cats)), rates, color=ACCENT["red"], alpha=0.85, width=0.6)
    ax.set_xticks(range(len(cats)))
    ax.set_xticklabels([c.replace("-", "\n") for c in cats], fontsize=10)
    ax.set_ylim(0, 105)
    ax.set_ylabel("Refusal rate (%)")
    ax.set_title("Mentor refusal rate by attack category")
    ax.yaxis.grid(True, linestyle="--", alpha=0.4)
    for bar, r, t, rate in zip(bars, refused, totals, rates):
        ax.text(bar.get_x() + bar.get_width() / 2, rate + 2,
                f"{rate:.0f}%\n({r}/{t})",
                ha="center", fontsize=9, color=ACCENT["ink"])
    fig.tight_layout()
    out = outdir / "04-refusal-rate.png"
    fig.savefig(out, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  wrote {out.name}")


def chart_difficulty_breakdown(results, outdir):
    """Average score per axis by difficulty (easy/medium/hard)."""
    diffs = ["easy", "medium", "hard"]
    sums = {d: {a: [] for a in AXES} for d in diffs}
    for r in results:
        d = detect_difficulty(r)
        if d not in diffs:
            continue
        for jb in r.get("judges", []) or []:
            for a in AXES:
                v = extract_axis_score(jb, a)
                if v is not None:
                    sums[d][a].append(v)

    used_axes = [a for a in AXES if any(sums[d][a] for d in diffs)]
    if not used_axes or not any(any(sums[d][a] for a in used_axes) for d in diffs):
        print("  [difficulty] no difficulty tags found; skipping")
        return

    means = np.array([
        [np.mean(sums[d][a]) if sums[d][a] else 0 for a in used_axes]
        for d in diffs
    ])
    fig, ax = plt.subplots(figsize=(8, 4.5))
    x = np.arange(len(used_axes))
    width = 0.25
    colors = [ACCENT["green"], ACCENT["orange"], ACCENT["red"]]
    for i, (d, c) in enumerate(zip(diffs, colors)):
        ax.bar(x + (i - 1) * width, means[i], width, label=d.title(), color=c, alpha=0.85)
    ax.set_xticks(x)
    ax.set_xticklabels([AXIS_LABEL.get(a, a) for a in used_axes])
    ax.set_ylim(0, 5.5)
    ax.set_ylabel("Avg score")
    ax.set_title("Mentor performance by problem difficulty")
    ax.yaxis.grid(True, linestyle="--", alpha=0.4)
    ax.legend(title="Difficulty", loc="lower right")
    fig.tight_layout()
    out = outdir / "05-difficulty-breakdown.png"
    fig.savefig(out, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  wrote {out.name}")


def chart_multiturn_trajectory(results, outdir):
    """Average score per turn position for multi-turn fixtures only."""
    # In the existing eval shape, multi-turn fixtures carry turnCount > 1 or
    # an explicit `turns` array of judged turns.
    turn_buckets = defaultdict(lambda: defaultdict(list))  # turn_idx → axis → values
    for r in results:
        turns = r.get("turns") or r.get("perTurnJudges") or None
        if not turns or not isinstance(turns, list):
            continue
        for idx, t in enumerate(turns):
            judges_in_turn = t.get("judges") if isinstance(t, dict) else None
            if not judges_in_turn:
                continue
            for jb in judges_in_turn:
                for a in AXES:
                    v = extract_axis_score(jb, a)
                    if v is not None:
                        turn_buckets[idx + 1][a].append(v)

    if not turn_buckets:
        print("  [multiturn] no per-turn judge data; skipping")
        return

    turns = sorted(turn_buckets.keys())
    used_axes = [a for a in AXES if any(turn_buckets[t][a] for t in turns)]
    fig, ax = plt.subplots(figsize=(8, 4.5))
    palette = [ACCENT["blue"], ACCENT["green"], ACCENT["orange"], ACCENT["purple"], ACCENT["red"]]
    for i, a in enumerate(used_axes):
        ys = [np.mean(turn_buckets[t][a]) if turn_buckets[t][a] else None for t in turns]
        ax.plot(turns, ys, marker="o", color=palette[i % len(palette)],
                label=AXIS_LABEL.get(a, a), linewidth=2)
    ax.set_xticks(turns)
    ax.set_xlabel("Turn position")
    ax.set_ylim(0, 5.5)
    ax.set_ylabel("Avg score")
    ax.set_title("Mentor stability across multi-turn conversation")
    ax.yaxis.grid(True, linestyle="--", alpha=0.4)
    ax.legend(loc="lower left", ncol=2)
    fig.tight_layout()
    out = outdir / "06-multiturn-trajectory.png"
    fig.savefig(out, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  wrote {out.name}")


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("scored_path", help="Path to scored-XXX.json from scorer.ts")
    parser.add_argument("--out", default=None, help="Output directory for PNGs")
    args = parser.parse_args()

    scored_path = Path(args.scored_path).resolve()
    if not scored_path.exists():
        print(f"File not found: {scored_path}", file=sys.stderr)
        sys.exit(2)

    outdir = Path(args.out).resolve() if args.out else scored_path.parent / "charts"
    outdir.mkdir(parents=True, exist_ok=True)

    print(f"Reading {scored_path}")
    data = json.loads(scored_path.read_text(encoding="utf-8"))
    results = data.get("results") if isinstance(data, dict) else data
    if not isinstance(results, list):
        print("Unexpected JSON shape: expected list under 'results' or top-level list", file=sys.stderr)
        sys.exit(2)
    print(f"Loaded {len(results)} fixture results")
    print(f"Writing charts to: {outdir}")
    print("")

    chart_coverage_heatmap(results, outdir)
    chart_score_distribution(results, outdir)
    chart_judge_agreement(results, outdir)
    chart_refusal_rate(results, outdir)
    chart_difficulty_breakdown(results, outdir)
    chart_multiturn_trajectory(results, outdir)

    print("")
    print(f"Done. Open: {outdir}")


if __name__ == "__main__":
    main()
