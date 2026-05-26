/**
 * Flashcard evaluation runner — structural + assertion-based, no LLM judge.
 *
 * Loads fixtures from fixtures-flashcards.json, calls generateFlashcards()
 * directly (bypassing the HTTP route and the background-job machinery —
 * we're testing the AI + post-generation filter pipeline, not the queue),
 * then runs deterministic structural assertions against each card set.
 *
 * The assertions encode the same rules the flashcardService filters enforce
 * (`isValidCard`, `dedupeCards`, `hasGrounding`, `hasValidSnippetGrounding`)
 * plus per-fixture expectations declared inline in the JSON:
 *
 *   minCards / maxCards          — card-count bounds
 *   mustContainType[]            — at least one card of each listed type must exist
 *   forbiddenTypes[]             — no card may have one of these types
 *   mustCiteAnyOf[]              — at least one card body must mention ≥1 of these tokens
 *   mustCiteFromAcceptedCode     — at least one card cites a token from acceptedCode
 *   mustCiteFromAttempts         — at least one card cites a token from a failed attempt
 *
 * Outputs:
 *   evals/results/flashcard-eval-<timestamp>.json   raw card sets + per-fixture verdict
 *   evals/results/flashcard-eval-<timestamp>.md     human-readable summary
 *
 * Usage (inside backend container):
 *   docker compose exec backend npx tsx evals/flashcard-smoke.ts
 *
 * Optional flags:
 *   --fixtures path/to/custom.json   override the fixture file
 *   --gap-ms 5000                    delay between fixtures (default 5000ms)
 *
 * Why no LLM judge layer:
 *   The flashcardService already enforces validity / dedup / grounding /
 *   snippet grounding internally. The interesting questions ("did our
 *   filters reject the wrong things?", "did the prompt regression silently
 *   produce generic cards?") are deterministic and answerable without an
 *   LLM. A tri-judge layer can be added later if subjective quality
 *   scoring becomes a priority.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  generateFlashcards,
  type FailedAttempt,
  type FlashcardItem,
} from "../src/services/flashcardService";

// ── Types ────────────────────────────────────────────────────────────────────

type FixtureExpectations = {
  minCards?:                number;
  maxCards?:                number;
  mustContainType?:         Array<"error" | "shortcoming" | "improvement">;
  forbiddenTypes?:          Array<"error" | "shortcoming" | "improvement">;
  mustCiteAnyOf?:           string[];
  mustCiteFromAcceptedCode?: boolean;
  mustCiteFromAttempts?:    boolean;
};

type Fixture = {
  id:                 string;
  category:           string;
  expectedBehavior:   string;
  problemTitle:       string;
  language:           string;
  referenceSolution:  string | null;
  acceptedCode:       string;
  failedAttempts:     FailedAttempt[];
  expect:             FixtureExpectations;
};

type AssertionResult = { name: string; ok: boolean; detail?: string };

type FixtureResult = {
  id:                string;
  category:          string;
  ok:                boolean;
  latencyMs:         number;
  cards:             FlashcardItem[];
  assertions:        AssertionResult[];
  passedAssertions:  number;
  totalAssertions:   number;
  error:             string | null;
};

// ── CLI ──────────────────────────────────────────────────────────────────────

type Args = { fixturesPath: string; minGapMs: number };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = {
    fixturesPath: path.resolve(__dirname, "fixtures-flashcards.json"),
    minGapMs:     5_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixtures") out.fixturesPath = path.resolve(argv[++i]);
    else if (a === "--gap-ms") out.minGapMs = Number.parseInt(argv[++i], 10);
  }
  return out;
}

// ── Token extraction (mirrors flashcardService's grounding logic) ────────────

const COMMON_ENGLISH = new Set([
  "your", "this", "that", "with", "from", "into", "when", "while", "where",
  "what", "have", "will", "would", "should", "could", "must", "make", "made",
  "code", "line", "loop", "function", "variable", "value", "result", "output",
  "input", "error", "problem", "solution", "attempt", "case", "test",
  "student", "students", "instead", "because", "since", "however", "though",
  "always", "never", "often", "sometimes", "every", "each", "more", "less",
  "best", "good", "bad", "wrong", "right", "correct", "incorrect", "issue",
  "first", "second", "third", "last", "final", "before", "after", "above",
  "below", "between", "inside", "outside", "specific", "general", "important",
  "really", "very", "still", "again", "then", "than", "their", "them",
]);

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Tokens worth checking: backticked spans + identifier-like words ≥ 4 chars. */
function extractTokensFromBody(body: string): string[] {
  const back = (body.match(/`([^`]+)`/g) ?? [])
    .map((s) => s.replace(/`/g, "").trim().toLowerCase())
    .filter((s) => s.length >= 2);
  const ids = (body.match(/\b[a-zA-Z_][a-zA-Z0-9_]{3,}\b/g) ?? [])
    .map((s) => s.toLowerCase())
    .filter((s) => !COMMON_ENGLISH.has(s));
  return [...new Set([...back, ...ids])];
}

