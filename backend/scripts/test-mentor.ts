/**
 * Mentor test runner.
 *
 * Reads scenarios from mentor-scenarios.yaml, calls the debug endpoint for
 * each one, evaluates against the scenario's `expect` block, and writes both
 * a human-readable Markdown report and a machine-readable JSON dump.
 *
 * Usage:
 *   AI_DEBUG_ENABLED=true must be set on the backend.
 *   AUTH_TOKEN env var must contain a valid teacher JWT.
 *   API_BASE may override the default http://localhost:5000.
 *
 *   cd backend && npm run test:mentor
 *
 * To run a subset, set TEST_FILTER to a substring of the scenario name:
 *   TEST_FILTER=tr- npm run test:mentor   # Turkish only
 *   TEST_FILTER=hint npm run test:mentor  # hint-mode scenarios only
 */
import fs from "fs";
import path from "path";
import { parse as yamlParse } from "yaml";

// ─── Config ──────────────────────────────────────────────────────────────────

const API_BASE   = process.env.API_BASE   ?? "http://localhost:5000";
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "";
const FILTER     = process.env.TEST_FILTER ?? "";

const SCRIPT_DIR     = __dirname;
const SCENARIOS_FILE = path.join(SCRIPT_DIR, "mentor-scenarios.yaml");
const REPORT_DIR     = path.join(SCRIPT_DIR, "..", "..", "test-reports");

// ─── Types ───────────────────────────────────────────────────────────────────

type Expectation = {
  validatorDecision?: "allow" | "rewrite" | "block";
  maxSentences?: number;
  mustNotContainCodeBlock?: boolean;
  mustEndWithQuestionOrPointer?: boolean;
  replyLanguageIs?: "en" | "tr";
  mustContainAnyOf?: string[];
};

type Scenario = {
  name: string;
  description?: string;
  request: Record<string, unknown>;
  expect?: Expectation;
};

