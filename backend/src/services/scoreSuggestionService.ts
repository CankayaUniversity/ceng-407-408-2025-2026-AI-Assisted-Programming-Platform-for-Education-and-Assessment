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

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJson(raw: string, criteria: RubricCriterion[]): ScoreSuggestion | null {
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
        const matched  = criteria[idx] ?? criteria.find((c) => c.name === b.name);
        const maxScore = matched?.maxScore ?? 10;
        const suggested = Math.max(0, Math.min(maxScore, Math.round(Number(b.suggested) || 0)));
        return {
          name:      typeof b.name    === "string" ? b.name.trim() : matched?.name ?? `Criterion ${idx + 1}`,
          maxScore,
          suggested,
          comment:   typeof b.comment === "string" ? b.comment.trim() : "",
        };
      });

    if (breakdown.length === 0) return null;

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
    lines.push("All test cases : PASSED ✓");
  } else if (exec.allPassed === false) {
    lines.push("All test cases : FAILED ✗");
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
Score the student's code on EACH rubric criterion.

IMPORTANT — use the execution results as primary evidence:
- If test results show "FAILED" or wrong output, the Correctness score must reflect that — do NOT award full marks based on code appearance alone.
- If the code compiled successfully but produced wrong answers, award partial correctness credit based on how many tests passed.
- If there is a compile error, correctness and code-quality scores should be low.
- Performance/efficiency scores should reference actual execution time and memory where available.

For each criterion:
- Assign "suggested" as an integer between 0 and maxScore (inclusive).
- Award partial credit fairly — a student who passes 3/5 tests should not get 0 for Correctness.
- Write a concise 1-2 sentence "comment" that cites specific evidence (test counts, errors, code structure).
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
        options: { temperature: 0.2, top_p: 0.9, num_ctx: 8192 },
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

    const suggestion = extractJson(raw, criteria);
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
