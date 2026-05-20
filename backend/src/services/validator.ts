import { detectMentorIntent, toValidatorQuestionMode } from "./mentorIntent";

export type ValidatorDecision = "allow" | "rewrite" | "block";

export type ValidatorResult = {
  riskScore: number;
  decision: ValidatorDecision;
  violations: string[];
  reason: string;
  source: "ai" | "heuristic";
};

export type ValidateInput = {
  studentQuestion: string;
  mentorReply: string;
  runStatus?: string;
};

function getOllamaGenerateUrl(): string {
  const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  return `${base}/api/generate`;
}

function getValidatorModelName(): string {
  return process.env.OLLAMA_VALIDATOR_MODEL ?? process.env.OLLAMA_MODEL ?? "gemma4:26b";
}

function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim();
}

function countSentences(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function detectQuestionMode(message: string): "casual" | "meta" | "solution" | "runtime" | "code_help" {
  return toValidatorQuestionMode(detectMentorIntent(message));
}

const CODE_LINE_PATTERNS = [
  // Python / generic
  /^\s*def\s+/,
  /^\s*class\s+/,
  /^\s*function\s+/,
  /^\s*const\s+/,
  /^\s*let\s+/,
  /^\s*var\s+/,
  /^\s*if\s*\(/,
  /^\s*if\s+/,
  /^\s*elif\s+/,
  /^\s*else\s*:/,
  /^\s*for\s*\(/,
  /^\s*for\s+/,
  /^\s*while\s*\(/,
  /^\s*while\s+/,
  /^\s*return\b/,
  /^\s*print\(/,
  /^\s*input\(/,
  /^\s*console\.log\(/,
  /^\s*\w+\s*=\s*.+$/,
  // C / C++ patterns
  /^\s*#include\b/,
  /^\s*using\s+namespace\b/,
  /^\s*using\s+std::/,
  /^\s*(?:int|float|double|char|bool|void|long|short|unsigned|signed|size_t|auto)\s+\w+/,
  /^\s*(?:int|float|double|char|bool|void|long|auto)\s*\**\s*\w+\s*\(/,
  /^\s*std::/,
  /^\s*cin\s*>>/,
  /^\s*cout\s*<</,
  /^\s*scanf\s*\(/,
  /^\s*printf\s*\(/,
  /^\s*vector\s*</,
  /^\s*array\s*</,
  /^\s*map\s*</,
  /^\s*set\s*</,
  // Java patterns
  /^\s*(?:public|private|protected|static|final)\b/,
  /^\s*System\.out\./,
  /^\s*Scanner\s+\w+/,
  /^\s*new\s+\w+/,
  // C# patterns
  /^\s*Console\.(?:Write|Read)/,
  /^\s*namespace\s+\w+/,
  /^\s*using\s+System/,
  // JavaScript / TypeScript additions
  /^\s*(?:export|import)\b/,
  /^\s*async\s+function/,
  // Generic statements
  /^\s*\w+\s*\+\+\s*;?$/,
  /^\s*\w+\s*\[\s*\w+\s*\]/,
];

function countCodeLikeLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => CODE_LINE_PATTERNS.some((pattern) => pattern.test(line))).length;
}

function containsFullSolutionLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  return [
    "complete solution",
    "full solution",
    "full code",
    "copy and paste",
    "submit this",
    "use this exact code",
    "here is the corrected version",
    "here's the corrected version",
    "your code should look like",
    "final code",
    "tam çözüm",
    "tüm kod",
    "bütün kod",
    "kopyalayıp yapıştır",
    "kopyala yapıştır",
    "final kod",
    "düzeltilmiş hali",
  ].some((p) => lower.includes(p));
}

function containsAssignmentWalkthrough(text: string): boolean {
  const lower = text.toLowerCase();
  const hits = [
    "read input",
    "split",
    "convert",
    "calculate",
    "print",
  ].filter((p) => lower.includes(p)).length;

  return hits >= 4;
}

// Catch numbered solution walkthroughs ("Step 1:... Step 2:..." or
// "1. Initialize... 2. Fill..."). A mentor never structures answers this way.
function containsStepWalkthrough(text: string): boolean {
  const stepN = text.match(/(?:^|\n)\s*(?:step\s*)?\d+\s*[.:)]\s+/gi) ?? [];
  if (stepN.length >= 3) return true;
  const stepHeader = text.match(/\bstep\s*\d+\s*[:.]\s*/gi) ?? [];
  return stepHeader.length >= 2;
}

// Catch self-contradicting refusals like
//   "I can't give the full solution. Let's continue with [code]"
//   "I won't write the code. However, here is..."
// The mentor saying NO and then providing the answer anyway.
function containsSelfContradictingRefusal(text: string): boolean {
  const refuse = /\b(?:i\s*(?:can'?t|cannot|won'?t)|i'?m\s+sorry|can'?t\s+(?:provide|give|write))\b[^.!?\n]{0,80}\b(?:solution|full\s+code|final\s+code|answer)\b/i;
  if (!refuse.test(text)) return false;

  // After the refusal sentence, look for a "but here is..." style continuation
  // OR a code block in the same reply.
  const continuation =
    /\b(?:but\s+here|however\b|let'?s\s+continue|here'?s\s+how|here\s+is\s+how|step\s*1|let\s+me\s+show)/i;
  const hasCodeBlock = /```/.test(text);
  return continuation.test(text) || hasCodeBlock;
}

function containsExactFinalEdit(text: string): boolean {
  return [
    /replace\s+.+\s+with\s+.+/i,
    /change\s+.+\s+to\s+.+/i,
    /use\s+.+\s+instead\s+of\s+.+/i,
    /print\s*\([^)]*\+\s*[^)]*\)/i,
    /return\s+.+\+.+/i,
  ].some((pattern) => pattern.test(text));
}

function heuristicValidate(input: ValidateInput): ValidatorResult {
  const studentQuestion = normalize(input.studentQuestion);
  const mentorReply = normalize(input.mentorReply);
  const runStatus = normalize(input.runStatus).toLowerCase();

  const questionMode = detectQuestionMode(studentQuestion);
  const lowerReply = mentorReply.toLowerCase();
  const violations: string[] = [];

  const codeLikeLines = countCodeLikeLines(mentorReply);
  const lineCount = mentorReply.split(/\r?\n/).filter((l) => l.trim()).length;
  const sentenceCount = countSentences(mentorReply);

  if (containsFullSolutionLanguage(mentorReply)) {
    violations.push("explicit_solution_language");
  }

  // Mentor replies should default to ZERO code. Three or more code-like lines
  // is already a solution-shaped reply.
  if (codeLikeLines >= 3) {
    violations.push("contains_code_solution");
  }

  if (containsAssignmentWalkthrough(mentorReply) && sentenceCount >= 4) {
    violations.push("assignment_walkthrough");
  }

  if (containsStepWalkthrough(mentorReply)) {
    violations.push("step_walkthrough");
  }

  if (containsSelfContradictingRefusal(mentorReply)) {
    violations.push("self_contradicting_refusal");
  }

  if (questionMode === "casual" || questionMode === "meta") {
    if (
      lowerReply.includes("input()") ||
      lowerReply.includes("split()") ||
      lowerReply.includes("read two integers") ||
      lowerReply.includes("print their sum") ||
      lowerReply.includes("standard input")
    ) {
      violations.push("context_misuse");
    }
  }

  if (questionMode === "runtime" && runStatus === "idle") {
    if (
      lowerReply.includes("the output is") ||
      lowerReply.includes("it prints") ||
      lowerReply.includes("it pass") ||
      lowerReply.includes("it passed") ||
      lowerReply.includes("works as expected")
    ) {
      violations.push("runtime_guess");
    }
  }

  if (questionMode === "solution" && codeLikeLines >= 2) {
    violations.push("solution_seek_leak");
  }

  if (questionMode === "solution" && containsExactFinalEdit(mentorReply)) {
    violations.push("solution_seek_exact_fix");
  }

  // Mentor replies must stay short. These limits are intentionally tight —
  // a Socratic mentor's job is 1-3 sentences, not paragraphs.
  if (questionMode === "casual" || questionMode === "meta") {
    if (sentenceCount > 2 || lineCount > 4) {
      violations.push("overly_long_response");
    }
  } else if (questionMode === "code_help") {
    if (sentenceCount > 4 || lineCount > 8) {
      violations.push("overly_long_response");
    }
  } else if (questionMode === "solution") {
    // For solution-seek requests, refusal + one question = 2 sentences max.
    if (sentenceCount > 2 || lineCount > 4) {
      violations.push("overly_long_response");
    }
  }

  if (
    violations.includes("contains_code_solution") ||
    violations.includes("explicit_solution_language") ||
    violations.includes("solution_seek_leak") ||
    violations.includes("solution_seek_exact_fix") ||
    violations.includes("step_walkthrough") ||
    violations.includes("self_contradicting_refusal")
  ) {
    return {
      riskScore: 0.92,
      decision: "block",
      violations,
      reason: "Reply is too close to a direct solution.",
      source: "heuristic",
    };
  }

  if (
    violations.includes("context_misuse") ||
    violations.includes("runtime_guess") ||
    violations.includes("assignment_walkthrough") ||
    violations.includes("overly_long_response")
  ) {
    return {
      riskScore: 0.57,
      decision: "rewrite",
      violations,
      reason: "Reply should be shorter, more focused, or better aligned to the user's actual question.",
      source: "heuristic",
    };
  }

  return {
    riskScore: 0.06,
    decision: "allow",
    violations,
    reason: "Response is acceptable.",
    source: "heuristic",
  };
}

async function aiValidate(input: ValidateInput): Promise<ValidatorResult> {
  const studentQuestion = normalize(input.studentQuestion);
  const mentorReply = normalize(input.mentorReply);
  const runStatus = normalize(input.runStatus);

  const prompt = `
You are a strict validator for a coding mentor.

Return ONLY valid JSON.
Do not add markdown.
Do not add extra text.

JSON format:
{
  "risk_score": 0.0,
  "decision": "allow",
  "violations": [],
  "reason": "short explanation"
}

The validator must judge whether the mentor reply is appropriate for the student's exact question.

Student question:
${studentQuestion || "No question provided."}

Run status:
${runStatus || "Unknown"}

Mentor reply:
${mentorReply}

Decision rules:

BLOCK:
- full assignment solution
- direct final answer that solves the student's task
- copy-paste ready final code
- near-complete code even without markdown fences
- enough exact code or exact steps that the student can finish with almost no thinking

REWRITE:
- too solution-like
- too explicit about the exact final fix
- too much code for a mentor answer
- too long or wall-of-text
- answers the wrong thing
- mentions code when the student asked a casual or meta question
- guesses output or success when run status is idle
- restates the whole assignment instead of answering the immediate question

ALLOW:
- conceptual explanation
- syntax explanation
- debugging guidance
- error explanation
- brief direct answer to a basic programming question
- short and focused next-step guidance
- a tiny non-solution snippet or pseudo-code example, usually 1-3 lines, when it directly answers syntax, concept, or local debugging questions

Important:
- Be conservative.
- If unsure between allow and rewrite, choose rewrite.
- If unsure between rewrite and block for near-complete code, choose block.
- Do not block a short generic snippet just because it contains code; block only when it is copy-paste ready for the assignment or near-complete.
- Do not be lenient just because the reply sounds educational.

Return one of:
allow
rewrite
block
`.trim();

  const model = getValidatorModelName();
  console.log("[validator] model:", model);

  const res = await fetch(getOllamaGenerateUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      keep_alive: -1,
      options: { temperature: 0, top_p: 0.1 },
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`validator http error: ${raw.slice(0, 200)}`);
  }

  const data = (await res.json()) as { response?: string };
  const jsonText = extractJson(data.response ?? "");

  if (!jsonText) {
    throw new Error("validator returned invalid json");
  }

  const parsed = JSON.parse(jsonText) as {
    risk_score?: number;
    decision?: string;
    violations?: unknown[];
    reason?: string;
  };

  const decision: ValidatorDecision =
    parsed.decision === "allow" || parsed.decision === "rewrite" || parsed.decision === "block"
      ? parsed.decision
      : "rewrite";

  return {
    riskScore: typeof parsed.risk_score === "number" ? parsed.risk_score : 0.5,
    decision,
    violations: Array.isArray(parsed.violations)
      ? parsed.violations.filter((v): v is string => typeof v === "string")
      : [],
    reason:
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason
        : "validator returned no reason",
    source: "ai",
  };
}

export async function validateMentorReply(input: ValidateInput): Promise<ValidatorResult> {
  try {
    return await aiValidate(input);
  } catch (err) {
    console.warn("[validator] AI validation failed, falling back to heuristic:", err);
    return heuristicValidate(input);
  }
}