function anyTokenIn(tokens: string[], corpus: string): boolean {
  const c = corpus.toLowerCase();
  return tokens.some((t) => c.includes(t));
}

function bodyContainsAny(body: string, needles: string[]): boolean {
  const b = body.toLowerCase();
  return needles.some((n) => b.includes(n.toLowerCase()));
}

// ── Assertions ───────────────────────────────────────────────────────────────

function runAssertions(
  cards: FlashcardItem[],
  fixture: Fixture,
): AssertionResult[] {
  const results: AssertionResult[] = [];
  const { expect } = fixture;

  // 1. Card count bounds
  if (expect.minCards !== undefined) {
    const ok = cards.length >= expect.minCards;
    results.push({
      name: `count >= ${expect.minCards}`,
      ok,
      detail: ok ? undefined : `got ${cards.length}`,
    });
  }
  if (expect.maxCards !== undefined) {
    const ok = cards.length <= expect.maxCards;
    results.push({
      name: `count <= ${expect.maxCards}`,
      ok,
      detail: ok ? undefined : `got ${cards.length}`,
    });
  }

  // 2. Every card individually valid (re-applying isValidCard's rules locally)
  for (const [idx, c] of cards.entries()) {
    const failures: string[] = [];
    if (!c.title.trim() || c.title.trim() === "Feedback") failures.push("invalid title");
    if (!c.concept.trim())                               failures.push("missing concept");
    if (!c.rootCause.trim())                             failures.push("missing rootCause");
    if (c.body.trim().length < 80)                       failures.push(`body too short (${c.body.trim().length} chars)`);
    if (!/[.!?]/.test(c.body))                           failures.push("body lacks sentence terminator");
    results.push({
      name:   `card[${idx}] structurally valid`,
      ok:     failures.length === 0,
      detail: failures.length === 0 ? undefined : failures.join("; "),
    });
  }

  // 3. Distinct concepts (dedup filter should already enforce this)
  const concepts = cards.map((c) => c.concept.trim().toLowerCase()).filter(Boolean);
  const dupConcept = concepts.find((c, i) => concepts.indexOf(c) !== i) ?? null;
  results.push({
    name:   "concepts are distinct",
    ok:     dupConcept === null,
    detail: dupConcept ? `duplicate concept: "${dupConcept}"` : undefined,
  });

  // 4. Required types present
  for (const t of expect.mustContainType ?? []) {
    const ok = cards.some((c) => c.type === t);
    results.push({
      name:   `contains type=${t}`,
      ok,
      detail: ok ? undefined : `types present: ${[...new Set(cards.map((c) => c.type))].join(", ") || "none"}`,
    });
  }

  // 5. Forbidden types absent
  for (const t of expect.forbiddenTypes ?? []) {
    const bad = cards.filter((c) => c.type === t);
    results.push({
      name:   `does NOT contain type=${t}`,
      ok:     bad.length === 0,
      detail: bad.length === 0 ? undefined : `found ${bad.length} ${t} card(s)`,
    });
  }

  // 6. mustCiteAnyOf — at least one card body must mention any of the listed substrings
  if (expect.mustCiteAnyOf && expect.mustCiteAnyOf.length > 0) {
    const ok = cards.some((c) => bodyContainsAny(c.body, expect.mustCiteAnyOf!));
    results.push({
      name:   `some card cites one of [${expect.mustCiteAnyOf.join(", ")}]`,
      ok,
      detail: ok ? undefined : "no card mentioned any expected substring",
    });
  }

  // 7. Grounding in accepted code
  if (expect.mustCiteFromAcceptedCode) {
    const ok = cards.some((c) => {
      const tokens = extractTokensFromBody(c.body);
      return anyTokenIn(tokens, fixture.acceptedCode);
    });
    results.push({
      name:   "at least one card grounded in acceptedCode",
      ok,
      detail: ok ? undefined : "no card cites a real token from acceptedCode",
    });
  }

  // 8. Grounding in failed attempts
  if (expect.mustCiteFromAttempts) {
    const corpus = fixture.failedAttempts
      .flatMap((a) => [a.sourceCode, a.stderr, a.compileOutput, a.stdout])
      .filter((s): s is string => typeof s === "string")
      .join("\n");
    const ok = cards.some((c) => {
      const tokens = extractTokensFromBody(c.body);
      return anyTokenIn(tokens, corpus);
    });
    results.push({
      name:   "at least one card grounded in failedAttempts",
      ok,
      detail: ok ? undefined : "no card cites a real token from any failed attempt",
    });
  }

  // 9. Hallucination guard — body must NOT contain fake test labels
  for (const [idx, c] of cards.entries()) {
    if (/\b[Tt]est\s+\d+\b/.test(c.body) || /\bHidden\s+\d+\b/.test(c.body)) {
      results.push({
        name:   `card[${idx}] no fake test labels`,
        ok:     false,
        detail: "body mentions 'Test N' / 'Hidden N' — these labels are not in the input",
      });
    }
  }

  // 10. Hallucination guard — vague-warning phrases forbidden by prompt
  const VAGUE = [
    "may behave unpredictably",
    "could cause issues",
    "might break",
    "could be a problem",
  ];
  for (const [idx, c] of cards.entries()) {
    const found = VAGUE.find((v) => c.body.toLowerCase().includes(v));
    if (found) {
      results.push({
        name:   `card[${idx}] no vague warning phrases`,
        ok:     false,
        detail: `body contains forbidden phrase: "${found}"`,
      });
    }
  }

  // 11. Snippet grounding — if a card has a codeSnippet.bad, verify it actually
  //     appears in the right source corpus.
  for (const [idx, c] of cards.entries()) {
    if (!c.codeSnippet?.bad) continue;
    const needle = normalize(c.codeSnippet.bad);
    if (!needle) continue;
    const haystackParts: string[] = [];
    if (c.type === "error") {
      haystackParts.push(...fixture.failedAttempts.map((a) => a.sourceCode));
    } else {
      // shortcoming / improvement — bad should be in acceptedCode
      haystackParts.push(fixture.acceptedCode);
    }
    const haystack = normalize(haystackParts.join("\n"));
    const ok = needle.split("\n").every((line) => {
      const l = normalize(line);
      return !l || haystack.includes(l);
    });
    results.push({
      name:   `card[${idx}] codeSnippet.bad is verbatim in source`,
      ok,
      detail: ok ? undefined : `snippet not found verbatim in ${c.type === "error" ? "failedAttempts" : "acceptedCode"}`,
    });
  }

  return results;
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args   = parseArgs();
  const fixtRaw = await readFile(args.fixturesPath, "utf-8");
  const fixtures: Fixture[] = JSON.parse(fixtRaw);

  console.log(`[flashcard-smoke] fixtures=${fixtures.length} gap=${args.minGapMs}ms`);

  const results: FixtureResult[] = [];
  for (const [i, fx] of fixtures.entries()) {
    process.stdout.write(`[${i + 1}/${fixtures.length}] ${fx.id} (${fx.category}) ... `);

    const start = Date.now();
    let cards: FlashcardItem[] = [];
    let error: string | null = null;
    try {
      cards = await generateFlashcards({
        problemTitle:       fx.problemTitle,
        problemDescription: fx.expectedBehavior, // brief context; prompt uses it for problem block
        referenceSolution:  fx.referenceSolution,
        language:           fx.language,
        acceptedCode:       fx.acceptedCode,
        failedAttempts:     fx.failedAttempts,
      });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const latencyMs = Date.now() - start;

    const assertions = error
      ? [{ name: "generation completed", ok: false, detail: error }]
      : runAssertions(cards, fx);
    const passed = assertions.filter((a) => a.ok).length;
    const total  = assertions.length;
    const ok     = error === null && passed === total;

    results.push({
      id:               fx.id,
      category:         fx.category,
      ok,
      latencyMs,
      cards,
      assertions,
      passedAssertions: passed,
      totalAssertions:  total,
      error,
    });

    if (error) {
      console.log(`ERROR (${latencyMs} ms): ${error}`);
    } else {
      console.log(`${ok ? "✓" : "✗"} (${latencyMs} ms, ${passed}/${total} assertions, ${cards.length} cards)`);
      if (!ok) {
        for (const a of assertions) {
          if (!a.ok) console.log(`    ✗ ${a.name}${a.detail ? ` — ${a.detail}` : ""}`);
        }
      }
    }

    // Pace between fixtures so Ollama doesn't get hammered.
    if (i + 1 < fixtures.length) await new Promise((r) => setTimeout(r, args.minGapMs));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const passedFixtures = results.filter((r) => r.ok).length;
  const errored        = results.filter((r) => r.error !== null).length;
  const totalAsserts   = results.reduce((s, r) => s + r.totalAssertions, 0);
  const passAsserts    = results.reduce((s, r) => s + r.passedAssertions, 0);

  console.log("");
  console.log(`[flashcard-smoke] done — ${passedFixtures}/${fixtures.length} fixtures fully passed, ${errored} errored`);
  console.log(`[flashcard-smoke] assertions: ${passAsserts}/${totalAsserts} (${Math.round((100 * passAsserts) / Math.max(1, totalAsserts))}%)`);

  // ── Persist ────────────────────────────────────────────────────────────────
  const ts        = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir    = path.resolve(__dirname, "results");
  await mkdir(outDir, { recursive: true });
  const jsonPath  = path.join(outDir, `flashcard-eval-${ts}.json`);
  const mdPath    = path.join(outDir, `flashcard-eval-${ts}.md`);

  await writeFile(
    jsonPath,
    JSON.stringify({ at: new Date().toISOString(), fixtures: fixtures.length, results }, null, 2),
  );
  await writeFile(mdPath, renderMarkdown(results));

  console.log(`[flashcard-smoke] JSON  : ${jsonPath}`);
  console.log(`[flashcard-smoke] Report: ${mdPath}`);
}

// ── Markdown rendering ───────────────────────────────────────────────────────

function renderMarkdown(results: FixtureResult[]): string {
  const lines: string[] = [];
  lines.push("# Flashcard smoke evaluation");
  lines.push("");
  lines.push(`Run at: \`${new Date().toISOString()}\``);
  lines.push("");
  const passed   = results.filter((r) => r.ok).length;
  const errored  = results.filter((r) => r.error !== null).length;
  const aOk      = results.reduce((s, r) => s + r.passedAssertions, 0);
  const aTotal   = results.reduce((s, r) => s + r.totalAssertions,  0);
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---:|`);
  lines.push(`| Fixtures | ${results.length} |`);
  lines.push(`| Fully passed | ${passed} |`);
  lines.push(`| Errored | ${errored} |`);
  lines.push(`| Assertions passed | ${aOk} / ${aTotal} (${Math.round((100 * aOk) / Math.max(1, aTotal))}%) |`);
  lines.push("");
  lines.push("## Per-fixture results");
  for (const r of results) {
    lines.push("");
    lines.push(`### \`${r.id}\` — ${r.category}`);
    lines.push("");
    lines.push(`- **Result:** ${r.ok ? "✓ pass" : "✗ fail"}`);
    lines.push(`- **Latency:** ${r.latencyMs} ms`);
    lines.push(`- **Cards:** ${r.cards.length}`);
    lines.push(`- **Assertions:** ${r.passedAssertions} / ${r.totalAssertions}`);
    if (r.error) {
      lines.push(`- **Error:** \`${r.error}\``);
    }
    if (r.assertions.some((a) => !a.ok)) {
      lines.push("");
      lines.push("Failed assertions:");
      for (const a of r.assertions) {
        if (!a.ok) lines.push(`  - ✗ ${a.name}${a.detail ? ` — ${a.detail}` : ""}`);
      }
    }
    if (r.cards.length > 0) {
      lines.push("");
      lines.push("Cards:");
      for (const [i, c] of r.cards.entries()) {
        lines.push("");
        lines.push(`  **[${i + 1}] \`${c.type}\` — ${c.title}**`);
        lines.push(`  - Concept: ${c.concept}`);
        lines.push(`  - Body: ${c.body.replace(/\n/g, " ").slice(0, 300)}${c.body.length > 300 ? "…" : ""}`);
        lines.push(`  - Root cause: ${c.rootCause}`);
        if (c.codeSnippet?.bad)  lines.push(`  - Snippet (bad):\n\`\`\`\n${c.codeSnippet.bad.slice(0, 300)}\n\`\`\``);
        if (c.codeSnippet?.good) lines.push(`  - Snippet (good):\n\`\`\`\n${c.codeSnippet.good.slice(0, 300)}\n\`\`\``);
      }
    }
  }
  return lines.join("\n") + "\n";
}

main().catch((err) => {
  console.error("[flashcard-smoke] fatal:", err);
  process.exit(1);
});
