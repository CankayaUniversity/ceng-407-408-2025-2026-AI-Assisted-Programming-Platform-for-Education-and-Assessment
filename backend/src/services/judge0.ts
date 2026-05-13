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

/** Overall deadline for one submission (submit + all polls combined). */
function getJudge0RequestTimeoutMs(): number {
  const raw = process.env.JUDGE0_REQUEST_TIMEOUT_MS;
  if (raw == null || raw === "") {
    return 30_000;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 30_000;
}

function getJudge0CandidateBaseUrls(): string[] {
  const primary = getJudge0BaseUrl();
  const out = [primary];
  if (primary.includes("localhost:2358") || primary.includes("127.0.0.1:2358")) {
    out.push("http://host.docker.internal:2358");
  }
  return [...new Set(out)];
}

const POLL_INTERVAL_MS = 500;

/**
 * Submit one program to Judge0 and poll for the result.
 *
 * Uses async polling (submit → token → GET until final status) instead of
 * wait=true.  This avoids a server-side bug in mrkushalsm/judge0 where the
 * wait=true long-poll never returns for interpreted languages (JS, Python,
 * Java, …) even though the worker correctly executes the submission.
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
    try {
      // ── Step 1: Submit (no wait=true) ─────────────────────────────────
      const submitRes = await fetch(`${base}/submissions?base64_encoded=true`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (!submitRes.ok) {
        const text = await submitRes.text();
        lastErr = `Judge0 HTTP ${submitRes.status} @ ${base}: ${text.slice(0, 400)}`;
        continue;
      }

      const submitData = (await submitRes.json()) as Record<string, unknown>;
      const token = submitData.token as string | undefined;

      if (!token) {
        lastErr = `Judge0 returned no token @ ${base}`;
        continue;
      }

      // ── Step 2: Poll until final status ───────────────────────────────
      // Judge0 status IDs: 1=In Queue, 2=Processing → pending; >=3 → final
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

        try {
          const pollRes = await fetch(
            `${base}/submissions/${token}?base64_encoded=true`,
            {
              headers: { Accept: "application/json" },
              signal: AbortSignal.timeout(5_000),
            },
          );

          if (!pollRes.ok) continue;

          const pollData = (await pollRes.json()) as Record<string, unknown>;
          const statusId = (pollData.status as { id?: number } | undefined)?.id;

          if (statusId !== undefined && statusId >= 3) {
            data = pollData;
            break;
          }
        } catch {
          // transient poll error — keep trying until deadline
        }
      }

      if (data) break;
      lastErr = `Judge0 polling timed out after ${timeoutMs}ms @ ${base}`;
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        lastErr = `Judge0 submit timed out after 10000ms @ ${base}`;
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
