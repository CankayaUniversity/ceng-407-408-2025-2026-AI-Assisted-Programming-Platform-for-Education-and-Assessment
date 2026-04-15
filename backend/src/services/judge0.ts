export type Judge0RunResult = {
  statusId: number | null;
  statusDescription: string | null;
  stdout: string;
  stderr: string;
  compileOutput: string;
  time: string | null;
  memory: number | null;
};

function decodeField(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }
  try {
    return Buffer.from(value, "base64").toString("utf-8");
  } catch {
    return value;
  }
}

function getJudge0BaseUrl(): string {
  return (process.env.JUDGE0_URL ?? "http://localhost:2358").replace(/\/$/, "");
}

/** Per-submission HTTP wait timeout (Judge0 wait=true). Prevents backend hanging forever if isolate stalls. */
function getJudge0RequestTimeoutMs(): number {
  const raw = process.env.JUDGE0_REQUEST_TIMEOUT_MS;
  if (raw == null || raw === "") {
    return 90_000;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 90_000;
}

function getJudge0CandidateBaseUrls(): string[] {
  const primary = getJudge0BaseUrl();
  const out = [primary];
  // Common Docker-on-Windows/macOS case: backend container cannot use localhost for host Judge0.
  if (primary.includes("localhost:2358") || primary.includes("127.0.0.1:2358")) {
    out.push("http://host.docker.internal:2358");
  }
  return [...new Set(out)];
}

/**
 * Submit one program to Judge0 (waits for result). Uses base64 on the wire when supported.
 */
export async function runInJudge0(params: {
  sourceCode: string;
  languageId: number;
  stdin: string;
  expectedOutput?: string;
}): Promise<Judge0RunResult> {
  const payload: Record<string, string | number> = {
    source_code: Buffer.from(params.sourceCode, "utf-8").toString("base64"),
    language_id: params.languageId,
    stdin: Buffer.from(params.stdin ?? "", "utf-8").toString("base64"),
  };
  if (params.expectedOutput !== undefined) {
    payload.expected_output = Buffer.from(params.expectedOutput, "utf-8").toString("base64");
  }

  let data: Record<string, unknown> | null = null;
  let lastErr = "";

  const timeoutMs = getJudge0RequestTimeoutMs();

  for (const base of getJudge0CandidateBaseUrls()) {
    const url = `${base}/submissions?base64_encoded=true&wait=true`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const text = await res.text();
        lastErr = `Judge0 HTTP ${res.status} @ ${base}: ${text.slice(0, 400)}`;
        continue;
      }
      data = (await res.json()) as Record<string, unknown>;
      break;
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        lastErr = `Judge0 request timed out after ${timeoutMs}ms @ ${base}`;
      } else {
        lastErr = e instanceof Error ? `${e.message} @ ${base}` : String(e);
      }
    }
  }

  if (!data) {
    throw new Error(lastErr || "Judge0 is unreachable");
  }

  const status = data.status as { id?: number; description?: string } | undefined;

  const timeVal = data.time;
  const time =
    typeof timeVal === "string"
      ? timeVal
      : typeof timeVal === "number"
        ? String(timeVal)
        : null;

  const memVal = data.memory;
  const memory = typeof memVal === "number" ? memVal : null;

  return {
    statusId: status?.id ?? null,
    statusDescription: status?.description ?? null,
    stdout: decodeField(data.stdout),
    stderr: decodeField(data.stderr),
    compileOutput: decodeField(data.compile_output),
    time,
    memory,
  };
}
