import { Router } from "express";
import { prisma } from "../lib/prisma";
import { resolveLanguageId } from "../lib/judge0Languages";
import { requireAuth } from "../middleware/requireAuth";
import { AttemptMode } from "@prisma/client";
import { runInJudge0, type Judge0RunResult } from "../services/judge0";
import { executeSchema } from "../lib/schemas";

const router = Router();

router.use(requireAuth);

const ACCEPTED_STATUS_ID = 3;

/** Normalise output for comparison: unify line-endings, strip surrounding whitespace. */
function normalizeOutput(s: string): string {
  return (s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/**
 * Smart output matching — accepts student output even when it contains extra
 * prompt text (e.g. "Enter n: ", "The answer is: ").
 *
 * Strategy:
 *   1. Exact match (after normalisation) — fastest path.
 *   2. Loose match: every line of the expected output must appear as a
 *      suffix of at least one line in the actual output, in order.
 *      e.g. expected="5", actual="The maximum number is: 5"  → passes
 *           expected="5\n3", actual=["Result: 5", "Min: 3"]  → passes
 */
function outputMatches(actual: string, expected: string): boolean {
  const normActual   = normalizeOutput(actual);
  const normExpected = normalizeOutput(expected);

  // 1. Exact match
  if (normActual === normExpected) return true;

  // 2. Loose match — each expected line must appear as a suffix of an actual line
  const expectedLines = normExpected.split("\n").filter(l => l.trim() !== "");
  const actualLines   = normActual.split("\n").map(l => l.trim());

  let ei = 0;
  for (const aLine of actualLines) {
    if (ei >= expectedLines.length) break;
    const eLine = expectedLines[ei].trim();
    if (aLine === eLine || aLine.endsWith(eLine) || aLine.endsWith(`: ${eLine}`)) {
      ei++;
    }
  }
  return ei === expectedLines.length;
}

/**
 * Normalise stdin before feeding to Judge0 / child process.
 * Only fixes CRLF → LF; does NOT trim surrounding whitespace because
 * a test-case input could intentionally start/end with blank lines.
 */
function normalizeStdin(s: string): string {
  return (s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
const SUBMISSION_STDOUT_MAX = 50_000;
const SUPPORTED_LANGUAGES = new Set(["c", "python", "javascript", "js", "java", "cpp", "c++", "csharp", "c#"]);

function normalizeLanguage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase();
  if (!key) return undefined;

  const aliases: Record<string, string> = {
    py: "python", python3: "python", python: "python",
    c: "c",
    "c++": "cpp", cpp: "cpp",
    js: "javascript", node: "javascript", javascript: "javascript",
    java: "java",
    cs: "csharp", "c#": "csharp", csharp: "csharp",
  };
  return aliases[key];
}

function parseOptionalInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value, 10);
    if (!Number.isNaN(n)) {
      return n;
    }
  }
  return undefined;
}

function redactIfHidden(
  role: string,
  isHidden: boolean,
  fields: { stdout: string; stderr: string; compileOutput: string },
): { stdout: string | null; stderr: string | null; compileOutput: string | null } {
  if (role === "student" && isHidden) {
    return { stdout: null, stderr: null, compileOutput: null };
  }
  return {
    stdout: fields.stdout,
    stderr: fields.stderr,
    compileOutput: fields.compileOutput,
  };
}

function parseExecutionTimeMs(time: string | null): number | undefined {
  if (time == null || time === "") {
    return undefined;
  }
  const seconds = Number.parseFloat(time);
  if (!Number.isFinite(seconds)) {
    return undefined;
  }
  return seconds * 1000;
}