type DebugResult = {
  request: Record<string, unknown>;
  prompt: string;
  rawMentorOutput: string;
  mentorError: string | null;
  validator: {
    decision: "allow" | "rewrite" | "block";
    source: "ai" | "heuristic";
    riskScore: number;
    violations: string[];
    reason: string;
  } | null;
  policy: {
    action: "allow" | "rewrite" | "block";
    rewriteCount: number;
    finalText: string;
  } | null;
  quality: { ok: boolean; reasons: string[] };
  finalText: string;
  latency: {
    promptBuildMs: number;
    mentorMs: number;
    validatorMs: number;
    policyMs: number;
    totalMs: number;
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countSentences(text: string): number {
  return text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean).length;
}

function containsCodeBlock(text: string): boolean {
  return /```/.test(text);
}

function endsWithQuestionOrPointer(text: string): boolean {
  const trimmed = text.trim();
  if (/[?]\s*[\)\]"']*\s*$/.test(trimmed)) return true;
  if (trimmed.slice(-40).includes("?")) return true;
  return (
    /\b(consider|think about|notice|look at|focus on|check|examine|ask yourself|inspect|trace)\b/i.test(trimmed) ||
    /\b(düşün|incele|bak|kontrol et|dikkat et)\b/i.test(trimmed) ||
    /\bline\s+\d+\b/i.test(trimmed) ||
    /\bsatır\s+\d+\b/i.test(trimmed)
  );
}

function looksTurkish(text: string): boolean {
  if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) return true;
  return /\b(ve|bir|için|ile|olan|şu|bu|ne|nasıl|neden|var|yok|değil|kontrol|hata|kod)\b/i.test(text);
}

function detectReplyLanguage(text: string): "en" | "tr" {
  return looksTurkish(text) ? "tr" : "en";
}

function evaluate(result: DebugResult, expect: Expectation | undefined): string[] {
  const failures: string[] = [];
  if (!expect) return failures;

  if (expect.validatorDecision && result.validator?.decision !== expect.validatorDecision) {
    failures.push(
      `expected validator=${expect.validatorDecision}, got ${result.validator?.decision ?? "(null)"}`,
    );
  }

  if (typeof expect.maxSentences === "number") {
    const n = countSentences(result.finalText);
    if (n > expect.maxSentences) {
      failures.push(`expected <= ${expect.maxSentences} sentences, got ${n}`);
    }
  }

  if (expect.mustNotContainCodeBlock && containsCodeBlock(result.finalText)) {
    failures.push("contains a code block but mustNotContainCodeBlock=true");
  }

  if (expect.mustEndWithQuestionOrPointer && !endsWithQuestionOrPointer(result.finalText)) {
    failures.push("reply does not end with a question or concept pointer");
  }

  if (expect.replyLanguageIs) {
    const got = detectReplyLanguage(result.finalText);
    if (got !== expect.replyLanguageIs) {
      failures.push(`expected reply language ${expect.replyLanguageIs}, got ${got}`);
    }
  }

  if (expect.mustContainAnyOf && expect.mustContainAnyOf.length > 0) {
    const lower = result.finalText.toLowerCase();
    const found = expect.mustContainAnyOf.some((t) => lower.includes(t.toLowerCase()));
    if (!found) {
      failures.push(`reply does not contain any of: ${expect.mustContainAnyOf.join(", ")}`);
    }
  }

  return failures;
}

async function runScenario(s: Scenario): Promise<DebugResult> {
  const res = await fetch(`${API_BASE}/api/ai/chat/debug`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(s.request),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as DebugResult;
}

// ─── Report builders ─────────────────────────────────────────────────────────

function block(text: string): string {
  return "```\n" + (text ?? "") + "\n```";
}

function buildMarkdown(
  stamp: string,
  rows: Array<{
    scenario: Scenario;
    result: DebugResult | null;
    failures: string[];
    error: string | null;
  }>,
): string {
  const lines: string[] = [];
  lines.push(`# Mentor test report — ${stamp}`);
  lines.push("");

  const pass = rows.filter((r) => !r.error && r.failures.length === 0).length;
  const fail = rows.filter((r) => !r.error && r.failures.length > 0).length;
  const err  = rows.filter((r) => r.error).length;
  lines.push(`**Summary:** ${pass} pass, ${fail} fail, ${err} errored, total ${rows.length}.`);
  lines.push("");

  // Quick table of contents
  lines.push("## Index");
  for (const r of rows) {
    const verdict = r.error ? "💥" : r.failures.length === 0 ? "✅" : "❌";
    lines.push(`- ${verdict} [\`${r.scenario.name}\`](#${r.scenario.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")})`);
  }
  lines.push("");

  for (const r of rows) {
    const verdict =
      r.error
        ? "💥 ERROR"
        : r.failures.length === 0
          ? "✅ PASS"
          : `❌ FAIL (${r.failures.length})`;

    lines.push(`## ${r.scenario.name}`);
    lines.push(`**${verdict}**`);
    if (r.scenario.description) lines.push(`_${r.scenario.description}_`);
    lines.push("");

    if (r.error) {
      lines.push("```");
      lines.push(r.error);
      lines.push("```");
      lines.push("");
      lines.push("---");
      lines.push("");
      continue;
    }

    const res = r.result!;
    lines.push(`**Question:** ${(r.scenario.request.studentQuestion as string) || "(empty)"}`);
    lines.push(
      `**Mode:** ${r.scenario.request.mode}` +
      (r.scenario.request.hintLevel !== undefined ? `, hintLevel=${r.scenario.request.hintLevel}` : "") +
      (r.scenario.request.mentorLocale ? `, locale=${r.scenario.request.mentorLocale}` : ""),
    );
    lines.push(`**Detected intent:** ${res.request.intent}`);
    if (res.mentorError) {
      lines.push(`**Mentor call error:** ${res.mentorError}`);
    }
    if (res.validator) {
      lines.push(
        `**Validator:** ${res.validator.decision} (source=${res.validator.source}, risk=${res.validator.riskScore.toFixed(2)})`,
      );
      if (res.validator.violations.length > 0) {
        lines.push(`**Violations:** ${res.validator.violations.join(", ")}`);
      }
      if (res.validator.reason) lines.push(`**Validator reason:** ${res.validator.reason}`);
    }
    if (res.policy) {
      lines.push(`**Policy:** action=${res.policy.action}, rewrites=${res.policy.rewriteCount}`);
    }
    lines.push(`**Quality:** ${res.quality.ok ? "ok" : res.quality.reasons.join(", ")}`);
    lines.push(
      `**Latency:** total=${res.latency.totalMs}ms ` +
      `(mentor=${res.latency.mentorMs}, validator=${res.latency.validatorMs}, policy=${res.latency.policyMs})`,
    );
    lines.push("");
    lines.push("**Raw mentor output:**");
    lines.push(block(res.rawMentorOutput));
    lines.push("");
    lines.push("**Final text shown to student:**");
    lines.push(block(res.finalText));
    if (r.failures.length > 0) {
      lines.push("");
      lines.push("**Failures:**");
      for (const f of r.failures) lines.push(`- ${f}`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!AUTH_TOKEN) {
    console.error("ERROR: AUTH_TOKEN env var is required.");
    console.error('Hint: export AUTH_TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d \'{"email":"...","password":"..."}\' | jq -r .token)');
    process.exit(2);
  }

  const raw = fs.readFileSync(SCENARIOS_FILE, "utf8");
  const parsed = yamlParse(raw) as { scenarios: Scenario[] };
  if (!parsed?.scenarios || !Array.isArray(parsed.scenarios)) {
    console.error("ERROR: scenarios file has no `scenarios` array.");
    process.exit(2);
  }

  const all = FILTER
    ? parsed.scenarios.filter((s) => s.name.includes(FILTER))
    : parsed.scenarios;

  if (all.length === 0) {
    console.error(`No scenarios matched filter "${FILTER}".`);
    process.exit(2);
  }

  console.log(`Running ${all.length} scenario(s) against ${API_BASE} …`);
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const rows: Array<{
    scenario: Scenario;
    result: DebugResult | null;
    failures: string[];
    error: string | null;
  }> = [];

  for (const s of all) {
    process.stdout.write(`  ${s.name} … `);
    try {
      const result = await runScenario(s);
      const failures = evaluate(result, s.expect);
      rows.push({ scenario: s, result, failures, error: null });
      console.log(failures.length === 0 ? "✅" : `❌ (${failures.length})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rows.push({ scenario: s, result: null, failures: [], error: message });
      console.log(`💥 ${message.slice(0, 80)}`);
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const mdPath   = path.join(REPORT_DIR, `mentor-${stamp}.md`);
  const jsonPath = path.join(REPORT_DIR, `mentor-${stamp}.json`);

  fs.writeFileSync(mdPath, buildMarkdown(stamp, rows));
  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2));

  console.log("");
  console.log(`Markdown: ${mdPath}`);
  console.log(`JSON:     ${jsonPath}`);

  const pass = rows.filter((r) => !r.error && r.failures.length === 0).length;
  const fail = rows.length - pass;
  console.log(`Final:    ${pass}/${rows.length} pass.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
