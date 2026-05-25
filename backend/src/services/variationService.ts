/**
 * AI-powered problem variation generator.
 * Calls Ollama to produce a harder / easier / similar variant of an existing problem.
 *
 * When a reference solution is provided, codeAnalyzer.ts performs a lightweight
 * structural scan (loops, recursion, data structures, algorithm patterns, Big-O)
 * and appends a plain-English narrative to the prompt so the model understands
 * the *algorithmic intent* of the original — not just its surface description.
 */

import { analyzeCode } from "./codeAnalyzer";
import { createDockerSession } from "./dockerRunner";

export type VariationType = "harder" | "easier" | "similar";

export type VariationInput = {
  title: string;
  description: string;
  difficulty: string | null;
  language: string;
  starterCode: string | null;
  referenceSolution?: string | null;
};

export type GeneratedVariation = {
  title: string;
  description: string;
  difficulty: string;
  language: string;
  starterCode: string;
};

export type VariationResult =
  | {
      success:      true;
      variation:    GeneratedVariation;
      model:        string;
      verification: ExampleVerificationReport;
    }
  | { success: false; error: string };

// ── Ollama helpers (mirrors mentor.ts) ───────────────────────────────────────

function getOllamaGenerateUrl(): string {
  const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  return `${base}/api/generate`;
}