function buildSubmissionPayload(params: {
  results: Array<{
    index: number;
    passed: boolean;
    jr: Judge0RunResult;
  }>;
}): {
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  executionTimeMs?: number;
  memoryKb?: number;
} {
  const chunks: string[] = [];
  let lastStderr = "";
  let lastCompileOutput = "";
  let lastTimeMs: number | undefined;
  let lastMemKb: number | undefined;

  for (const r of params.results) {
    chunks.push(
      `Test ${r.index}: ${r.passed ? "PASS" : "FAIL"} (${r.jr.statusDescription ?? "unknown"})`,
    );
    chunks.push(`stdout:\n${r.jr.stdout}`);
    if (r.jr.stderr) {
      chunks.push(`stderr:\n${r.jr.stderr}`);
      lastStderr = r.jr.stderr;
    }
    if (r.jr.compileOutput) {
      chunks.push(`compile_output:\n${r.jr.compileOutput}`);
      lastCompileOutput = r.jr.compileOutput;
    }
    const t = parseExecutionTimeMs(r.jr.time);
    if (t !== undefined) {
      lastTimeMs = t;
    }
    if (r.jr.memory != null) {
      lastMemKb = r.jr.memory;
    }
  }

  let stdout = chunks.join("\n---\n");
  if (stdout.length > SUBMISSION_STDOUT_MAX) {
    stdout = `${stdout.slice(0, SUBMISSION_STDOUT_MAX)}\n...(truncated)`;
  }

  return {
    stdout: stdout || null,
    stderr: lastStderr || null,
    compileOutput: lastCompileOutput || null,
    executionTimeMs: lastTimeMs,
    memoryKb: lastMemKb,
  };
}

function normalizeJudge0Status(
  jr: Judge0RunResult,
):
  | "accepted"
  | "wrong_answer"
  | "syntax_error"
  | "runtime_error"
  | "time_limit_exceeded"
  | "memory_limit_exceeded"
  | "compile_error"
  | "internal_error" {
  const statusId = jr.statusId ?? -1;
  const statusText = (jr.statusDescription ?? "").toLowerCase();

  if (statusId === 3) return "accepted";
  if (statusId === 4) return "wrong_answer";
  if (statusId === 5) return "time_limit_exceeded";
  if (statusId === 6) return "compile_error";
  if (statusId === 7) return "runtime_error";
  if (statusId === 8) return "runtime_error";
  if (statusId === 9) return "runtime_error";
  if (statusId === 10) return "runtime_error";
  if (statusId === 11) return "runtime_error";
  if (statusId === 12) return "runtime_error";
  if (statusId === 13) return "internal_error";
  if (statusId === 14) return "internal_error";

  if (statusText.includes("syntax")) return "syntax_error";
  if (statusText.includes("compile")) return "compile_error";
  if (statusText.includes("time")) return "time_limit_exceeded";
  if (statusText.includes("memory")) return "memory_limit_exceeded";
  if (statusText.includes("runtime")) return "runtime_error";
  if (statusText.includes("wrong answer")) return "wrong_answer";

  return "internal_error";
}

function aggregateNormalizedStatus(
  runs: Judge0RunResult[],
):
  | "accepted"
  | "wrong_answer"
  | "syntax_error"
  | "runtime_error"
  | "time_limit_exceeded"
  | "memory_limit_exceeded"
  | "compile_error"
  | "internal_error" {
  const normalized = runs.map(normalizeJudge0Status);

  if (normalized.every((s) => s === "accepted")) {
    return "accepted";
  }
  if (normalized.includes("compile_error")) {
    return "compile_error";
  }
  if (normalized.includes("syntax_error")) {
    return "syntax_error";
  }
  if (normalized.includes("runtime_error")) {
    return "runtime_error";
  }
  if (normalized.includes("time_limit_exceeded")) {
    return "time_limit_exceeded";
  }
  if (normalized.includes("memory_limit_exceeded")) {
    return "memory_limit_exceeded";
  }
  if (normalized.includes("wrong_answer")) {
    return "wrong_answer";
  }
  return "internal_error";
}

/**
 * Raw-run stdin from the browser often has no trailing `\n`.
 * Some runtimes block in `input()` until a newline/EOF; Judge0 then feels stuck on "Running".
 */
function normalizeInteractiveStdin(s: string): string {
  if (s.length === 0) return "";
  return s.endsWith("\n") ? s : `${s}\n`;
}

