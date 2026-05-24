/**
 * Mentor smoke-eval script.
 *
 * Runs every fixture in fixtures.json against the live backend on this server,
 * captures the full mentor reply + validator metadata + latency, and writes
 * one JSON file (and a human-readable .md mirror) to backend/evals/results/.
 *
 * Usage on the server (backend container):
 *   1. Ensure backend is running on http://localhost:5000
 *   2. Set MENTOR_EVAL_EMAIL and MENTOR_EVAL_PASSWORD to a real student account
 *      (or pass --email / --password on the command line)
 *   3. From repo root:
 *        docker compose exec backend npx tsx evals/mentor-smoke.ts
 *      or, if you prefer to run from host with backend on localhost:5000:
 *        cd backend && npx tsx evals/mentor-smoke.ts
 *
 * Optional flags:
 *   --base    http://localhost:5000        # backend base URL
 *   --email   student@example.com          # login email (overrides env)
 *   --password ******                      # login password (overrides env)
 *   --only    compile-error,locale-turkish # run only these categories
 *   --fixtures path/to/custom.json         # use a different fixtures file
 *
 * The output file is the deliverable: send it back for evaluation.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// ── CLI arg parsing ──────────────────────────────────────────────────────────

type Args = {
  base: string;
  email: string | null;
  password: string | null;
  only: Set<string> | null;
  fixturesPath: string;
  minGapMs: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
  };
  const only = get("--only");
  // The backend rate limits /api/ai/chat to 10 requests per 60s per user.
  // Default pacing: ~7s between request *starts* keeps us safely under that.
  // Mentor latency is usually 4-15s, so this rarely adds wall-clock time on
  // top of what the model already takes.
  const gapRaw = get("--gap-ms") ?? process.env.MENTOR_EVAL_GAP_MS ?? "7000";
  const minGapMs = Math.max(0, Number.parseInt(gapRaw, 10) || 0);
  return {
    base: get("--base") ?? process.env.MENTOR_EVAL_BASE ?? "http://localhost:5000",
    email: get("--email") ?? process.env.MENTOR_EVAL_EMAIL ?? null,
    password: get("--password") ?? process.env.MENTOR_EVAL_PASSWORD ?? null,
    only: only ? new Set(only.split(",").map((s) => s.trim()).filter(Boolean)) : null,
    fixturesPath: get("--fixtures") ?? path.join(__dirname, "fixtures.json"),
    minGapMs,
  };
}

// ── Fixture + result types ───────────────────────────────────────────────────

/**
 * A fixture is either a single-turn case (the top-level `studentQuestion`
 * field is used) or a multi-turn conversation (the `turns[]` array is used).
 * For multi-turn, each turn can optionally override studentCode / stderr /
 * stdout / activeLineNumber / selectedCodeContext / mode — simulating what
 * happens when the student edits code, hits Run, highlights a line, etc.
 * between chat messages.
 *
 * The scorer always scores the FINAL mentor reply.
 */
type FixtureTurn = {
  studentQuestion: string;
  studentCode?: string;
  stderr?: string;
  stdout?: string;
  activeLineNumber?: number;
  selectedCodeContext?: string;
  mode?: string;          // e.g. "mentor" | "hint"
};

type Fixture = {
  id: string;
  category: string;
  language: string;
  // Single-turn fields (used when `turns` is absent)
  studentQuestion?: string;
  studentCode?: string;
  stderr?: string;
  stdout?: string;
  activeLineNumber?: number;
  selectedCodeContext?: string;
  mode?: string;
  // Multi-turn fields (overrides the single-turn fields when present)
  turns?: FixtureTurn[];
  // Common to both
  problemDescription?: string;
  activeFileName?: string;
};

type FixtureResult = {
  id: string;
  category: string;
  language: string;
  input: {
    // For single-turn fixtures: the only message. For multi-turn: the FINAL
    // user message in the conversation (what the mentor was asked to reply
    // to last).
    studentQuestion: string;
    studentCode: string | null;
    stderr: string | null;
    stdout: string | null;
    problemDescription: string | null;
    // Set only for multi-turn fixtures. Records the FULL conversation
    // (interleaved user + assistant) so the judge can audit context.
    conversation: Array<{ role: "user" | "assistant"; content: string }> | null;
    turnCount: number;
  };
  ok: boolean;
  httpStatus: number;
  error: string | null;
  // For multi-turn: latency of the FINAL turn (what was scored).
  latencyMs: number;
  // For multi-turn: cumulative latency across all turns.
  totalLatencyMs: number;
  mentorReply: string | null;
  replyLength: number | null;
  replyLanguageGuess: "tr" | "en" | "other" | null;
  policyAction: string | null;
  validator: unknown;
  finalValidator: unknown;
  rewriteCount: number | null;
  fallbackUsed: boolean | null;
  requestFlags: unknown;
  // Per-turn breakdown — one entry per turn. For single-turn fixtures the
  // array has exactly one element. The scorer uses this to perform per-turn
  // judging on multi-turn fixtures.
  turnResults: TurnResult[];
};

