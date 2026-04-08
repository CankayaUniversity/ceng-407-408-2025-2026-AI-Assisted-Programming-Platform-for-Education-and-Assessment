export type AttemptStatusCategory =
  | "accepted"
  | "wrong_answer"
  | "runtime_error"
  | "compilation_error"
  | "time_limit"
  | "memory_limit"
  | "system_error"
  | "unknown";

export type AttemptResultInput = {
  hidden: boolean;
  passed: boolean;
  status: string | null;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  time: string | null;
  memory: number | null;
};

export function normalizeJudgeStatus(params: {
  statusId?: number | null;
  statusDescription?: string | null;
  allPassed?: boolean;
}): AttemptStatusCategory {
  if (params.allPassed || params.statusId === 3) {
    return "accepted";
  }

  const description = (params.statusDescription ?? "").trim().toLowerCase();
  if (!description) {
    return "unknown";
  }
  if (description.includes("wrong answer") || description.includes("failed")) {
    return "wrong_answer";
  }
  if (
    description.includes("runtime") ||
    description.includes("exception") ||
    description.includes("sig")
  ) {
    return "runtime_error";
  }
  if (
    description.includes("compile") ||
    description.includes("compilation") ||
    description.includes("syntax")
  ) {
    return "compilation_error";
  }
  if (description.includes("time limit")) {
    return "time_limit";
  }
  if (description.includes("memory limit")) {
    return "memory_limit";
  }
  if (
    description.includes("internal error") ||
    description.includes("system") ||
    description.includes("service unavailable")
  ) {
    return "system_error";
  }
  return "unknown";
}

function parseExecutionTimeMs(time: string | null): number | undefined {
  if (time == null || time === "") {
    return undefined;
  }
  const n = Number.parseFloat(time);
  return Number.isFinite(n) ? n : undefined;
}

function clipText(value: string, maxLength = 50_000): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n...(truncated)`;
}

export function summarizeAttemptResults(results: AttemptResultInput[]) {
  let passedPublicCount = 0;
  let totalPublicCount = 0;
  let passedHiddenCount = 0;
  let totalHiddenCount = 0;
  let executionTime: number | undefined;
  let memory: number | undefined;
  let finalStatus: string | null = null;
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  const compileParts: string[] = [];

  for (const result of results) {
    if (result.hidden) {
      totalHiddenCount += 1;
      if (result.passed) {
        passedHiddenCount += 1;
      }
    } else {
      totalPublicCount += 1;
      if (result.passed) {
        passedPublicCount += 1;
      }
    }

    if (result.status) {
      finalStatus = result.status;
    }
    if (result.stdout) {
      stdoutParts.push(result.stdout);
    }
    if (result.stderr) {
      stderrParts.push(result.stderr);
    }
    if (result.compileOutput) {
      compileParts.push(result.compileOutput);
    }

    const t = parseExecutionTimeMs(result.time);
    if (t !== undefined) {
      executionTime = executionTime === undefined ? t : Math.max(executionTime, t);
    }
    if (result.memory != null) {
      memory = memory === undefined ? result.memory : Math.max(memory, result.memory);
    }
  }

  const allPassed =
    totalPublicCount + totalHiddenCount > 0 &&
    passedPublicCount === totalPublicCount &&
    passedHiddenCount === totalHiddenCount;

  return {
    passedPublicCount,
    totalPublicCount,
    passedHiddenCount,
    totalHiddenCount,
    stdout: stdoutParts.length > 0 ? clipText(stdoutParts.join("\n---\n")) : null,
    stderr: stderrParts.length > 0 ? clipText(stderrParts.join("\n---\n")) : null,
    compileOutput: compileParts.length > 0 ? clipText(compileParts.join("\n---\n")) : null,
    executionTime,
    memory,
    judge0StatusId: allPassed ? 3 : null,
    judge0Status: allPassed ? "Accepted" : finalStatus,
    statusCategory: normalizeJudgeStatus({
      statusId: allPassed ? 3 : null,
      statusDescription: allPassed ? "Accepted" : finalStatus,
      allPassed,
    }),
    allPassed,
  };
}