/** Run all test cases for a problem, or a single raw run (playground / terminal). */
router.post("/", async (req, res) => {
  const schemaResult = executeSchema.safeParse(req.body);
  if (!schemaResult.success) {
    res.status(400).json({ error: "Validation failed", details: schemaResult.error.flatten() });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const sourceCode = typeof body.sourceCode === "string" ? body.sourceCode : "";
  if (!sourceCode.trim()) {
    res.status(400).json({ error: "sourceCode is required" });
    return;
  }

  const problemId = parseOptionalInt(body.problemId);
  const languageIdBody = parseOptionalInt(body.languageId);
  const languageBodyRaw = typeof body.language === "string" ? body.language : undefined;
  const languageBody = normalizeLanguage(languageBodyRaw);
  if (languageBodyRaw && !languageBody) {
    res.status(400).json({
      error: `Unsupported language "${languageBodyRaw}". Supported: python, c, cpp, javascript, java, csharp.`,
    });
    return;
  }
  const stdinRaw = typeof body.stdin === "string" ? body.stdin : "";

  const role = req.auth!.role;
  const userId = req.auth!.userId;

  console.log(
    `[execute] user=${userId} role=${role} mode=${problemId !== undefined ? "tests" : "raw"} problemId=${problemId ?? "-"} languageId=${languageIdBody ?? "-"} stdinChars=${stdinRaw.length} codeChars=${sourceCode.length}`,
  );

  try {
    if (problemId !== undefined) {
      const problem = await prisma.problem.findUnique({
        where: { id: problemId },
        include: { testCases: { orderBy: { id: "asc" } } },
      });

      if (!problem) {
        res.status(404).json({ error: "Problem not found" });
        return;
      }

      if (problem.testCases.length === 0) {
        res.status(400).json({ error: "No test cases configured for this problem" });
        return;
      }

      const problemLanguage = normalizeLanguage(problem.language);
      const effectiveLanguage = languageBody ?? problemLanguage;
      if (!effectiveLanguage || !SUPPORTED_LANGUAGES.has(effectiveLanguage)) {
        res.status(400).json({
          error: `Problem language "${problem.language}" is not supported. Supported: python, c, cpp, javascript, java, csharp.`,
        });
        return;
      }

      let langId: number;
      try {
        langId = resolveLanguageId(effectiveLanguage);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(400).json({ error: msg });
        return;
      }

      const internalRuns: Array<{
        index: number;
        jr: Judge0RunResult;
        passed: boolean;
        hidden: boolean;
      }> = [];

      const results: Array<{
        index: number;
        testCaseId: number;
        hidden: boolean;
        passed: boolean;
        status: string | null;
        stdout: string | null;
        stderr: string | null;
        compileOutput: string | null;
        time: string | null;
        memory: number | null;
      }> = [];

      let allPassed = true;
      let publicPassed = 0;
      let publicTotal = 0;
      let hiddenPassed = 0;
      let hiddenTotal = 0;

      for (let i = 0; i < problem.testCases.length; i++) {
        const tc = problem.testCases[i];
        const jr = await runInJudge0({
          sourceCode,
          languageId: langId,
          // Normalize CRLF in test-case input (browser textareas on Windows store \r\n).
          // Without this, input() in Python receives "Alice\r" instead of "Alice".
          // int() silently strips \r, but string comparisons and strip() calls would fail.
          stdin: normalizeStdin(tc.input),
          // Don't pass expectedOutput to Judge0 — it does exact byte comparison which fails
          // on trailing-newline mismatches. We compare manually after trimming both sides.
        });

        // Accept if the program ran cleanly AND output matches.
        // outputMatches first tries exact comparison, then loose matching so that
        // student programs with extra prompt text (e.g. "The answer is: 5") still
        // pass when the expected output is just the value (e.g. "5").
        const passed =
          jr.statusId === ACCEPTED_STATUS_ID &&
          outputMatches(jr.stdout, tc.expectedOutput);
        if (!passed) {
          allPassed = false;
        }

        if (tc.isHidden) {
          hiddenTotal += 1;
          if (passed) hiddenPassed += 1;
        } else {
          publicTotal += 1;
          if (passed) publicPassed += 1;
        }

        internalRuns.push({ index: i + 1, jr, passed, hidden: tc.isHidden });

        const redacted = redactIfHidden(role, tc.isHidden, {
          stdout: jr.stdout,
          stderr: jr.stderr,
          compileOutput: jr.compileOutput,
        });

        results.push({
          index: i + 1,
          testCaseId: tc.id,
          hidden: tc.isHidden,
          passed,
          status: jr.statusDescription,
          ...redacted,
          time: jr.time,
          memory: jr.memory,
        });
      }

      const submissionPayload = buildSubmissionPayload({
        results: internalRuns.map((r) => ({
          index: r.index,
          passed: r.passed,
          jr: r.jr,
        })),
      });
      const aggregateStatus = aggregateNormalizedStatus(
        internalRuns.map((r) => r.jr),
      );

      const submission = await prisma.submission.create({
        data: {
          userId,
          problemId,
          code: sourceCode,
          language: effectiveLanguage,
          status: allPassed ? "accepted" : "failed",
          stdout: submissionPayload.stdout,
          stderr: submissionPayload.stderr,
          executionTime: submissionPayload.executionTimeMs,
          memory: submissionPayload.memoryKb,
        },
      });

      await prisma.submissionAttempt.create({
        data: {
          userId,
          problemId,
          submissionId: submission.id,
          mode: AttemptMode.tests,
          language: effectiveLanguage,
          sourceCode,
          judge0Status: allPassed ? "Accepted" : "Failed",
          normalizedStatus: aggregateStatus,
          publicPassed,
          publicTotal,
          hiddenPassed,
          hiddenTotal,
          allPassed,
          stdout: submissionPayload.stdout,
          stderr: submissionPayload.stderr,
          compileOutput: submissionPayload.compileOutput,
          executionTimeMs: submissionPayload.executionTimeMs,
          memoryKb: submissionPayload.memoryKb,
        },
      });

      res.json({
        mode: "tests",
        problemId,
        languageId: langId,
        allPassed,
        publicPassed,
        publicTotal,
        hiddenPassed,
        hiddenTotal,
        results,
        submissionId: submission.id,
      });
      return;
    }

    if (languageIdBody === undefined && !languageBody) {
      res.status(400).json({
        error: "Provide problemId to run tests, or language/languageId for a raw run",
      });
      return;
    }

    let rawLanguageId: number;
    try {
      if (languageIdBody !== undefined) {
        rawLanguageId = languageIdBody;
      } else {
        rawLanguageId = resolveLanguageId(languageBody!);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(400).json({ error: msg });
      return;
    }

    const jr = await runInJudge0({
      sourceCode,
      languageId: rawLanguageId,
      stdin: normalizeInteractiveStdin(stdinRaw),
    });

    const normalizedStatus = normalizeJudge0Status(jr);
    const executionTimeMs = parseExecutionTimeMs(jr.time);
    const langLabel = languageBody ?? String(rawLanguageId);

    await prisma.submissionAttempt.create({
      data: {
        userId,
        problemId: null,
        submissionId: null,
        mode: AttemptMode.raw,
        language: langLabel,
        sourceCode,
        judge0Status: jr.statusDescription,
        normalizedStatus,
        publicPassed: null,
        publicTotal: null,
        hiddenPassed: null,
        hiddenTotal: null,
        allPassed: jr.statusId === ACCEPTED_STATUS_ID,
        stdout: jr.stdout || null,
        stderr: jr.stderr || null,
        compileOutput: jr.compileOutput || null,
        executionTimeMs,
        memoryKb: jr.memory ?? null,
      },
    });

    res.json({
      mode: "raw",
      passed: jr.statusId === ACCEPTED_STATUS_ID,
      status: jr.statusDescription,
      stdout: jr.stdout,
      stderr: jr.stderr,
      compileOutput: jr.compileOutput,
      time: jr.time,
      memory: jr.memory,
      languageId: rawLanguageId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(503).json({
      error: "Code execution service unavailable",
      detail: msg,
    });
  }
});

export { router as executeRouter };