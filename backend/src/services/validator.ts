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
  // Default to the small instruct model the platform ships with. Falls back to
  // OLLAMA_MODEL only if the validator var is unset; never defaults to a model
  // that is not part of the deployed Ollama stack.
  return process.env.OLLAMA_VALIDATOR_MODEL ?? process.env.OLLAMA_MODEL ?? "qwen2.5:3b-instruct";
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

function detectQuestionMode(
  message: string,
): "almost_code" | "casual" | "meta" | "solution" | "runtime" | "code_help" {
  return toValidatorQuestionMode(detectMentorIntent(message));
}

const CODE_LINE_PATTERNS = [
  /^\s*#include\b/,
  /^\s*def\s+/,
  /^\s*class\s+/,
  /^\s*function\s+/,
  /^\s*(int|char|float|double|long|short|bool|void)\s+\w+\s*\(/,
  /^\s*(int|char|float|double|long|short|bool)\s+\w+(\[[^\]]*\])?\s*(=\s*.+)?;?$/,
  /^\s*const\s+/,
  /^\s*let\s+/,
  /^\s*var\s+/,
  /^\s*if\s*\(/,
  /^\s*if\s+/,
  /^\s*for\s*\(/,
  /^\s*for\s+/,
  /^\s*while\s*\(/,
  /^\s*while\s+/,
  /^\s*return\b/,
  /^\s*print\(/,
  /^\s*input\(/,
  /^\s*console\.log\(/,
  /^\s*printf\s*\(/,
  /^\s*fgets\s*\(/,
  /^\s*scanf\s*\(/,
  /^\s*\w+\s*=\s*.+$/,
  /^\s*\w+\s*(\+=|-=|\*=|\/=|\+\+|--)/,
];

function countCodeLikeLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => CODE_LINE_PATTERNS.some((pattern) => pattern.test(line))).length;
}

function asksForDirectCode(text: string): boolean {
  const lower = text.toLocaleLowerCase("tr-TR");
  return [
    /\b(just|only)\s+(give|send|write)?\s*(me\s*)?(the\s*)?(code|answer|final answer)\b/i,
    /\bgive me the code\b/i,
    /\bwrite the final answer only\b/i,
    /\bfull solution\b/i,
    /\bcomplete solution\b/i,
    /\bcopy\s*paste\b/i,
    /\b(sadece|yalnızca)\s+(kodu|kod|cevabı|cevap)\s*(ver|yaz|gönder)?\b/i,
    /\b(tam|bütün|tüm)\s+çözüm\b/i,
    /\bfinal\s+(cevabı|cevap|kodu|kod)\b/i,
  ].some((pattern) => pattern.test(lower));
}

function containsFullSolutionLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    /\b(can'?t|cannot|won'?t)\b.{0,80}\b(full|final|code|solution|copy-?paste|answer)\b/i.test(text) ||
    /\b(full|final|code|solution|copy-?paste|answer)\b.{0,80}\b(can'?t|cannot|won'?t)\b/i.test(text) ||
    /(tam|final|kopyalanabilir|kopyala yapıştır|kod|çözüm).{0,80}veremem/i.test(lower)
  ) {
    return false;
  }

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

function containsAssignmentReadyCode(text: string): boolean {
  const lower = text.toLowerCase();
  const hasInput = /\b(input\s*\(|readline|readfilesync|stdin|scanf\s*\(|fgets\s*\(|cin\s*>>)\b/i.test(text);
  const hasOutput = /\b(print\s*\(|console\.log\s*\(|stdout|output|printf\s*\(|cout\s*<<)\b/i.test(text);
  const hasLoopOrRecurrence = /\b(for|while)\b|\bdef\s+\w+\b.*\breturn\b|\brecursion\b/i.test(text);
  const hasAccumulator = /\b(result|sum|total|answer|ans|factorial|max|min)\s*=|\+=|\*=/.test(lower);

  return hasInput && hasOutput && (hasLoopOrRecurrence || hasAccumulator);
}

function containsAssignmentSpecificCodeFragment(text: string): boolean {
  return [
    /\bfor\s*\([^)]*\)/i,
    /\bwhile\s*\([^)]*\)/i,
    /\bif\s*\([^)]*\)/i,
    /\b(isalpha|isspace|isdigit|strlen|fgets|scanf|printf)\s*\(/i,
    /\bline\s*\[\s*i\s*\]/i,
    /\bin_?word\b/i,
    /\bword_?count\b/i,
    /\bcount\s*(\+\+|\+=|=)/i,
    /\bresult\s*(\*=|=)/i,
    /\bdp\s*\[/i,
  ].some((pattern) => pattern.test(text));
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

function containsExactFinalEdit(text: string): boolean {
  return [
    /replace\s+.+\s+with\s+.+/i,
    /change\s+.+\s+to\s+.+/i,
    /use\s+.+\s+instead\s+of\s+.+/i,
    /print\s*\([^)]*\+\s*[^)]*\)/i,
    /return\s+.+\+.+/i,
  ].some((pattern) => pattern.test(text));
}

function containsInternalPolicyNarration(text: string): boolean {
  return [
    /\bthe student asked\b/i,
    /\bper the rules\b/i,
    /\bI cannot provide per\b/i,
    /\bmy instructions\b/i,
    /\bhidden policy\b/i,
    /\bvalidation\b/i,
  ].some((pattern) => pattern.test(text));
}

function containsGenericFallback(text: string): boolean {
  return [
    /\bi can help with (that|this|your question)\b/i,
    /\bi can help you (pin down|narrow|figure out)\b/i,
    /\btell me the exact (line|part|behavior|error)\b/i,
    /\bshow me the exact (part|line)\b/i,
    /\bi can give (a )?(focused )?(hint|example)\b/i,
    /\blet'?s narrow this down\b/i,
    /\bbu soruya yardımcı olabilirim\b/i,
    /\btakıldığın yeri net\b/i,
    /\bodaklı bir ipucu\b/i,
    /\bbir sonraki küçük adım\b/i,
    /\bhangi satır.*çıktı.*davranış\b/i,
  ].some((pattern) => pattern.test(text));
}

function isEditorInspectionQuestion(text: string): boolean {
  return detectMentorIntent(text) === "editor_inspection";
}

function containsEditorInspectionAdvice(text: string): boolean {
  return [
    /\byou need to\b/i,
    /\badd\b/i,
    /\btry\s+(adding|writing|using)\b/i,
    /\binitialize\b/i,
    /\bloop\s+\w+\s+times\b/i,
    /\bhandle\s+n\s*=\s*1\b/i,
    /\b(add|implement|write|create)\b.{0,40}\b(algorithm|generation logic)\b/i,
    /\bnext step\b/i,
    /\bwould be to\b/i,
    /\bwill need\b/i,
    /\bneeded later\b/i,
    /\bwould be needed\b/i,
    /\bwould need\b/i,
    /\byou'?ll need\b/i,
    /\bneeds? to be (written|added|implemented|created)\b/i,
    /\bhas to be (written|added|implemented|created)\b/i,
    /\bno (code|implementation) (has been written|is visible|is shown)\b/i,
    /\bthere is no (code|implementation) (to|for)\b/i,
    /\bdoes not (compute|implement|solve|output)\b/i,
    /\bnot (compute|implement|solve|output)\b/i,
    /\bcheck if\b/i,
    /\bmake sure\b/i,
    /\blooks correct\b/i,
    /\beverything looks good\b/i,
    /\blogic (is|looks) (correct|sound|fine)\b/i,
    /\b(gerekiyor|gerekir|oluşturman|eklemen|yazman)\b/i,
    /\b(lazım|başlatman|yazdırman|eklemelisin|oluşturmalısın)\b/i,
    /\b(denemelisin|kullanmalısın|başlayabilirsin|ekleyebilirsin|yazabilirsin)\b/i,
    /\b(çözmüyor|hesaplamıyor|uygulama görünmüyor|kod yazılmamış|kontrol et|emin ol)\b/i,
    /\ba\s*,\s*b\s*=/i,
    /\blogic is correct\b/i,
    /\bmantık doğru\b/i,
  ].some((pattern) => pattern.test(text));
}

function containsCasualCodeAdvice(text: string): boolean {
  return [
    /\b(input|print|for loop|while loop|recursion|factorial|palindrome|dynamic programming|algorithm|stdin|stdout|scanf|printf|semicolon|syntax|compile|debug|editor|line)\b/i,
    /\b(use|try|start by|make sure|you need|you should|add|fix)\b.{0,50}\b(input|print|loop|recursion|code|algorithm|scanf|printf|semicolon|line|syntax)\b/i,
    /\b(faktöriyel|palindrom|döngü|rekürsif|algoritma|girdi|çıktı|kod|noktalı virgül|derleme|satır|editör|scanf|printf)\b/i,
    /\b(kullanabilirsin|denemelisin|başlamalısın|yazmalısın|gerekiyor|lazım|ekle|düzelt)\b/i,
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

  if (containsInternalPolicyNarration(mentorReply)) {
    violations.push("internal_policy_narration");
  }

  if (containsGenericFallback(mentorReply)) {
    violations.push("generic_fallback");
  }

  if (containsAssignmentWalkthrough(mentorReply) && sentenceCount >= 5) {
    violations.push("assignment_walkthrough");
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

  if ((questionMode === "casual" || questionMode === "meta") && containsCasualCodeAdvice(mentorReply)) {
    violations.push("context_misuse");
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

  if (questionMode === "solution" && (codeLikeLines >= 1 || containsAssignmentReadyCode(mentorReply))) {
    violations.push("solution_seek_leak");
  }

  if (asksForDirectCode(studentQuestion) && codeLikeLines >= 1) {
    violations.push("solution_seek_leak");
  }

  if (questionMode === "solution" && containsExactFinalEdit(mentorReply)) {
    violations.push("solution_seek_exact_fix");
  }

  if (questionMode === "almost_code") {
    if (codeLikeLines >= 4 || containsAssignmentReadyCode(mentorReply)) {
      violations.push("almost_code_too_complete");
    } else if (containsAssignmentSpecificCodeFragment(mentorReply)) {
      violations.push("almost_code_exact_fragment");
    }
  }

  if (isEditorInspectionQuestion(studentQuestion) && containsEditorInspectionAdvice(mentorReply)) {
    violations.push("editor_inspection_advice");
  }

  if (questionMode === "casual" || questionMode === "meta") {
    if (sentenceCount > 3 || lineCount > 6) {
      violations.push("overly_long_response");
    }
  } else if (questionMode === "code_help") {
    if (sentenceCount > 5 || lineCount > 12) {
      violations.push("overly_long_response");
    }
  } else if (questionMode === "solution") {
    if (sentenceCount > 3 || lineCount > 8) {
      violations.push("overly_long_response");
    }
  } else if (questionMode === "almost_code") {
    if (sentenceCount > 5 || lineCount > 10) {
      violations.push("overly_long_response");
    }
  }

  const uniqueViolations = [...new Set(violations)];

  if (
    uniqueViolations.includes("explicit_solution_language") ||
    uniqueViolations.includes("solution_seek_leak") ||
    uniqueViolations.includes("solution_seek_exact_fix")
  ) {
    return {
      riskScore: 0.92,
      decision: "block",
      violations: uniqueViolations,
      reason: "Reply is too close to a direct solution.",
      source: "heuristic",
    };
  }

  if (uniqueViolations.includes("almost_code_too_complete")) {
    return {
      riskScore: 0.78,
      decision: "block",
      violations: uniqueViolations,
      reason: "Reply is too close to a fill-in or copy-paste solution.",
      source: "heuristic",
    };
  }

  if (
    uniqueViolations.includes("context_misuse") ||
    uniqueViolations.includes("internal_policy_narration") ||
    uniqueViolations.includes("runtime_guess") ||
    uniqueViolations.includes("assignment_walkthrough") ||
    uniqueViolations.includes("editor_inspection_advice") ||
    uniqueViolations.includes("almost_code_exact_fragment") ||
    uniqueViolations.includes("generic_fallback") ||
    uniqueViolations.includes("overly_long_response")
  ) {
    return {
      riskScore: 0.57,
      decision: "rewrite",
      violations: uniqueViolations,
      reason: "Reply should be shorter, more focused, or better aligned to the user's actual question.",
      source: "heuristic",
    };
  }

  return {
    riskScore: 0.06,
    decision: "allow",
    violations: uniqueViolations,
    reason: "Response is acceptable.",
    source: "heuristic",
  };
}

function shouldUseHeuristicBeforeAi(result: ValidatorResult): boolean {
  return result.violations.some((violation) =>
    [
      "explicit_solution_language",
      "solution_seek_leak",
      "solution_seek_exact_fix",
      "almost_code_too_complete",
      "almost_code_exact_fragment",
      "internal_policy_narration",
      "editor_inspection_advice",
      "runtime_guess",
      "context_misuse",
      "generic_fallback",
    ].includes(violation),
  );
}

function shouldTrustHeuristicAllow(input: ValidateInput, result: ValidatorResult): boolean {
  if (result.decision !== "allow") return false;

  const intent = detectMentorIntent(input.studentQuestion);
  if (intent === "editor_inspection" || intent === "casual" || intent === "meta" || intent === "almost_code") {
    return true;
  }

  const reply = normalize(input.mentorReply);
  if (intent === "solution") {
    return /\b(can'?t|cannot|won'?t)\b/i.test(reply) || /veremem/i.test(reply);
  }

  // For runtime/mentor intents (the bulk of normal traffic), trust the heuristic's
  // allow verdict on short, focused replies. The AI judge was over-firing "rewrite"
  // on perfectly good one-line bug diagnoses; we only escalate to the AI when the
  // reply is genuinely long or code-heavy enough that a copy-paste leak is plausible.
  const codeLines = countCodeLikeLines(reply);
  if (codeLines > 3) return false;
  if (reply.length > 800) return false;
  return countSentences(reply) <= 6;
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
- a copy-paste-ready function or class with a complete body for the student's exact task
- near-complete code (5+ substantive lines that together solve the problem), even without markdown fences
- enough exact code that the student can submit it as-is or with only cosmetic edits
- complete pseudocode that maps 1:1 to the assignment steps

REWRITE:
- mentions hidden rules, policies, validators, or refers to the user as "the student"
- gives solution advice when the student only asked what is visible in the editor
- guesses output or success when run status is idle
- restates the whole assignment instead of answering the immediate question
- is a wall of text longer than ~8 sentences for what should be a focused answer
- role-plays, tells jokes, gives life or non-programming advice, or reveals the underlying language model
- contains a code block of 4 or more substantive lines for a debugging/runtime question

ALLOW (these are FINE and must NOT be rewritten):
- conceptual explanation
- syntax explanation
- debugging guidance that names the cause clearly, even when it includes a short concrete fix
- error explanation that pinpoints the bug location
- brief direct answer to a basic programming question
- short and focused next-step guidance
- a tiny non-solution snippet of 1-3 lines that illustrates syntax, a concept, or a local fix
- a one-line code change suggestion (e.g. "change range(n) to range(1, n+1)") as long as it does not constitute the whole solution
- for "what do you see in my editor/code" questions: a brief report of only the provided editor context

Important:
- A short, accurate one-line fix that names the actual bug is ALLOW. Do not rewrite a reply just because it explains the specific cause clearly or because it shows the corrected line.
- If unsure between allow and rewrite, prefer ALLOW when the reply is under 6 sentences AND under 4 lines of code AND does not contain a full function body.
- If unsure between rewrite and block for near-complete code, choose block.
- Do not block a short generic snippet just because it contains code; block only when it is copy-paste ready for the assignment or near-complete.
- Do not be lenient just because the reply sounds educational, but do not be paranoid either: a correct debugging hint with one short fix is the correct mentor behavior, not a violation.

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
  const heuristic = heuristicValidate(input);
  if (shouldTrustHeuristicAllow(input, heuristic)) {
    return heuristic;
  }

  if (shouldUseHeuristicBeforeAi(heuristic)) {
    return heuristic;
  }

  try {
    return await aiValidate(input);
  } catch (err) {
    console.warn("[validator] AI validation failed, falling back to heuristic:", err);
    return heuristic;
  }
}