function getModelName(): string {
  return process.env.OLLAMA_MODEL ?? "ai-mentor";
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function difficultyTarget(type: VariationType, current: string | null): string {
  const d = (current ?? "medium").toLowerCase();
  if (type === "harder") {
    if (d.includes("easy"))   return "Medium";
    if (d.includes("medium")) return "Hard";
    return "Hard";
  }
  if (type === "easier") {
    if (d.includes("hard"))   return "Medium";
    if (d.includes("medium")) return "Easy";
    return "Easy";
  }
  return current ?? "Medium"; // similar keeps same difficulty
}

// Prevent context overflow when problems have very long descriptions or starter code.
const MAX_DESCRIPTION_CHARS = 3_000;
const MAX_STARTER_CHARS     = 2_000;

function truncateForPrompt(text: string | null | undefined, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n…[truncated — ${text.length - max} chars omitted]`;
}

function buildVariationPrompt(input: VariationInput, type: VariationType): string {
  const targetDifficulty = difficultyTarget(type, input.difficulty);

  // ── Structural analysis block (only when a reference solution is available) ──
  let structuralContext = "";
  if (input.referenceSolution && input.referenceSolution.trim().length > 10) {
    try {
      const analysis = analyzeCode(input.referenceSolution, input.language);

      const loopParts: string[] = [];
      if (analysis.loops.forCount > 0)   loopParts.push(`${analysis.loops.forCount} for-loop(s)`);
      if (analysis.loops.whileCount > 0) loopParts.push(`${analysis.loops.whileCount} while-loop(s)`);
      if (analysis.loops.doWhile)        loopParts.push("a do-while loop");
      const loopSummary = loopParts.length > 0
        ? loopParts.join(", ") + (analysis.loops.maxNesting >= 2 ? ` (nested ${analysis.loops.maxNesting} levels)` : "")
        : "no loops";

      const lines: string[] = [
        "",
        "REFERENCE SOLUTION ANALYSIS (structural, not the code itself)",
        "=============================================================",
        `Loops          : ${loopSummary}`,
        `Recursion      : ${analysis.recursion ? "yes" : "no"}`,
      ];

      if (analysis.dataStructures.length > 0) {
        lines.push(`Data structures: ${analysis.dataStructures.join(", ")}`);
      }
      if (analysis.algorithmHints.length > 0) {
        lines.push(`Algorithm      : ${analysis.algorithmHints.join(", ")}`);
      }
      lines.push(`Complexity     : ${analysis.complexity}`);
      lines.push(`Summary        : ${analysis.narrative}`);
      lines.push("");
      lines.push(
        "Use this structural profile when deciding what to change for the variation.\n" +
        "For 'harder': the variation must require a genuinely more complex algorithm.\n" +
        "For 'easier': the variation must be solvable with fewer/simpler structures.\n" +
        "For 'similar': preserve the same algorithmic shape but change the scenario.",
      );

      structuralContext = lines.join("\n");
    } catch {
      // If analysis fails for any reason, silently omit the block
    }
  }

  const typeInstructions: Record<VariationType, string> = {
    harder: `Create a HARDER version of this problem at difficulty "${targetDifficulty}".

STRICT RULES:
- DO NOT simply use bigger numbers or longer strings — that is NOT harder.
- The harder version MUST require a different or more complex algorithm.
- Good strategies: require an additional data structure (stack, map, set), add a constraint that breaks the naive solution (e.g. must run in O(n)), combine two concepts (e.g. sorting + searching, string parsing + arithmetic), introduce meaningful edge cases (negative numbers, empty input, duplicates).
- The student must think differently to solve it, not just write the same code with minor changes.
- Keep language: ${input.language}`,

    easier: `Create an EASIER version of this problem at difficulty "${targetDifficulty}".

STRICT RULES:
- Remove the most complex requirement, replacing it with a simpler one.
- The solution should require only a basic loop or conditional — no advanced data structures.
- Include at least one clear worked example: Input → Output.
- Be precise and unambiguous in the problem statement.
- Keep language: ${input.language}`,

    similar: `Create a SIMILAR problem on the same topic at difficulty "${targetDifficulty}".

STRICT RULES:
- Use the exact same core algorithmic concept as the original.
- Change the real-world context entirely (different domain, scenario, variable names).
- A student who solved the original should still find this a fresh, distinct challenge.
- Include at least one clear worked example: Input → Output.
- Keep language: ${input.language}`,
  };

  const safeDescription = truncateForPrompt(input.description, MAX_DESCRIPTION_CHARS);
  const safeStarterCode = truncateForPrompt(input.starterCode, MAX_STARTER_CHARS);

  return `You are an expert computer-science educator creating university-level programming exercises.
You MUST respond in English only.

ORIGINAL PROBLEM
================
Title: ${input.title}
Difficulty: ${input.difficulty ?? "Medium"}
Language: ${input.language}
Description:
${safeDescription}
${safeStarterCode ? `\nStarter Code:\n${safeStarterCode}` : ""}
${structuralContext}
YOUR TASK
=========
${typeInstructions[type]}

ABSOLUTE RULES — failure on any of these makes the variation unusable:

1. STARTER CODE MUST BE A SKELETON, NEVER A SOLUTION.
   - The "starterCode" field MUST contain ONLY scaffolding: includes/imports, function signatures, an entry point, and a comment marker like "// Your code here" or "# Your code here".
   - DO NOT include the loop that solves the problem.
   - DO NOT include output statements (printf / print / System.out.println / cout) that produce the answer.
   - DO NOT include the algorithm that computes the result.
   - A student must be unable to submit your starter code as-is and pass any non-trivial test.
   - Example of GOOD starter for C:
       #include <stdio.h>
       int main() {
           // Your code here
           return 0;
       }
   - Example of BAD starter (this is a SOLUTION, not a skeleton):
       int main() {
           char line[1024];
           fgets(line, sizeof(line), stdin);
           int count = 0;
           for (int i = 0; line[i]; i++) if (line[i] == ' ') count++;
           printf("%d\\n", count + 1);
           return 0;
       }

2. EVERY EXAMPLE'S EXPECTED OUTPUT MUST BE ARITHMETICALLY CORRECT.
   Before you finalize each Input/Output example in the description, do this mental check:
   • Trace through the input STEP BY STEP using your problem's own rules.
   • Compute every number (count, sum, average, length, min, max, frequency) by hand.
   • Verify the output matches your calculation EXACTLY (including decimal places).
   • If the math doesn't match, REWRITE the example with corrected numbers.
   Common failures to avoid:
   • Averages that don't divide correctly (e.g. claiming average = 4.00 when sum/count = 3.67).
   • Counts that don't match the input (claiming "2 sentences" when input has 1 by your rules).
   • Frequency lists not actually sorted alphabetically when the spec says alphabetical.
   • Floats with the wrong number of decimal places.

3. EVERY EXAMPLE MUST BE CONSISTENT WITH YOUR PROBLEM'S OWN DEFINITION.
   If your problem says "a sentence is a sequence ending with a period", every example MUST split sentences at periods. Do not let examples follow a different rule than the one you defined.

4. DO NOT INCLUDE A REFERENCE SOLUTION ANYWHERE.
   The description must define the problem (what to compute). It must NEVER include the code that solves it. Algorithmic hints in plain English are acceptable; pseudocode and source code are not.

5. KEEP LANGUAGE: ${input.language}

RESPONSE FORMAT
===============
Respond with ONLY a valid JSON object — no markdown, no explanation, no code fences.
The JSON must have exactly these fields:
{
  "title": "<string — new problem title>",
  "description": "<string — full problem statement with 1–3 Input/Output examples in the format shown below>",
  "difficulty": "${targetDifficulty}",
  "language": "${input.language}",
  "starterCode": "<string — SKELETON only, never a working solution; see Rule 1>",
  "referenceSolution": "<string — a COMPLETE working ${input.language} program that correctly solves your problem; this code WILL be executed against every example's Input to verify your claimed Output>"
}

EXAMPLE FORMAT INSIDE THE DESCRIPTION
=====================================
Each example MUST follow this exact shape so the verifier can parse it:

EXAMPLES

Input:
<exact stdin the program should receive — preserve whitespace, no leading "$ " or commentary>

Output:
<exact stdout the program should produce — preserve whitespace and newlines>

Input:
<...>

Output:
<...>

Do NOT use bullet points, table layouts, or "expected:" prefixes — only the literal labels "Input:" and "Output:" on their own lines, each followed by the raw content.

CRITICAL: your referenceSolution code WILL be compiled and run against each example's Input. If its stdout does not match your claimed Output (whitespace-trimmed per line), that example will be REMOVED from the description before the teacher sees it. Get the reference right.`.trim();
}

// ── Starter-code sanitization ─────────────────────────────────────────────────
//
// The model sometimes drops the entire working solution into the `starterCode`
// field instead of producing a skeleton. A student would then just submit the
// pre-filled "starter" and get full marks. We can't ask the model to "promise"
// — we have to structurally detect a solution-shaped starter and strip it.
//
// Heuristic for "looks like a solution":
//   • Contains an output statement (printf / print / System.out.println /
//     cout / fmt.Println / console.log) — solutions almost always print.
//   • OR contains more than 6 statement-ending lines past the function signature
//     — skeletons are usually ≤ 2 statements plus a marker comment.
// If detected, replace the body with a "// Your code here" marker while
// keeping the function signature + includes / boilerplate intact.

const OUTPUT_STATEMENT_PATTERNS: Record<string, RegExp> = {
  c:          /\b(printf|puts|fprintf|putchar)\s*\(/,
  cpp:        /\b(printf|cout\s*<<|puts)\b/,
  java:       /\bSystem\s*\.\s*out\s*\.\s*(println|print|printf)\s*\(/,
  python:     /\bprint\s*\(/,
  javascript: /\bconsole\s*\.\s*log\s*\(/,
  go:         /\bfmt\s*\.\s*(Print|Println|Printf)\b/,
};

function languageKey(language: string): string {
  const l = (language || "").toLowerCase();
  if (l.startsWith("c++") || l === "cpp") return "cpp";
  if (l.startsWith("c"))                  return "c";
  if (l.startsWith("java"))               return "java";
  if (l.startsWith("py"))                 return "python";
  if (l.startsWith("js") || l.includes("javascript")) return "javascript";
  if (l.startsWith("go"))                 return "go";
  return l;
}

/**
 * Detect whether `starterCode` looks like a complete working solution rather
 * than a skeleton, and if so, strip the function body and substitute a
 * "// Your code here" marker. Always returns SOMETHING the student can edit.
 *
 * Returns `{ sanitized, wasLeak }` so the caller can log when a leak was
 * caught (useful for the demo audit story).
 */
function sanitizeStarterCode(
  starterCode: string,
  language: string,
): { sanitized: string; wasLeak: boolean } {
  if (!starterCode || !starterCode.trim()) {
    return { sanitized: "", wasLeak: false };
  }

  const key = languageKey(language);
  const outputPattern = OUTPUT_STATEMENT_PATTERNS[key];

  // Allow output statements only if they're trivial placeholders like
  // `printf("%d\n", 0);` inside a `// TODO` block — but that's rare and not
  // worth special-casing. Any output statement triggers the leak heuristic.
  const hasOutput = outputPattern ? outputPattern.test(starterCode) : false;

  // Count "real" code lines (skip blanks, single-line comments, braces).
  const codeLines = starterCode
    .split("\n")
    .map((l) => l.trim())
    .filter((l) =>
      l.length > 0 &&
      !l.startsWith("//") &&
      !l.startsWith("#") && // C preprocessor + Python comments
      !l.startsWith("/*") &&
      !l.startsWith("*")  &&
      l !== "{" && l !== "}",
    );

  const looksLikeSolution = hasOutput || codeLines.length > 8;
  if (!looksLikeSolution) {
    return { sanitized: starterCode, wasLeak: false };
  }

  // Build a minimal skeleton per language. We keep includes / imports / the
  // entry-point signature so the student still has scaffolding to work in.
  const skeleton = buildSkeletonForLanguage(key, starterCode);
  return { sanitized: skeleton, wasLeak: true };
}

function buildSkeletonForLanguage(key: string, original: string): string {
  // Preserve include / import lines from the original — they're useful and
  // not a leak (just signals what library to use).
  const headerLines = original
    .split("\n")
    .filter((l) => /^(#include|import |using |from |package )/.test(l.trim()))
    .join("\n");
  const header = headerLines ? headerLines + "\n\n" : "";

  switch (key) {
    case "c":
      return `${header || "#include <stdio.h>\n\n"}int main() {\n    // Your code here\n    return 0;\n}\n`;
    case "cpp":
      return `${header || "#include <iostream>\nusing namespace std;\n\n"}int main() {\n    // Your code here\n    return 0;\n}\n`;
    case "java":
      return `${header || "import java.util.Scanner;\n\n"}public class Main {\n    public static void main(String[] args) {\n        // Your code here\n    }\n}\n`;
    case "python":
      return `${header}def solve():\n    # Your code here\n    pass\n\nif __name__ == "__main__":\n    solve()\n`;
    case "javascript":
      return `${header}function solve() {\n    // Your code here\n}\n\nsolve();\n`;
    case "go":
      return `${header || "package main\n\nimport \"fmt\"\n\n"}func main() {\n    // Your code here\n    _ = fmt.Println\n}\n`;
    default:
      // Unknown language — return an empty marker rather than the leaked solution.
      return "// Your code here\n";
  }
}

// ── Description sanitization ──────────────────────────────────────────────────
//
// The prompt feeds the model a "REFERENCE SOLUTION ANALYSIS" block (loops,
// recursion, data structures, complexity) so it can decide what to change.
// That block is for the model's internal use — it must NEVER be copied into
// the variation's description, where students would see it. We've observed
// the model echo the entire block verbatim. Detect and strip.

const STRUCTURAL_LEAK_MARKERS = [
  /REFERENCE\s+SOLUTION\s+ANALYSIS/i,
  /^\s*Loops\s*:\s*/im,
  /^\s*Recursion\s*:\s*/im,
  /^\s*Data\s+[Ss]tructures?\s*:\s*/im,
  /^\s*Complexity\s*:\s*/im,
  /^\s*Algorithm\s*:\s*[A-Z][^\n]{0,80}\bcomplex/im,
];

const MAX_TITLE_CHARS       = 200;
const MAX_DESCRIPTION_OUTPUT = 10_000;

function sanitizeDescription(description: string): { sanitized: string; structuralLeak: boolean } {
  let leak = false;

  // If any marker appears, strip from the first marker onward — easier than
  // surgically removing the block, and any "trailing analysis dump" was never
  // supposed to be student-facing anyway.
  for (const pattern of STRUCTURAL_LEAK_MARKERS) {
    const match = description.match(pattern);
    if (match && match.index !== undefined) {
      // Cut at the start of the matched line, including any leading whitespace
      // on that line. Find the line start by scanning backward.
      let cut = match.index;
      while (cut > 0 && description[cut - 1] !== "\n") cut--;
      description = description.slice(0, cut).trimEnd();
      leak = true;
      break;
    }
  }

  // Final length cap — even legitimate descriptions shouldn't exceed this.
  if (description.length > MAX_DESCRIPTION_OUTPUT) {
    description = description.slice(0, MAX_DESCRIPTION_OUTPUT).trimEnd() + "\n[…truncated]";
  }
  return { sanitized: description, structuralLeak: leak };
}

function normalizeDifficulty(raw: string, fallback: string): string {
  const t = (raw || "").trim().toLowerCase();
  if (t.startsWith("easy")) return "Easy";
  if (t.startsWith("med"))  return "Medium";
  if (t.startsWith("hard")) return "Hard";
  return fallback;
}

// ── Example parsing + runtime verification ───────────────────────────────────
//
// The AI is reliable at writing working code but unreliable at hand-computing
// arithmetic for examples (averages, word counts, sorting). To fix the
// "Average: 5.33 when 3 × 5 = 15 / 3 = 5.00" class of bug, we:
//   1. Ask the AI for a `referenceSolution` alongside the variation
//   2. Parse Input/Output blocks from the description
//   3. Compile + run the reference once, pipe each example's Input as stdin
//   4. Compare actual stdout to the AI's claimed Output (whitespace-tolerant)
//   5. Strip any example whose claimed Output does NOT match runtime ground truth
//
// If the reference itself fails to compile, we skip verification (better to
// ship an unverified variation than to lose it entirely — teacher review is
// the next layer of defense). If SOME examples fail and SOME pass, we strip
// only the failures.

type ParsedExample = {
  input:          string;
  expectedOutput: string;
  /** Position of "Input:" in the original description — used for surgical removal */
  startOffset:    number;
  /** Position just past the example's last line */
  endOffset:      number;
};

/**
 * Parse `Input:\n…\n\nOutput:\n…` example blocks out of a description.
 * Tolerant of variation in spacing; strict about the literal labels "Input:"
 * and "Output:" being at the start of their own lines.
 */
function parseExamplesFromDescription(description: string): ParsedExample[] {
  const examples: ParsedExample[] = [];
  // Find every "Input:" anchored at line-start (allow leading whitespace).
  const inputRegex = /(^|\n)[ \t]*Input:[ \t]*\n/g;
  const matches: Array<{ start: number; bodyStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = inputRegex.exec(description)) !== null) {
    matches.push({
      start:     m.index + (m[1] === "\n" ? 1 : 0),
      bodyStart: m.index + m[0].length,
    });
  }
  if (matches.length === 0) return [];

  for (let i = 0; i < matches.length; i++) {
    const { start, bodyStart } = matches[i];
    // The end of this example is either the next Input: or end of string.
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : description.length;
    const chunk     = description.slice(bodyStart, nextStart);

    // Inside the chunk, find "Output:" at line-start.
    const outputMatch = chunk.match(/(^|\n)[ \t]*Output:[ \t]*\n/);
    if (!outputMatch || outputMatch.index === undefined) continue;

    const inputEnd        = outputMatch.index + (outputMatch[1] === "\n" ? 1 : 0);
    const outputBodyStart = outputMatch.index + outputMatch[0].length;

    const inputText    = chunk.slice(0, inputEnd).replace(/\s+$/, "");
    const outputText   = chunk.slice(outputBodyStart).replace(/\s+$/, "");

    examples.push({
      input:          inputText,
      expectedOutput: outputText,
      startOffset:    start,
      endOffset:      bodyStart + chunk.length,
    });
  }
  return examples;
}

/**
 * Whitespace-tolerant comparison: trim each line, drop empty trailing lines,
 * compare line-by-line. Matches what teachers actually expect ("output is the
 * same modulo trailing whitespace").
 */
function outputsMatch(claimed: string, actual: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.replace(/[ \t]+$/, ""))
      .join("\n")
      .replace(/\n+$/, "");
  return norm(claimed) === norm(actual);
}

export type ExampleVerificationReport = {
  /** Total examples parsed from the description */
  total:            number;
  /** Examples whose actual output matched the AI's claim */
  verified:         number;
  /** Examples removed because actual output did not match */
  stripped:         number;
  /** True if verification was skipped (no reference, compile error, or disabled) */
  skipped:          boolean;
  /** Human-readable reason if skipped */
  skipReason?:      string;
  /** Per-example details (parallel to `examples` order) */
  details:          Array<{ ok: boolean; reason: string }>;
};

/**
 * Run the AI's reference solution against each parsed example. Returns the
 * subset that passed, plus a report for logging / teacher notes.
 *
 * Verification is opt-in via env var so it can be disabled if Docker is slow
 * or unavailable on a teacher's local dev instance.
 */
async function verifyExamples(
  referenceSolution: string,
  language:          string,
  examples:          ParsedExample[],
): Promise<{ keep: ParsedExample[]; report: ExampleVerificationReport }> {
  const report: ExampleVerificationReport = {
    total:    examples.length,
    verified: 0,
    stripped: 0,
    skipped:  false,
    details:  [],
  };

  if (process.env.SKIP_VARIATION_VERIFICATION === "true") {
    return { keep: examples, report: { ...report, skipped: true, skipReason: "disabled via env" } };
  }
  if (!referenceSolution || referenceSolution.trim().length < 10) {
    return { keep: examples, report: { ...report, skipped: true, skipReason: "no reference solution" } };
  }
  if (examples.length === 0) {
    return { keep: examples, report };
  }

  let session;
  try {
    session = await createDockerSession(referenceSolution, language);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { keep: examples, report: { ...report, skipped: true, skipReason: `session create failed: ${reason}` } };
  }

  try {
    // First run probes whether the reference even compiles successfully.
    // If the first example returns compile_error, abort verification — we
    // can't trust the reference, so we keep all examples unverified.
    const keep: ParsedExample[] = [];
    for (const ex of examples) {
      const result = await session.run(ex.input, 8_000);
      if (result.statusId === 6) {
        // Compile error — reference is broken. Skip the whole verification.
        return {
          keep:   examples,
          report: { ...report, skipped: true, skipReason: "reference solution did not compile" },
        };
      }
      if (result.statusId === 5) {
        // Time-out — treat as verification failure for THIS example only.
        report.details.push({ ok: false, reason: "timeout" });
        report.stripped++;
        continue;
      }
      if (result.statusId === 11) {
        report.details.push({ ok: false, reason: `runtime error: ${result.stderr.slice(0, 200)}` });
        report.stripped++;
        continue;
      }
      const matched = outputsMatch(ex.expectedOutput, result.stdout);
      if (matched) {
        keep.push(ex);
        report.verified++;
        report.details.push({ ok: true, reason: "matched" });
      } else {
        report.stripped++;
        report.details.push({
          ok:     false,
          reason: `output mismatch — claimed "${ex.expectedOutput.slice(0, 60).replace(/\n/g, "⏎")}", actual "${result.stdout.trim().slice(0, 60).replace(/\n/g, "⏎")}"`,
        });
      }
    }
    return { keep, report };
  } finally {
    session.cleanup();
  }
}

/**
 * Given the original description and the surviving (verified) examples,
 * produce a new description with the unverified examples surgically removed.
 *
 * Strategy: find the EXAMPLES section (or the first "Input:"), keep
 * everything before it as the spec, then append only verified examples in
 * their original order. If everything failed verification, append a teacher
 * note explaining no examples could be verified.
 */
function rewriteDescriptionWithVerifiedExamples(
  originalDescription: string,
  allParsed:           ParsedExample[],
  verified:            ParsedExample[],
  report:              ExampleVerificationReport,
): string {
  if (allParsed.length === 0) return originalDescription;
  // Did anything change?
  if (!report.skipped && verified.length === allParsed.length) {
    return originalDescription;
  }

  // Find the cut point: prefer "EXAMPLES" header (the line), else the first Input:.
  let cutAt = -1;
  const examplesHeader = originalDescription.match(/^[ \t]*EXAMPLES[ \t]*$/m);
  if (examplesHeader && examplesHeader.index !== undefined) {
    cutAt = examplesHeader.index;
  } else {
    cutAt = allParsed[0].startOffset;
  }

  const specPart = originalDescription.slice(0, cutAt).replace(/\s+$/, "");
  const lines: string[] = [specPart, "", "EXAMPLES", ""];

  for (const ex of verified) {
    lines.push("Input:");
    lines.push(ex.input);
    lines.push("");
    lines.push("Output:");
    lines.push(ex.expectedOutput);
    lines.push("");
  }

  if (verified.length === 0) {
    lines.push(
      "_Note: the AI could not produce verified examples for this variation. " +
      "Please add tested examples before assigning to students._",
    );
  } else if (report.stripped > 0) {
    lines.push(
      `_Note: ${report.stripped} unverified example(s) were removed because the reference solution's actual output did not match the AI's claimed output._`,
    );
  }

  return lines.join("\n").trim() + "\n";
}

// ── JSON extractor ────────────────────────────────────────────────────────────

function extractJson(
  raw: string,
  inputLanguage: string,
  targetDifficulty: string,
): {
  variation:                GeneratedVariation;
  referenceSolution:        string;
  starterLeakDetected:      boolean;
  descriptionLeakDetected:  boolean;
} | null {
  // Strip markdown code fences if the model wraps the JSON
  const stripped = raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();

  // Find the first { ... } block
  const start = stripped.indexOf("{");
  const end   = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    const obj = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;

    let title       = typeof obj.title       === "string" ? obj.title.trim()       : "";
    let description = typeof obj.description === "string" ? obj.description.trim() : "";
    const rawDifficulty   = typeof obj.difficulty         === "string" ? obj.difficulty         : "";
    const rawStarter      = typeof obj.starterCode        === "string" ? obj.starterCode        : "";
    const referenceSolution = typeof obj.referenceSolution === "string" ? obj.referenceSolution : "";

    if (!title || !description) return null;

    // Cap title length defensively — a runaway model could emit thousands of
    // characters; teachers expect a short title.
    if (title.length > MAX_TITLE_CHARS) {
      title = title.slice(0, MAX_TITLE_CHARS).trimEnd();
    }

    // Strip any "REFERENCE SOLUTION ANALYSIS" block the model may have copied
    // from the prompt into the student-visible description.
    const descCheck = sanitizeDescription(description);
    description = descCheck.sanitized;

    // Always trust the input language, NOT the model's claim. We've observed
    // the model return `"language": "Python"` when generating a C variation,
    // which would cause Judge0 to compile C source as Python.
    const language = inputLanguage;

    // Normalize difficulty casing — model sometimes returns "easy" / "hard".
    const difficulty = normalizeDifficulty(rawDifficulty, targetDifficulty);

    // Sanitize starter code: if the model emitted a full working solution,
    // strip the body and replace with a "// Your code here" skeleton.
    const { sanitized, wasLeak } = sanitizeStarterCode(rawStarter, language);

    return {
      variation: { title, description, difficulty, language, starterCode: sanitized },
      referenceSolution,
      starterLeakDetected:    wasLeak,
      descriptionLeakDetected: descCheck.structuralLeak,
    };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateVariation(
  input: VariationInput,
  type: VariationType,
): Promise<VariationResult> {
  const url   = getOllamaGenerateUrl();
  const model = getModelName();
  const prompt = buildVariationPrompt(input, type);

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 240_000);

  try {
    console.log(`[variation] type=${type} model=${model} problem="${input.title}"`);

    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        keep_alive: -1,
        options: {
          // Lowered from 0.75 → 0.4. Diversity matters less than arithmetic
          // accuracy in generated examples: an "exciting but wrong" variation
          // is unusable, a "slightly less novel but correct" variation is fine.
          // The structural variation comes from the harder/easier/similar
          // instructions, not from sampling noise.
          temperature: 0.4,
          top_p: 0.9,
          num_ctx: 8192,
        },
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

    const parsed = extractJson(raw, input.language, difficultyTarget(type, input.difficulty));
    if (!parsed) {
      throw new Error(`Could not parse JSON from model output: ${raw.slice(0, 300)}`);
    }
    if (parsed.starterLeakDetected) {
      console.warn(
        `[variation] starter-code leak detected on "${input.title}" (${type}) — replaced with skeleton`,
      );
    }
    if (parsed.descriptionLeakDetected) {
      console.warn(
        `[variation] structural-analysis leak detected in description on "${input.title}" (${type}) — stripped`,
      );
    }

    // ── Runtime example verification ──
    // Compile the AI's reference solution and run it against each example's
    // Input. Strip any example whose actual stdout doesn't match the AI's
    // claimed Output. This catches the arithmetic-in-test-data bug class
    // (e.g. "Average: 5.33 when 15 / 3 = 5.00") that prompting alone can't.
    const parsedExamples = parseExamplesFromDescription(parsed.variation.description);
    const { keep: verifiedExamples, report } = await verifyExamples(
      parsed.referenceSolution,
      parsed.variation.language,
      parsedExamples,
    );

    const finalDescription = rewriteDescriptionWithVerifiedExamples(
      parsed.variation.description,
      parsedExamples,
      verifiedExamples,
      report,
    );

    // Build the variation we actually return, with the verified description.
    const finalVariation: GeneratedVariation = {
      ...parsed.variation,
      description: finalDescription,
    };

    // Log a compact summary so the demo / report can show how often
    // verification catches problems.
    if (report.skipped) {
      console.warn(
        `[variation] example verification SKIPPED on "${input.title}" (${type}): ${report.skipReason}`,
      );
    } else {
      console.log(
        `[variation] examples verified on "${input.title}" (${type}): ${report.verified}/${report.total} matched, ${report.stripped} stripped`,
      );
      if (report.stripped > 0) {
        for (const d of report.details) {
          if (!d.ok) console.log(`  - rejected example: ${d.reason}`);
        }
      }
    }

    return { success: true, variation: finalVariation, model, verification: report };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const message = raw.toLowerCase().includes("abort")
      ? "AI is busy — please try again in a moment."
      : raw;
    console.error("[variation] error:", message);
    return { success: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
