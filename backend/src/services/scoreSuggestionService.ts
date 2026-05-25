/**
 * AI-powered score suggestion service.
 *
 * Given a student's code submission, live execution results (from Judge0 via
 * SubmissionAttempt), and a rubric, calls Ollama to produce per-criterion
 * score suggestions with brief justifications.
 *
 * The key improvement over pure code-reading is that actual test-pass counts,
 * stdout/stderr, and compile errors are injected directly into the prompt so
 * the Correctness criterion is grounded in runtime evidence rather than
 * static analysis.
 */

import type { RubricCriterion } from "./rubricService";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Runtime execution evidence collected from SubmissionAttempt + TestCase rows. */
export type ExecutionContext = {
  /** Normalised status: "accepted" | "wrong_answer" | "runtime_error" | "compile_error" | etc. */
  normalizedStatus: string;
  /** Number of public (visible) test cases that passed. */
  publicPassed:     number | null;
  /** Total public test cases. */
  publicTotal:      number | null;
  /** Number of hidden test cases that passed. */
  hiddenPassed:     number | null;
  /** Total hidden test cases. */
  hiddenTotal:      number | null;
  /** True only when every test case (public + hidden) passed. */
  allPassed:        boolean | null;
  /** stdout from the last test run (trimmed to 1 000 chars). */
  stdout:           string | null;
  /** stderr / runtime error message (trimmed to 500 chars). */
  stderr:           string | null;
  /** Compiler error output (trimmed to 500 chars). */
  compileOutput:    string | null;
  /** Execution time in milliseconds. */
  executionTimeMs:  number | null;
  /** Peak memory in kilobytes. */
  memoryKb:         number | null;
  /** Public test cases with expected outputs, for diff context. */
  testCases: Array<{ input: string; expectedOutput: string }>;
};

export type CriterionScore = {
  name:      string;
  maxScore:  number;
  suggested: number;
  comment:   string;
};

export type ScoreSuggestion = {
  breakdown:    CriterionScore[];
  totalScore:   number;
  maxTotal:     number;
  generalNotes: string;
};

export type SuggestionResult =
  | { success: true;  suggestion: ScoreSuggestion; model: string }
  | { success: false; error: string };

// ── Ollama helpers ────────────────────────────────────────────────────────────

function getOllamaGenerateUrl(): string {
  const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  return `${base}/api/generate`;
}

function getModelName(): string {
  return process.env.OLLAMA_MODEL ?? "ai-mentor";
}

// ── Anti-hallucination + proportional enforcement ────────────────────────────
//
// The AI's `comment` field is unverified by default — it can claim the student
// "uses bubble sort" even when the student wrote merge sort. These helpers
// programmatically verify two things after the LLM returns:
//   1. Backticked code citations in the comment actually appear in the
//      student's source (whitespace-tolerant). If they don't, the comment
//      gets flagged so the teacher knows the AI hallucinated.
//   2. The Correctness score is within ±10% of the proportional expectation
//      (k passed / n total × maxScore). Outside that band, we clamp.

function normalizeForCodeMatch(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Extract backticked spans (e.g. `word_count`, `strlen(buf)`) from a comment
 * and check each one appears in the student's source code. Returns the list
 * of unverified citations (empty list means all citations check out).
 *
 * Single-character backticks (e.g. `+`, `n`) and very short non-identifier
 * tokens are ignored — they're too noisy to verify reliably.
 */
function findUnverifiedCitations(comment: string, studentCode: string): string[] {
  const corpus = normalizeForCodeMatch(studentCode);
  const matches = comment.match(/`([^`]+)`/g) ?? [];
  const unverified: string[] = [];
  for (const m of matches) {
    const span = m.replace(/`/g, "").trim();
    // Skip noise: ≤2 chars, or single common-English words
    if (span.length <= 2) continue;
    const normalized = normalizeForCodeMatch(span);
    if (!normalized) continue;
    if (!corpus.includes(normalized)) unverified.push(span);
  }
  return unverified;
}

/**
 * If execution results exist with a clear pass/total count, compute the
 * tolerance band for Correctness. Returns null if we can't determine a band
 * (no execution data, or zero total tests).
 */
