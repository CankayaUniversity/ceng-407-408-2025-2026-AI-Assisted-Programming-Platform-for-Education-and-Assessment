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

type Fixture = {
  id: string;
  category: string;
  language: string;
  studentQuestion: string;
  studentCode?: string;
  stderr?: string;
  stdout?: string;
  problemDescription?: string;
  activeFileName?: string;
  activeLineNumber?: number;
};

type FixtureResult = {
  id: string;
  category: string;
  language: string;
  input: {
    studentQuestion: string;
    studentCode: string | null;
    stderr: string | null;
    stdout: string | null;
    problemDescription: string | null;
  };
  ok: boolean;
  httpStatus: number;
  error: string | null;
  latencyMs: number;
  mentorReply: string | null;
  replyLength: number | null;
  replyLanguageGuess: "tr" | "en" | "other" | null;
  policyAction: string | null;
  validator: unknown;
  finalValidator: unknown;
  rewriteCount: number | null;
  fallbackUsed: boolean | null;
  requestFlags: unknown;
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

async function callMentor(
  base: string,
  token: string,
  fixture: Fixture,
): Promise<{ httpStatus: number; body: Record<string, unknown> | null; raw: string; latencyMs: number }> {
  const payload = {
    studentQuestion: fixture.studentQuestion,
    studentCode: fixture.studentCode ?? "",
    stderr: fixture.stderr ?? "",
    stdout: fixture.stdout ?? "",
    problemDescription: fixture.problemDescription ?? "",
    language: fixture.language,
    activeFileName: fixture.activeFileName ?? `solution.${fixture.language}`,
    activeLineNumber: fixture.activeLineNumber ?? null,
    conversationHistory: [],
    mode: "mentor",
  };

  const start = Date.now();
  const res = await fetch(`${base}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  const latencyMs = Date.now() - start;
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  return { httpStatus: res.status, body, raw, latencyMs };
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

    process.stdout.write(`[${i + 1}/${fixtures.length}] ${f.id} (${f.category}) ... `);
    let result: FixtureResult;
    try {
      lastRequestStart = Date.now();
      let { httpStatus, body, raw, latencyMs } = await callMentor(args.base, token, f);

      // If the rate limiter still trips us, back off for the full window and retry once.
      if (httpStatus === 429) {
        process.stdout.write("rate-limited, backing off 65s ... ");
        await sleep(65_000);
        lastRequestStart = Date.now();
        ({ httpStatus, body, raw, latencyMs } = await callMentor(args.base, token, f));
      }
      const mentorReply = typeof body?.mentorReply === "string" ? body.mentorReply : null;
      result = {
        id: f.id,
        category: f.category,
        language: f.language,
        input: {
          studentQuestion: f.studentQuestion,
          studentCode: f.studentCode ?? null,
          stderr: f.stderr ?? null,
          stdout: f.stdout ?? null,
          problemDescription: f.problemDescription ?? null,
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
        mentorReply,
        replyLength: mentorReply ? mentorReply.length : null,
        replyLanguageGuess: mentorReply ? guessLanguage(mentorReply) : null,
        policyAction: typeof body?.policyAction === "string" ? body.policyAction : null,
        validator: body?.validator ?? null,
        finalValidator: body?.finalValidator ?? null,
        rewriteCount: typeof body?.rewriteCount === "number" ? body.rewriteCount : null,
        fallbackUsed: typeof body?.fallbackUsed === "boolean" ? body.fallbackUsed : null,
        requestFlags: body?.requestFlags ?? null,
      };
      process.stdout.write(
        `${result.ok ? "OK" : "FAIL"} (${latencyMs} ms, ${result.replyLength ?? 0} chars, lang=${result.replyLanguageGuess ?? "?"})\n`,
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      result = {
        id: f.id,
        category: f.category,
        language: f.language,
        input: {
          studentQuestion: f.studentQuestion,
          studentCode: f.studentCode ?? null,
          stderr: f.stderr ?? null,
          stdout: f.stdout ?? null,
          problemDescription: f.problemDescription ?? null,
        },
        ok: false,
        httpStatus: 0,
        error: err,
        latencyMs: 0,
        mentorReply: null,
        replyLength: null,
        replyLanguageGuess: null,
        policyAction: null,
        validator: null,
        finalValidator: null,
        rewriteCount: null,
        fallbackUsed: null,
        requestFlags: null,
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