// ── Tiny language guesser (no deps) ──────────────────────────────────────────
//
// Counts Turkish-specific letters (ı, ş, ğ, ç, ö, ü + a handful of stopwords)
// vs. English stopwords. Crude but good enough to flag locale drift.
function guessLanguage(text: string): "tr" | "en" | "other" {
  if (!text || text.trim().length < 8) return "other";
  const lower = text.toLowerCase();
  const trChars = (lower.match(/[ışğçöü]/g) ?? []).length;
  const trWords = (lower.match(/\b(bir|için|ile|ama|fakat|veya|şey|nedir|şu|bu|şöyle|böyle|değil|olarak|gibi|kadar|sonra|önce|şimdi|hata|kod|fonksiyon|döngü|değişken|satır|hocam|merhaba|nasıl|neden)\b/g) ?? []).length;
  const enWords = (lower.match(/\b(the|and|you|your|that|this|with|for|but|not|are|have|been|will|would|should|because|when|where|what|how|here|there|loop|function|variable|line|error|code)\b/g) ?? []).length;
  const trScore = trChars * 2 + trWords * 3;
  const enScore = enWords * 3;
  if (trScore === 0 && enScore === 0) return "other";
  return trScore > enScore ? "tr" : "en";
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function login(base: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Login failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  let parsed: { accessToken?: string; token?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Login returned non-JSON body: ${text.slice(0, 200)}`);
  }
  const token = parsed.accessToken ?? parsed.token;
  if (!token) {
    throw new Error(`Login succeeded but no accessToken in response: ${text.slice(0, 200)}`);
  }
  return token;
}

type HistoryMessage = { role: "user" | "assistant"; content: string };

async function sendOneMessage(
  base: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ httpStatus: number; data: Record<string, unknown> | null; raw: string; latencyMs: number }> {
  const start = Date.now();
  const res = await fetch(`${base}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  const latencyMs = Date.now() - start;
  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  return { httpStatus: res.status, data, raw, latencyMs };
}

/**
 * Call the mentor for either a single-turn fixture or a multi-turn fixture.
 *
 * Multi-turn fixtures replay each turn in sequence, accumulating
 * conversationHistory. The function returns the *final* turn's result —
 * this is what gets scored. The intermediate turns are not scored because
 * the "final answer quality" is the only judgement that matters for the
 * end-to-end test; intermediate replies are stored in the conversation
 * history so the judge can see them if it wants.
 */
/**
 * Per-turn captured data. One of these is emitted per turn so the scorer can
 * judge intermediate replies, not just the final one.
 */
type TurnResult = {
  userMessage: string;
  mentorReply: string | null;
  httpStatus: number;
  latencyMs: number;
  policyAction: string | null;
  rewriteCount: number | null;
  validator: unknown;
  finalValidator: unknown;
  // Extra inputs that were active during this turn (snapshot at submit time):
  studentCode: string | null;
  stderr: string | null;
  stdout: string | null;
  activeLineNumber: number | null;
  selectedCodeContext: string | null;
  mode: string | null;
};

async function callMentor(
  base: string,
  token: string,
  fixture: Fixture,
): Promise<{
  httpStatus: number;
  body: Record<string, unknown> | null;
  raw: string;
  latencyMs: number;
  turnCount: number;
  totalLatencyMs: number;
  // Per-turn breakdown. For single-turn fixtures this is an array of length 1.
  turnResults: TurnResult[];
}> {
  // Normalise: either use the explicit turns array, or wrap the single-turn
  // fields in a one-turn array.
  const turns: FixtureTurn[] = fixture.turns && fixture.turns.length > 0
    ? fixture.turns
    : [{
        studentQuestion: fixture.studentQuestion ?? "",
        studentCode: fixture.studentCode,
        stderr: fixture.stderr,
        stdout: fixture.stdout,
        activeLineNumber: fixture.activeLineNumber,
        selectedCodeContext: fixture.selectedCodeContext,
        mode: fixture.mode,
      }];

  const history: HistoryMessage[] = [];
  let lastResult: Awaited<ReturnType<typeof sendOneMessage>> | null = null;
  let totalLatencyMs = 0;
  const turnResults: TurnResult[] = [];

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const effectiveStudentCode  = t.studentCode ?? fixture.studentCode ?? "";
    const effectiveStderr       = t.stderr ?? fixture.stderr ?? "";
    const effectiveStdout       = t.stdout ?? fixture.stdout ?? "";
    const effectiveLine         = t.activeLineNumber ?? fixture.activeLineNumber ?? null;
    const effectiveSelected     = t.selectedCodeContext ?? fixture.selectedCodeContext ?? null;
    const effectiveMode         = t.mode ?? fixture.mode ?? "mentor";

    const payload: Record<string, unknown> = {
      studentQuestion: t.studentQuestion,
      studentCode: effectiveStudentCode,
      stderr: effectiveStderr,
      stdout: effectiveStdout,
      problemDescription: fixture.problemDescription ?? "",
      language: fixture.language,
      activeFileName: fixture.activeFileName ?? `solution.${fixture.language}`,
      activeLineNumber: effectiveLine,
      selectedCodeContext: effectiveSelected,
      conversationHistory: [...history],
      mode: effectiveMode,
    };

    lastResult = await sendOneMessage(base, token, payload);
    totalLatencyMs += lastResult.latencyMs;

    const reply = typeof lastResult.data?.mentorReply === "string"
      ? (lastResult.data.mentorReply as string)
      : null;

    turnResults.push({
      userMessage: t.studentQuestion,
      mentorReply: reply,
      httpStatus: lastResult.httpStatus,
      latencyMs: lastResult.latencyMs,
      policyAction: typeof lastResult.data?.policyAction === "string" ? lastResult.data.policyAction : null,
      rewriteCount: typeof lastResult.data?.rewriteCount === "number" ? lastResult.data.rewriteCount : null,
      validator: lastResult.data?.validator ?? null,
      finalValidator: lastResult.data?.finalValidator ?? null,
      studentCode: effectiveStudentCode || null,
      stderr: effectiveStderr || null,
      stdout: effectiveStdout || null,
      activeLineNumber: effectiveLine,
      selectedCodeContext: effectiveSelected,
      mode: effectiveMode,
    });

    // Append this turn to history regardless of HTTP status (for the next
    // turn's context) — if the call errored, we abort the conversation.
    history.push({ role: "user", content: t.studentQuestion });
    if (reply) history.push({ role: "assistant", content: reply });

    if (lastResult.httpStatus < 200 || lastResult.httpStatus >= 300) {
      // Don't continue replaying turns after a failure.
      break;
    }
  }

  return {
    httpStatus: lastResult!.httpStatus,
    body: lastResult!.data,
    raw: lastResult!.raw,
    latencyMs: lastResult!.latencyMs,
    turnCount: turns.length,
    totalLatencyMs,
    turnResults,
  };
}

// ── Markdown mirror ──────────────────────────────────────────────────────────

function toMarkdown(meta: Record<string, unknown>, results: FixtureResult[]): string {
  const byCat = new Map<string, FixtureResult[]>();
  for (const r of results) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push(r);
  }

  const lines: string[] = [];
  lines.push(`# Mentor smoke-eval results`);
  lines.push("");
  lines.push(`- Run at: \`${meta.runAt}\``);
  lines.push(`- Base URL: \`${meta.base}\``);
  lines.push(`- Fixtures: ${results.length}`);
  lines.push(`- OK / Errored: ${results.filter((r) => r.ok).length} / ${results.filter((r) => !r.ok).length}`);
  lines.push("");

  for (const [cat, list] of byCat) {
    lines.push(`## Category: ${cat}`);
    lines.push("");
    for (const r of list) {
      lines.push(`### \`${r.id}\` (${r.language})`);
      lines.push("");
      lines.push(`- HTTP: ${r.httpStatus} · latency: ${r.latencyMs} ms · policy: ${r.policyAction ?? "—"} · rewrites: ${r.rewriteCount ?? "—"} · reply lang guess: ${r.replyLanguageGuess ?? "—"}`);
      if (r.error) lines.push(`- **Error:** ${r.error}`);
      lines.push("");
      lines.push("**Student question**");
      lines.push("");
      lines.push("```");
      lines.push(r.input.studentQuestion);
      lines.push("```");
      if (r.input.studentCode) {
        lines.push("");
        lines.push("**Student code**");
        lines.push("");
        lines.push("```" + r.language);
        lines.push(r.input.studentCode);
        lines.push("```");
      }
      if (r.input.stderr) {
        lines.push("");
        lines.push("**stderr**");
        lines.push("");
        lines.push("```");
        lines.push(r.input.stderr);
        lines.push("```");
      }
      lines.push("");
      lines.push("**Mentor reply**");
      lines.push("");
      lines.push("```");
      lines.push(r.mentorReply ?? "(no reply)");
      lines.push("```");
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }
  return lines.join("\n");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  if (!args.email || !args.password) {
    console.error(
      "Error: provide login credentials via --email/--password or MENTOR_EVAL_EMAIL/MENTOR_EVAL_PASSWORD.",
    );
    process.exit(2);
  }

  if (!existsSync(args.fixturesPath)) {
    console.error(`Error: fixtures file not found at ${args.fixturesPath}`);
    process.exit(2);
  }

  const fixturesRaw = await readFile(args.fixturesPath, "utf8");
  let fixtures: Fixture[];
  try {
    fixtures = JSON.parse(fixturesRaw) as Fixture[];
  } catch (e) {
    console.error(`Error: fixtures file is not valid JSON: ${(e as Error).message}`);
    process.exit(2);
  }

  if (args.only) {
    fixtures = fixtures.filter((f) => args.only!.has(f.category));
  }

  console.log(`[mentor-smoke] base=${args.base} fixtures=${fixtures.length} gap=${args.minGapMs}ms`);
  console.log(`[mentor-smoke] logging in as ${args.email}`);

  const token = await login(args.base, args.email!, args.password!);
  console.log(`[mentor-smoke] login OK, token length=${token.length}`);

  const results: FixtureResult[] = [];
  let lastRequestStart = 0;

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];

    // Respect the backend's per-user AI rate limit (10 req / 60s). Wait until
    // at least args.minGapMs have elapsed since the previous request started.
    if (lastRequestStart > 0 && args.minGapMs > 0) {
      const elapsed = Date.now() - lastRequestStart;
      const wait = args.minGapMs - elapsed;
      if (wait > 0) {
        await sleep(wait);
      }
    }

    // Determine the final user message and per-fixture turn count for logging
    // and result construction.
    const fixtureTurns = f.turns && f.turns.length > 0 ? f.turns : null;
    const turnCount = fixtureTurns ? fixtureTurns.length : 1;
    const finalUserMessage = fixtureTurns
      ? fixtureTurns[fixtureTurns.length - 1].studentQuestion
      : (f.studentQuestion ?? "");
    const finalStudentCode = fixtureTurns
      ? (fixtureTurns[fixtureTurns.length - 1].studentCode ?? f.studentCode ?? null)
      : (f.studentCode ?? null);
    const finalStderr = fixtureTurns
      ? (fixtureTurns[fixtureTurns.length - 1].stderr ?? f.stderr ?? null)
      : (f.stderr ?? null);
    const finalStdout = fixtureTurns
      ? (fixtureTurns[fixtureTurns.length - 1].stdout ?? f.stdout ?? null)
      : (f.stdout ?? null);

    process.stdout.write(`[${i + 1}/${fixtures.length}] ${f.id} (${f.category}${turnCount > 1 ? `, ${turnCount} turns` : ""}) ... `);
    let result: FixtureResult;
    try {
      lastRequestStart = Date.now();
      let { httpStatus, body, raw, latencyMs, totalLatencyMs, turnResults } = await callMentor(args.base, token, f);

      // If the rate limiter still trips us, back off for the full window and retry once.
      if (httpStatus === 429) {
        process.stdout.write("rate-limited, backing off 65s ... ");
        await sleep(65_000);
        lastRequestStart = Date.now();
        ({ httpStatus, body, raw, latencyMs, totalLatencyMs, turnResults } = await callMentor(args.base, token, f));
      }
      const mentorReply = typeof body?.mentorReply === "string" ? body.mentorReply : null;

      // Build the FULL interleaved conversation (user + assistant alternating)
      // for the scored output. The judge will see this so it can audit memory
      // and consistency across turns.
      let conversation: FixtureResult["input"]["conversation"] = null;
      if (fixtureTurns) {
        conversation = [];
        for (const tr of turnResults) {
          conversation.push({ role: "user", content: tr.userMessage });
          if (tr.mentorReply !== null) {
            conversation.push({ role: "assistant", content: tr.mentorReply });
          }
        }
      }

      result = {
        id: f.id,
        category: f.category,
        language: f.language,
        input: {
          studentQuestion: finalUserMessage,
          studentCode: finalStudentCode,
          stderr: finalStderr,
          stdout: finalStdout,
          problemDescription: f.problemDescription ?? null,
          conversation,
          turnCount,
        },
        ok: httpStatus >= 200 && httpStatus < 300 && mentorReply !== null,
        httpStatus,
        error:
          httpStatus >= 200 && httpStatus < 300
            ? mentorReply === null
              ? `Response missing mentorReply field; raw=${raw.slice(0, 200)}`
              : null
            : `HTTP ${httpStatus}: ${raw.slice(0, 300)}`,
        latencyMs,
        totalLatencyMs,
        mentorReply,
        replyLength: mentorReply ? mentorReply.length : null,
        replyLanguageGuess: mentorReply ? guessLanguage(mentorReply) : null,
        policyAction: typeof body?.policyAction === "string" ? body.policyAction : null,
        validator: body?.validator ?? null,
        finalValidator: body?.finalValidator ?? null,
        rewriteCount: typeof body?.rewriteCount === "number" ? body.rewriteCount : null,
        fallbackUsed: typeof body?.fallbackUsed === "boolean" ? body.fallbackUsed : null,
        requestFlags: body?.requestFlags ?? null,
        turnResults,
      };
      const latencyLabel = turnCount > 1
        ? `${totalLatencyMs} ms total, last ${latencyMs} ms`
        : `${latencyMs} ms`;
      process.stdout.write(
        `${result.ok ? "OK" : "FAIL"} (${latencyLabel}, ${result.replyLength ?? 0} chars, lang=${result.replyLanguageGuess ?? "?"})\n`,
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      result = {
        id: f.id,
        category: f.category,
        language: f.language,
        input: {
          studentQuestion: finalUserMessage,
          studentCode: finalStudentCode,
          stderr: finalStderr,
          stdout: finalStdout,
          problemDescription: f.problemDescription ?? null,
          conversation: fixtureTurns
            ? fixtureTurns.map((t) => ({ role: "user" as const, content: t.studentQuestion }))
            : null,
          turnCount,
        },
        ok: false,
        httpStatus: 0,
        error: err,
        latencyMs: 0,
        totalLatencyMs: 0,
        mentorReply: null,
        replyLength: null,
        replyLanguageGuess: null,
        policyAction: null,
        validator: null,
        finalValidator: null,
        rewriteCount: null,
        fallbackUsed: null,
        requestFlags: null,
        turnResults: [],
      };
      process.stdout.write(`ERROR — ${err}\n`);
    }
    results.push(result);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultsDir = path.join(__dirname, "results");
  await mkdir(resultsDir, { recursive: true });

  const meta = {
    runAt: new Date().toISOString(),
    base: args.base,
    fixtureCount: results.length,
    ok: results.filter((r) => r.ok).length,
    errored: results.filter((r) => !r.ok).length,
    totalLatencyMs: results.reduce((s, r) => s + r.latencyMs, 0),
    avgLatencyMs: Math.round(
      results.reduce((s, r) => s + r.latencyMs, 0) / Math.max(results.length, 1),
    ),
  };

  const jsonPath = path.join(resultsDir, `mentor-eval-${stamp}.json`);
  const mdPath = path.join(resultsDir, `mentor-eval-${stamp}.md`);
  await writeFile(jsonPath, JSON.stringify({ meta, results }, null, 2), "utf8");
  await writeFile(mdPath, toMarkdown(meta, results), "utf8");

  console.log("");
  console.log(`[mentor-smoke] done — ${meta.ok} ok, ${meta.errored} errored, avg ${meta.avgLatencyMs} ms`);
  console.log(`[mentor-smoke] JSON: ${jsonPath}`);
  console.log(`[mentor-smoke] MD  : ${mdPath}`);
}

main().catch((e) => {
  console.error("[mentor-smoke] fatal:", e);
  process.exit(1);
});
