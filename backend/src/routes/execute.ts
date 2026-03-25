import { Router } from "express";
import { prisma } from "../lib/prisma";
import { resolveLanguageId } from "../lib/judge0Languages";
import { requireAuth } from "../middleware/requireAuth";
import { runInJudge0, type Judge0RunResult } from "../services/judge0";

const router = Router();

router.use(requireAuth);

const ACCEPTED_STATUS_ID = 3;
const SUBMISSION_STDOUT_MAX = 50_000;

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
  const n = Number.parseFloat(time);
  return Number.isFinite(n) ? n : undefined;
}

function buildSubmissionPayload(params: {
  results: Array<{
    index: number;
    passed: boolean;
    jr: Judge0RunResult;
  }>;
}): { stdout: string | null; stderr: string | null; executionTime?: number; memory?: number } {
  const chunks: string[] = [];
  let lastStderr = "";
  let lastTime: number | undefined;
  let lastMem: number | undefined;

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
    }
    const t = parseExecutionTimeMs(r.jr.time);
    if (t !== undefined) {
      lastTime = t;
    }
    if (r.jr.memory != null) {
      lastMem = r.jr.memory;
    }
  }

  let stdout = chunks.join("\n---\n");
  if (stdout.length > SUBMISSION_STDOUT_MAX) {
    stdout = `${stdout.slice(0, SUBMISSION_STDOUT_MAX)}\n…(truncated)`;
  }

  return {
    stdout: stdout || null,
    stderr: lastStderr || null,
    executionTime: lastTime,
    memory: lastMem,
  };
}

/** Run all test cases for a problem, or a single raw run (playground / terminal). */
router.post("/", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const sourceCode = typeof body.sourceCode === "string" ? body.sourceCode : "";
  if (!sourceCode.trim()) {
    res.status(400).json({ error: "sourceCode is required" });
    return;
  }

  const problemId = parseOptionalInt(body.problemId);
  const languageIdBody = parseOptionalInt(body.languageId);
  const stdinRaw = typeof body.stdin === "string" ? body.stdin : "";

  const role = req.auth!.role;

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

      let langId: number;
      try {
        langId = resolveLanguageId(problem.language, languageIdBody);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(400).json({ error: msg });
        return;
      }

      const internalRuns: Array<{
        index: number;
        jr: Judge0RunResult;
        passed: boolean;
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

      for (let i = 0; i < problem.testCases.length; i++) {
        const tc = problem.testCases[i];
        const jr = await runInJudge0({
          sourceCode,
          languageId: langId,
          stdin: tc.input,
          expectedOutput: tc.expectedOutput,
        });
        const passed = jr.statusId === ACCEPTED_STATUS_ID;
        if (!passed) {
          allPassed = false;
        }
        internalRuns.push({ index: i + 1, jr, passed });
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
        results: internalRuns.map((r) => ({ index: r.index, passed: r.passed, jr: r.jr })),
      });

      const submission = await prisma.submission.create({
        data: {
          userId: req.auth!.userId,
          problemId,
          code: sourceCode,
          language: problem.language,
          status: allPassed ? "accepted" : "failed",
          stdout: submissionPayload.stdout,
          stderr: submissionPayload.stderr,
          executionTime: submissionPayload.executionTime,
          memory: submissionPayload.memory,
        },
      });

      res.json({
        mode: "tests",
        problemId,
        languageId: langId,
        allPassed,
        results,
        submissionId: submission.id,
      });
      return;
    }

    if (languageIdBody === undefined) {
      res.status(400).json({
        error: "Provide problemId to run tests, or languageId with no problemId for a raw run",
      });
      return;
    }

    const jr = await runInJudge0({
      sourceCode,
      languageId: languageIdBody,
      stdin: stdinRaw,
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
      languageId: languageIdBody,
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