function computeCorrectnessBand(
  maxScore: number,
  exec: ExecutionContext | null,
): { lo: number; hi: number; expected: number } | null {
  if (!exec) return null;
  // Compile error → Correctness = 0 (already enforced by the prompt's hard rule,
  // but we belt-and-brace it here).
  if (exec.normalizedStatus === "compile_error") {
    return { lo: 0, hi: 0, expected: 0 };
  }
  const pubP = exec.publicPassed ?? 0;
  const pubT = exec.publicTotal ?? 0;
  const hidP = exec.hiddenPassed ?? 0;
  const hidT = exec.hiddenTotal ?? 0;
  const passed = pubP + hidP;
  const total = pubT + hidT;
  if (total <= 0) return null;
  const ratio = passed / total;
  const expected = ratio * maxScore;
  // ±10% of maxScore around the expected value, clamped to [0, maxScore].
  const tolerance = 0.1 * maxScore;
  const lo = Math.max(0, Math.round(expected - tolerance));
  const hi = Math.min(maxScore, Math.round(expected + tolerance));
  return { lo, hi, expected: Math.round(expected) };
}

/**
 * Check whether a criterion is the Correctness criterion. We look for the
 * word "correct" anywhere in its name (case-insensitive) — matches "Correctness",
 * "Doğruluk" (no — but matches "Correctness" labels), etc. This is a soft
 * heuristic; if your rubric names Correctness something else, the
 * proportional rule won't activate. That's a deliberate trade-off — better
 * to silently skip than mis-clamp a non-correctness criterion.
 */
function isCorrectnessCriterion(name: string): boolean {
  return /correct/i.test(name);
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJson(
  raw: string,
  criteria: RubricCriterion[],
  studentCode: string = "",
  exec: ExecutionContext | null = null,
): ScoreSuggestion | null {
  const stripped = raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();

  const start = stripped.indexOf("{");
  const end   = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    const obj = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;

    const rawBreakdown = Array.isArray(obj.breakdown) ? obj.breakdown : [];
    const breakdown: CriterionScore[] = rawBreakdown
      .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null)
      .map((b, idx) => {
        // Prefer name-based matching so reordered AI output still maps correctly.
        // Fall back to positional index only when the name doesn't match anything.
        const bNameStr = typeof b.name === "string" ? b.name.toLowerCase().trim() : null;
        const byName = bNameStr
          ? criteria.find((c) => c.name.toLowerCase() === bNameStr)
          : undefined;
        const matched  = byName ?? criteria[idx];
        const maxScore = matched?.maxScore ?? 10;
        // Guard non-numeric values so "N/A" or null don't silently become NaN → 0
        const rawScore = typeof b.suggested === "number"
          ? b.suggested
          : typeof b.suggested === "string"
            ? Number.parseFloat(b.suggested)
            : 0;
        let suggested = Math.max(0, Math.min(maxScore, Math.round(Number.isFinite(rawScore) ? rawScore : 0)));
        const name = typeof b.name === "string" ? b.name.trim() : matched?.name ?? `Criterion ${idx + 1}`;
        let comment = typeof b.comment === "string" ? b.comment.trim() : "";

        // ── Proportional correctness enforcement ──
        // For the Correctness criterion (when execution data exists), force
        // the suggested score into the ±10%-of-max band around the actual
        // pass ratio. The AI is asked to do this in the prompt; this clamps
        // any out-of-band scores back into the legitimate range.
        if (isCorrectnessCriterion(name)) {
          const band = computeCorrectnessBand(maxScore, exec);
          if (band !== null) {
            if (suggested < band.lo) {
              comment = `${comment} [auto-adjusted from ${suggested} → ${band.lo}: below proportional floor for ${exec!.publicPassed ?? 0}/${exec!.publicTotal ?? 0} public + ${exec!.hiddenPassed ?? 0}/${exec!.hiddenTotal ?? 0} hidden tests passed]`.trim();
              suggested = band.lo;
            } else if (suggested > band.hi) {
              comment = `${comment} [auto-adjusted from ${suggested} → ${band.hi}: above proportional ceiling for ${exec!.publicPassed ?? 0}/${exec!.publicTotal ?? 0} public + ${exec!.hiddenPassed ?? 0}/${exec!.hiddenTotal ?? 0} hidden tests passed]`.trim();
              suggested = band.hi;
            }
          }
        }

        // ── Anti-hallucination citation check ──
        // Backticked spans in the comment must appear in the student's code.
        // Unverified citations get appended as a teacher-visible warning so
        // the score isn't silently trusting a fabricated claim.
        if (studentCode && comment) {
          const unverified = findUnverifiedCitations(comment, studentCode);
          if (unverified.length > 0) {
            const tag = unverified.map((c) => `\`${c}\``).join(", ");
            comment = `${comment} [⚠ unverified citations: ${tag} — not found in student's code; manual review recommended]`;
          }
        }

        return {
          name,
          maxScore,
          suggested,
          comment,
        };
      });

    if (breakdown.length === 0) return null;

    // Pad any rubric criteria that the AI omitted with a 0-score entry so the
    // grading table is always complete and the teacher notices what's missing.
    for (const criterion of criteria) {
      const alreadyPresent = breakdown.some(
        (b) => b.name.toLowerCase() === criterion.name.toLowerCase(),
      );
      if (!alreadyPresent) {
        breakdown.push({
          name:      criterion.name,
          maxScore:  criterion.maxScore,
          suggested: 0,
          comment:   "Not assessed — criterion was absent from AI response.",
        });
      }
    }

    // ── Cross-criterion bound enforcement (Fix A + A.2 tiered + runtime severity) ──
    // Three structural rules layered together, all applied as a per-criterion
    // CEILING (we take the strictest one that applies). The goal is to prevent
    // the LLM from awarding near-perfect non-Correctness scores when a real
    // bug exists OR when the program crashes.
    //
    //   • Fix A         — Correctness < 50% of max → other criteria ≤ 70% of max.
    //                     "Doesn't really work" — strong clamp.
    //   • Fix A.2 lo    — Correctness 50–65% of max → other criteria ≤ 75% of max.
    //                     "Real bug, most criteria deserve modest credit".
    //   • Fix A.2 hi    — Correctness 65–80% of max → other criteria ≤ 85% of max.
    //                     "Working with a defect" — softest clamp.
    //   • Runtime floor — status === "runtime_error" → Edge Cases AND Memory
    //                     Safety each ≤ 50% of max, regardless of Correctness.
    //                     A crash is by definition an edge-case + memory failure.
    //
    // Correctness ≥ 80% with no runtime error → no cross-criterion constraint.
    const correctnessEntry = breakdown.find((b) => isCorrectnessCriterion(b.name));
    const isRuntimeError = exec?.normalizedStatus === "runtime_error";

    // Helper: identify which criteria the runtime-error floor applies to.
    // Edge Cases, Memory Safety, and Code Quality all get the runtime-error
    // floor: a crashing program has by definition failed edge-case handling,
    // and high "code quality" on code that crashes is not credible either.
    const isRuntimeFloorTarget = (name: string): boolean =>
      /edge|memory|quality/i.test(name);

    if (correctnessEntry && correctnessEntry.maxScore > 0) {
      const correctnessRatio = correctnessEntry.suggested / correctnessEntry.maxScore;
      let crossFraction: number | null = null;
      let crossTierLabel = "";
      if (correctnessRatio < 0.5) {
        crossFraction = 0.7;
        crossTierLabel = "< 50% of max forces other criteria ≤ 70%";
      } else if (correctnessRatio < 0.65) {
        crossFraction = 0.75;
        crossTierLabel = "in 50–65% band forces other criteria ≤ 75%";
      } else if (correctnessRatio < 0.8) {
        crossFraction = 0.85;
        crossTierLabel = "in 65–80% band forces other criteria ≤ 85%";
      }
      const correctnessPctStr = `${Math.round(correctnessRatio * 100)}%`;

      for (const entry of breakdown) {
        if (entry === correctnessEntry) continue;
        if (entry.maxScore <= 0) continue;

        // Collect all applicable ceilings; take the strictest (smallest).
        const ceilings: Array<{ value: number; reason: string }> = [];

        if (crossFraction !== null) {
          ceilings.push({
            value: Math.floor(crossFraction * entry.maxScore),
            reason: `cross-criterion bound — Correctness ${correctnessEntry.suggested}/${correctnessEntry.maxScore} (${correctnessPctStr}) ${crossTierLabel} of their maxScore`,
          });
        }

        if (isRuntimeError && isRuntimeFloorTarget(entry.name)) {
          ceilings.push({
            value: Math.floor(0.5 * entry.maxScore),
            reason: `runtime-error severity rule — program crashed, ${entry.name} forced ≤ 50% of maxScore`,
          });
        }

        if (ceilings.length === 0) continue;
        const strictest = ceilings.reduce((a, b) => (a.value <= b.value ? a : b));
        if (entry.suggested > strictest.value) {
          const original = entry.suggested;
          entry.suggested = strictest.value;
          entry.comment = `${entry.comment} [auto-adjusted from ${original} → ${strictest.value}: ${strictest.reason}]`.trim();
        }
      }
    } else if (isRuntimeError) {
      // No Correctness criterion identified, but runtime-error floor still
      // applies to Edge Cases / Memory Safety on its own.
      for (const entry of breakdown) {
        if (entry.maxScore <= 0) continue;
        if (!isRuntimeFloorTarget(entry.name)) continue;
        const ceiling = Math.floor(0.5 * entry.maxScore);
        if (entry.suggested > ceiling) {
          const original = entry.suggested;
          entry.suggested = ceiling;
          entry.comment = `${entry.comment} [auto-adjusted from ${original} → ${ceiling}: runtime-error severity rule — program crashed, ${entry.name} forced ≤ 50% of maxScore]`.trim();
        }
      }
    }

    const totalScore   = breakdown.reduce((s, c) => s + c.suggested, 0);
    const maxTotal     = breakdown.reduce((s, c) => s + c.maxScore, 0);
    const generalNotes = typeof obj.generalNotes === "string" ? obj.generalNotes.trim() : "";

    return { breakdown, totalScore, maxTotal, generalNotes };
  } catch {
    return null;
  }
}

// ── Execution summary block ───────────────────────────────────────────────────

function buildExecutionBlock(exec: ExecutionContext): string {
  const lines: string[] = [];

  // ── Overall result ──
  lines.push(`Overall result : ${exec.normalizedStatus.toUpperCase()}`);

  // ── Test counts ──
  if (exec.publicTotal !== null) {
    const pub = `${exec.publicPassed ?? 0}/${exec.publicTotal} public tests passed`;
    const hid = exec.hiddenTotal !== null
      ? `, ${exec.hiddenPassed ?? 0}/${exec.hiddenTotal} hidden tests passed`
      : "";
    lines.push(`Test results   : ${pub}${hid}`);
  }

  if (exec.allPassed === true) {
    lines.push("All test cases : PASSED [OK]");
  } else if (exec.allPassed === false) {
    lines.push("All test cases : FAILED [FAIL]");
  }

  // ── Compile error ──
  if (exec.compileOutput) {
    lines.push(`\nCompiler output:\n${exec.compileOutput.slice(0, 500)}`);
  }

  // ── Runtime stderr ──
  if (exec.stderr && !exec.compileOutput) {
    lines.push(`\nRuntime error / stderr:\n${exec.stderr.slice(0, 500)}`);
  }

  // ── stdout sample ──
  if (exec.stdout) {
    lines.push(`\nProgram stdout (last run, first 1000 chars):\n${exec.stdout.slice(0, 1_000)}`);
  }

  // ── Performance ──
  if (exec.executionTimeMs !== null) {
    lines.push(`\nExecution time : ${exec.executionTimeMs.toFixed(1)} ms`);
  }
  if (exec.memoryKb !== null) {
    lines.push(`Memory used    : ${exec.memoryKb} KB`);
  }

  // ── Public test cases ──
  if (exec.testCases.length > 0) {
    lines.push("\nPublic test cases (input → expected output):");
    exec.testCases.slice(0, 6).forEach((tc, i) => {
      lines.push(`  [${i + 1}] Input: ${tc.input.trim()} | Expected: ${tc.expectedOutput.trim()}`);
    });
  }

  return lines.join("\n");
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildSuggestionPrompt(
  problemTitle:       string,
  problemDescription: string,
  language:           string,
  studentCode:        string,
  criteria:           RubricCriterion[],
  referenceSolution:  string | null,
  exec:               ExecutionContext | null,
): string {
  const criteriaJson = JSON.stringify(
    criteria.map((c) => ({
      name:         c.name,
      maxScore:     c.maxScore,
      scoringGuide: c.scoringGuide || c.description,
    })),
    null,
    2,
  );

  const executionSection = exec
    ? `\nEXECUTION RESULTS (from automated test runner — treat these as facts)\n${"=".repeat(68)}\n${buildExecutionBlock(exec)}\n`
    : "\n(No execution results available — assess correctness from code review only.)\n";

  return `You are an expert programming instructor grading a student's code submission.
You MUST respond in English only.

PROBLEM
=======
Title: ${problemTitle}
Language: ${language}
Description:
${problemDescription}
${referenceSolution ? `\nReference Solution (for grading context — DO NOT reveal to student):\n${referenceSolution}` : ""}
${executionSection}
STUDENT CODE
============
\`\`\`${language}
${studentCode}
\`\`\`

GRADING RUBRIC
==============
${criteriaJson}

INSTRUCTIONS
============
Score the student's code on EACH rubric criterion. Be an honest, rigorous grader — not a generous one.

CALIBRATION — what scores mean:
- 90-100% of maxScore : Excellent. Nearly identical to the reference solution. Very rare.
- 70-89%              : Good. Minor issues only — small inefficiency, one edge case missed.
- 50-69%              : Adequate. Core logic works but has clear weaknesses.
- 30-49%              : Poor. Significant problems — wrong output on several tests, bad structure.
- 10-29%              : Very poor. Mostly wrong, major logic errors, barely compiles.
- 0-9%                : Nothing of value. Compile error, empty, or completely off-topic.

CRITICAL RULES — you MUST follow these:
- Execution results are ground truth. If tests FAILED, Correctness CANNOT be above 60% of its maxScore.
- PROPORTIONAL CORRECTNESS RULE: If k of n tests passed and the result is not a compile error, the Correctness score MUST be within ±10% of (k / n) × maxScore. Example: 7 of 10 public tests passed and Correctness maxScore is 40 → suggested Correctness must be between 25 and 31 (≈ 28 ± 10%). If hidden tests are also reported, count both: use (publicPassed + hiddenPassed) / (publicTotal + hiddenTotal).
- CROSS-CRITERION BOUND RULE: If Correctness lands below 50% of its maxScore, NO OTHER criterion (Code Quality, Edge Cases, Algorithm, Memory Safety, Code Style, Case Handling, or any other) may exceed 70% of its maxScore. A program that doesn't actually work cannot be 'high quality' regardless of style. The bug IS itself a quality problem; it constrains credit across the rubric. Example: if Correctness = 8/40 (20% of max), Code Quality's maxScore is 20 → Code Quality must be ≤ 14, and Edge Cases (max 20) must be ≤ 14, etc. This rule does NOT apply when Correctness ≥ 50% of max.
- MID-BAND CROSS-CRITERION RULE (two-tier): If Correctness lands between 50% and 80% of its maxScore (i.e. a real bug exists but most tests still pass), other criteria are bounded as follows:
  • Correctness 50–65% of max → NO OTHER criterion may exceed 75% of its maxScore (real bug, most non-correctness criteria deserve only modest credit). Example: Correctness = 30/50 (60%) and Code Style max = 30 → Code Style ≤ 22.
  • Correctness 65–80% of max → NO OTHER criterion may exceed 85% of its maxScore (working with a defect). Example: Correctness = 32/50 (64%) … wait, 64% is the lower tier; at 35/50 (70%) Code Style max = 30 → Code Style ≤ 25.
  A program with a known defect cannot be 'nearly perfect' on quality, edge cases, or style — the defect is itself evidence of incomplete reasoning. Stricter caps in the lower tier reflect that fewer passing tests = more uncertainty about overall quality. This rule does NOT apply when Correctness ≥ 80% of max OR when Correctness < 50% of max (in which case the stricter 70% rule above applies instead).
- RUNTIME-ERROR SEVERITY RULE: If the execution status is "runtime_error" (program crashes / segfaults / throws unhandled exceptions), Edge Cases AND Memory Safety MUST each be ≤ 50% of their maxScore regardless of how many tests happen to pass before the crash. A program that crashes on any input has demonstrably failed edge-case handling and memory safety. This rule applies in addition to (not instead of) the cross-criterion bound rules above — take the stricter of the two ceilings.
- If ALL tests passed (allPassed = true), Correctness may be high, AND other criteria are unconstrained by the cross-criterion rule — but they must still be graded critically on their own merits.
- If there is a compile error, Correctness = 0. Code Quality must also be very low (≤ 20% of its maxScore). The cross-criterion rule reinforces this — every non-Correctness criterion must be ≤ 70% of max.
- If the code has no comments, hardcoded values, poor variable names, or is a single unstructured block, Code Quality must reflect that.
- If the solution uses an inefficient algorithm when the reference uses a clearly better one, Algorithm score must be reduced.
- Do NOT give full marks unless the student's solution is genuinely excellent for that criterion.
- Do NOT be influenced by the student submitting — the score must reflect actual quality, not effort.

ANTI-HALLUCINATION RULES — your "comment" field will be programmatically verified:
- Every code pattern or identifier you cite in a comment MUST appear verbatim in the student's actual code shown above. Wrap exact citations in backticks (e.g. \`word_count\`, \`strlen(buf)\`).
- Do NOT claim the student "uses bubble sort" / "uses recursion" / "ignores edge case X" unless you can quote a backticked code fragment from their code that proves it.
- Do NOT invent variable names, function calls, library imports, or algorithms that are not in the student's code.
- Do NOT cite specific failing test inputs/outputs unless they appear in the execution results above.
- Vague comments like "good code", "well structured", "could be improved" are FORBIDDEN. Be specific or omit the comment.

For each criterion:
- Assign "suggested" as an integer between 0 and maxScore (inclusive).
- Award partial credit proportionally: passing k out of n tests → approximately k/n × maxScore for Correctness.
- Write a concise 1-2 sentence "comment" citing specific evidence (test counts, actual errors, specific code patterns).
- Do NOT reveal the reference solution.

RESPONSE FORMAT
===============
Respond with ONLY a valid JSON object — no markdown, no explanation, no code fences.
{
  "breakdown": [
    {
      "name": "<criterion name — must match rubric exactly>",
      "suggested": <integer points>,
      "comment": "<evidence-based justification>"
    }
  ],
  "generalNotes": "<optional 1-2 sentence overall comment>"
}`.trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function suggestScore(
  problemTitle:       string,
  problemDescription: string,
  language:           string,
  studentCode:        string,
  criteria:           RubricCriterion[],
  referenceSolution:  string | null,
  exec:               ExecutionContext | null = null,
): Promise<SuggestionResult> {
  if (criteria.length === 0) {
    return { success: false, error: "No rubric criteria provided" };
  }

  const url    = getOllamaGenerateUrl();
  const model  = getModelName();
  const prompt = buildSuggestionPrompt(
    problemTitle,
    problemDescription,
    language,
    studentCode,
    criteria,
    referenceSolution,
    exec,
  );

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 240_000);

  try {
    const passRate = exec?.publicTotal
      ? `${exec.publicPassed ?? 0}/${exec.publicTotal}`
      : "n/a";
    console.log(
      `[score-suggest] model=${model} problem="${problemTitle}" tests=${passRate} status=${exec?.normalizedStatus ?? "unknown"}`,
    );

    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream:  false,
        keep_alive: -1,
        // temperature: 0.0 → fully deterministic grading. Trades a small
        // amount of comment-phrasing variety for run-to-run stability, which
        // matters more in a grading context than in a chat one (teachers and
        // students should not see the same submission scored 7/40 one day and
        // 8/40 the next based purely on sampling noise).
        options: { temperature: 0.0, top_p: 0.85, num_ctx: 8192 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as { response?: string };
    const raw  = (data.response ?? "").trim();
    if (!raw) throw new Error("Ollama returned an empty response");

    const suggestion = extractJson(raw, criteria, studentCode, exec);
    if (!suggestion) {
      throw new Error(`Could not parse score JSON from model output: ${raw.slice(0, 300)}`);
    }

    return { success: true, suggestion, model };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const message = raw.toLowerCase().includes("abort")
      ? "aborted: model took too long to respond (>240s)"
      : raw;
    console.error("[score-suggest] error:", message);
    return { success: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
