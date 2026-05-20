/**
 * AI mentor prompt construction and Ollama calls.
 *
 * This file intentionally keeps the mentor flow small:
 * 1. Handle simple non-code messages locally.
 * 2. Build one concise prompt for real mentoring.
 * 3. Post-process model output so code models cannot leak transcript labels.
 */

import {
  assessMentorReply,
  type MentorConversationMessage,
} from "./mentorQuality";
import {
  detectMentorIntent,
  isBasicHelpQuestion,
} from "./mentorIntent";
import {
  firstErrorLine,
  formatMentorContext,
  formatRecentHistory,
  normalizeText,
} from "./mentorContext";

export type MentorRequestInput = {
  problemDescription?: string | null;
  assignmentText?: string | null;
  studentCode?: string | null;
  errorMessage?: string | null;
  studentQuestion?: string | null;
  runStatus?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  language?: string | null;
  activeFileName?: string | null;
  activeLineNumber?: number | null;
  selectedCodeContext?: string | null;
  conversationHistory?: MentorConversationMessage[] | null;
  mode?: string | null;
  hintLevel?: number | null;
  mentorLocale?: "en" | "tr" | string | null;
  modelOverride?: string | null;
};

export type MentorResult =
  | { success: true; mentorReply: string }
  | { success: false; mentorReply: ""; error: string };

const MAX_MODEL_CHARS = 700;
const MAX_STREAM_CHARS = 900;
const MENTOR_TIMEOUT_MS = Number.parseInt(process.env.OLLAMA_MENTOR_TIMEOUT_MS ?? "60000", 10);

type MentorLocale = "en" | "tr";
type StudentSkillLevel = "beginner" | "novice" | "experienced";

type StudentSkillProfile = {
  level: StudentSkillLevel;
  confidence: number;
  reasons: string[];
};

export function normalizeMentorLocale(locale: MentorRequestInput["mentorLocale"]): MentorLocale {
  return locale === "tr" ? "tr" : "en";
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function inferQuestionBasedSkill(input: MentorRequestInput): StudentSkillProfile {
  const latest = normalizeText(input.studentQuestion).toLocaleLowerCase("tr-TR");
  const recent = (input.conversationHistory ?? [])
    .filter((message) => message.role === "user")
    .slice(-4)
    .map((message) => message.content)
    .join("\n")
    .toLocaleLowerCase("tr-TR");
  const text = `${recent}\n${latest}`;

  let beginner = 0;
  let novice = 0;
  let experienced = 0;
  const reasons: string[] = [];

  const beginnerHits = countMatches(text, [
    /\bwhat is\b/,
    /\bwhat does\b/,
    /\bhow do i\b/,
    /\bsyntax\b/,
    /\bvariable\b/,
    /\bloop\b/,
    /\barray\b/,
    /\binput\b/,
    /\bprint\b/,
    /\bne demek\b/,
    /\bnedir\b/,
    /\bnasil\b/,
    /\bnasıl\b/,
    /\bsözdizimi\b/,
    /\bdeğişken\b/,
    /\bdöngü\b/,
    /\bdizi\b/,
    /\bgirdi\b/,
    /\byazdır/,
  ]);
  if (beginnerHits > 0) {
    beginner += beginnerHits * 2;
    reasons.push("asks about basic concepts or syntax");
  }

  const noviceHits = countMatches(text, [
    /\berror\b/,
    /\bdebug\b/,
    /\bwhy\b/,
    /\bnot working\b/,
    /\bwrong output\b/,
    /\btest case\b/,
    /\bcompile\b/,
    /\bruntime\b/,
    /\bhata\b/,
    /\bneden\b/,
    /\bçalışmıyor\b/,
    /\byanlış çıktı\b/,
    /\btest\b/,
    /\bderleme\b/,
  ]);
  if (noviceHits > 0) {
    novice += noviceHits * 2;
    reasons.push("asks debugging or test-result questions");
  }

  const experiencedHits = countMatches(text, [
    /\bedge case\b/,
    /\bcomplexity\b/,
    /\boptimi[sz]e\b/,
    /\brefactor\b/,
    /\bmemory\b/,
    /\bperformance\b/,
    /\binvariant\b/,
    /\brecursion\b/,
    /\bpointer\b/,
    /\basymptotic\b/,
    /\bsınır durum\b/,
    /\bkarmaşıklık\b/,
    /\boptimi[sz]e\b/,
    /\bperformans\b/,
    /\bbellek\b/,
    /\bözyineleme\b/,
    /\bişaretçi\b/,
  ]);
  if (experiencedHits > 0) {
    experienced += experiencedHits * 2;
    reasons.push("asks about edge cases, design, or efficiency");
  }

  if (latest.length < 35 && /(help|hint|yardım|ipucu|anlamadım|bilmiyorum)/.test(latest)) {
    beginner += 2;
    reasons.push("latest question is broad or underspecified");
  }

  if (input.selectedCodeContext || input.stderr || input.errorMessage) {
    novice += 1;
    reasons.push("uses code or error context");
  }

  if (input.hintLevel && input.hintLevel >= 2) {
    beginner += 1;
    reasons.push("asks for repeated hints");
  }

  const scores: Record<StudentSkillLevel, number> = { beginner, novice, experienced };
  const level = (Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "novice") as StudentSkillLevel;
  const topScore = scores[level];
  const total = beginner + novice + experienced;

  return {
    level: total === 0 ? "novice" : level,
    confidence: total === 0 ? 0.35 : Math.min(0.9, Math.max(0.45, topScore / total)),
    reasons: reasons.slice(0, 3),
  };
}

function formatSkillGuidance(input: MentorRequestInput): string {
  const profile = inferQuestionBasedSkill(input);
  const reasons = profile.reasons.length ? profile.reasons.join("; ") : "limited signal from the question";

  const guidance: Record<StudentSkillLevel, string[]> = {
    beginner: [
      "Use plain language and explain one prerequisite concept before the next step.",
      "Prefer one small action the student can try immediately.",
      "Avoid dense terminology unless you define it briefly.",
    ],
    novice: [
      "Give a focused debugging or reasoning hint.",
      "Name the likely issue and one next check.",
      "Keep explanations concise while still teaching the idea.",
    ],
    experienced: [
      "Be direct and technical.",
      "Focus on assumptions, edge cases, design tradeoffs, or the fastest diagnostic check.",
      "Do not over-explain basic syntax.",
    ],
  };

  return [
    `Question-based student skill estimate: ${profile.level}`,
    `Confidence: ${profile.confidence.toFixed(2)}`,
    `Signals: ${reasons}`,
    "Adaptation rules:",
    ...guidance[profile.level].map((rule) => `- ${rule}`),
    "- Do not tell the student their estimated level.",
  ].join("\n");
}

function casualReply(message: string | null | undefined, locale: MentorLocale): string {
  if (locale === "tr") {
    const msg = normalizeText(message).toLocaleLowerCase("tr-TR");
    if (/\bnasılsın\b/.test(msg)) return "İyiyim. Ne üzerinde çalışıyorsun?";
    if (/\b(teşekkür|sağ ol|sag ol)\b/.test(msg)) return "Rica ederim. Sırada neye bakalım?";
    return "Merhaba. Ne konuda yardım istersin?";
  }

  const msg = normalizeText(message).toLowerCase();
  if (/\bhow are you\b/.test(msg)) return "I'm doing well. What are you working on?";
  if (/\b(thanks|thank you)\b/.test(msg)) return "You're welcome. What should we look at next?";
  return "Hello. What would you like help with?";
}

function metaReply(locale: MentorLocale): string {
  if (locale === "tr") {
    return "Ben bir yapay zeka programlama mentoruyum. Tam çözümü vermeden kod, hata ve sonraki adımlar konusunda yardımcı olurum.";
  }

  return "I'm an AI programming mentor. I help with code, errors, and next steps without giving the full assignment solution.";
}

function localRuntimeReply(input: MentorRequestInput): string {
  const locale = normalizeMentorLocale(input.mentorLocale);
  const firstError = firstErrorLine(input);
  if (firstError) {
    if (locale === "tr") {
      return `Şu hatadan başla: \`${firstError}\`. Önce o satırı ve hemen önceki satırı kontrol et.`;
    }
    return `Start with this error: \`${firstError}\`. Check that line and the line immediately before it first.`;
  }

  if (normalizeText(input.runStatus).toLowerCase() === "idle") {
    if (locale === "tr") {
      return "Kodu bir kez çalıştır, sonra terminaldeki ilk hata satırını gönder; doğru nedeni birlikte daraltalım.";
    }
    return "Run the code once, then send the first error line from the terminal so I can point to the right cause.";
  }

  if (locale === "tr") {
    return "İlk hata satırını veya hatalı çıktıyı yapıştır; nedeni daraltmana yardım edebilirim.";
  }
  return "Paste the first error line or the failing output, and I can help narrow it down.";
}

function solutionRefusal(input: MentorRequestInput): string {
  const locale = normalizeMentorLocale(input.mentorLocale);
  const focusedLine =
    typeof input.activeLineNumber === "number"
      ? locale === "tr"
        ? `, özellikle ${input.activeLineNumber}. satır civarında`
        : ` around line ${input.activeLineNumber}`
      : "";
  if (locale === "tr") {
    return `Tam final kodu veremem, ama tek bir odaklı adımda yardımcı olabilirim${focusedLine}.`;
  }
  return `I can't give the full final code, but I can help with one focused step${focusedLine}.`;
}

function basicHelpFallback(input: MentorRequestInput): string {
  const locale = normalizeMentorLocale(input.mentorLocale);
  const q = normalizeText(input.studentQuestion).toLowerCase();
  const recentUserText = (input.conversationHistory ?? [])
    .filter((message) => message.role === "user")
    .slice(-2)
    .map((message) => message.content.toLowerCase())
    .join(" ");

  if (/\bnested loops?\b/.test(q)) {
    if (locale === "tr") {
      return "İç içe döngüler, bir döngünün başka bir döngünün içinde çalışmasıdır; dış döngü grupları, iç döngü ise her grubun içindeki tekrarları yönetir.";
    }
    return "Nested loops are loops inside other loops; the outer loop controls repeated groups, and the inner loop repeats work within each group.";
  }
  if (/\bexample\b/.test(q) && /\bnested loops?\b/.test(recentUserText)) {
    if (locale === "tr") {
      return "Örnek olarak dış döngüyü satırlar, iç döngüyü sütunlar için düşünebilirsin; her satırda sütun işi tekrar eder.";
    }
    return "Example: use an outer loop for rows and an inner loop for columns, so each row repeats the column work.";
  }
  if (/\bexample\b/.test(q)) {
    if (locale === "tr") {
      return "Tabii. Hangi kavram için örnek istediğini söyle; çözüm olmayan küçük ve genel bir örnek gösterebilirim.";
    }
    return "Sure. Tell me the concept you want an example for, and I can show a tiny generic snippet.";
  }
  if (locale === "tr") {
    return "Bu bir kavram sorusu; doğrudan cevaplayabilirim. Açıklamamı istediğin sözdizimini veya fikri net yaz.";
  }
  return "That is a concept question, so I can answer it directly. Ask the exact syntax or idea you want explained.";
}

function safeFallback(input: MentorRequestInput): string {
  const locale = normalizeMentorLocale(input.mentorLocale);
  const intent = detectMentorIntent(input.studentQuestion);
  if (intent === "casual") return casualReply(input.studentQuestion, locale);
  if (intent === "meta") return metaReply(locale);
  if (intent === "solution") return solutionRefusal(input);
  if (intent === "runtime") return localRuntimeReply(input);
  if (isBasicHelpQuestion(input.studentQuestion)) {
    return basicHelpFallback(input);
  }
  if (locale === "tr") {
    return "Yardım edebilirim. Bu genel bir kavram veya yaklaşım sorusuysa doğrudan sor; kodunla ilgiliyse ilgili satırı ya da hatayı belirt.";
  }
  return "I can help with that. If this is a general concept or approach question, ask it directly; if it is about your code, mention the relevant line or error.";
}

function getOllamaGenerateUrl(): string {
  const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  return `${base}/api/generate`;
}

export function getMentorModelName(input?: MentorRequestInput): string {
  if (process.env.ALLOW_AI_MODEL_OVERRIDE === "true" && input?.modelOverride?.trim()) {
    return input.modelOverride.trim();
  }

  return process.env.OLLAMA_MODEL ?? "qwen2.5:3b-instruct";
}

function buildPrompt(
  input: MentorRequestInput,
  options?: { compact?: boolean; repairReasons?: string[] },
): string {
  const intent = detectMentorIntent(input.studentQuestion);
  const appMode = normalizeText(input.mode || "mentor").toLowerCase();
  const compact = options?.compact ?? false;
  const hintLevel = input.hintLevel ?? 0;
  const locale = normalizeMentorLocale(input.mentorLocale);

  const rules = [
    // ── Identity ───────────────────────────────────────────────────────────
    "You are a Socratic programming mentor, not a code generator and not a tutor giving lectures.",

    // ── Language matching ──────────────────────────────────────────────────
    "Match the student's latest message language. Turkish in -> natural Turkish out. English in -> English out. Code, compiler/runtime errors, and API names stay in their original form.",

    // ── HARD length cap ────────────────────────────────────────────────────
    compact
      ? "MAXIMUM 2 sentences. One is often enough."
      : "MAXIMUM 3 sentences. Most replies should be 1-2. Never write a paragraph.",

    // ── Socratic posture ───────────────────────────────────────────────────
    "End every substantive reply with EITHER a thought-provoking question that makes the student think about the next step, OR a precise pointer to a specific concept/line they should examine. Never end with 'let me know if you have more questions' or similar filler.",
    "Prefer asking a question over making a statement when both are reasonable.",
    "Do not lecture. Do not explain three things when one is enough. Stay on the student's immediate question.",

    // ── No code by default ─────────────────────────────────────────────────
    "DEFAULT: no code blocks at all. Most mentor replies should be pure prose.",
    "Pseudo-code is allowed ONLY when the concept genuinely cannot be conveyed in words and the student is at the right point to see it. Maximum 3 lines, ONE block, generic placeholder names (x, items, total, n) — never the student's variable names or the assignment's specific logic.",
    "If you write any code, it must be pseudo-code or a tiny generic example. Never write the student's assignment code, never write a function/class/program that solves the assignment, never write step-by-step solutions like 'Step 1:... Step 2:...'.",

    // ── Refusal discipline ─────────────────────────────────────────────────
    "If the student asks for the solution, the full code, or a copy-paste answer: refuse in ONE sentence, then ask ONE Socratic question that redirects to the underlying concept. STOP THERE. Do not continue with 'but here is...', 'let me show you...', 'let us continue with...', or any walkthrough.",

    // ── Anti-patterns to avoid ─────────────────────────────────────────────
    "Do NOT write 'Step 1:', 'Step 2:', or numbered solution walkthroughs.",
    "Do NOT echo the student's question back to them.",
    "Do NOT start with filler like 'Great question', 'I can help with that', 'It looks like', 'It seems like', 'Based on your code'.",
    "Do NOT repeat or paraphrase your previous mentor replies in this conversation.",
    "Do NOT write transcript labels (AI response, User message, Assistant, Student).",

    // ── Context honesty ────────────────────────────────────────────────────
    "If run status is idle (the student has not run the code), do NOT claim output, pass/fail, or runtime behavior. Ask them to run it first or point at where you would look in the code.",
    "Prefer the focused cursor line and surrounding code when the student says 'this', 'here', 'this line', or refers to the current error.",
  ];

  if (options?.repairReasons?.length) {
    rules.push(`Your previous draft failed quality checks: ${options.repairReasons.join(", ")}.`);
    rules.push("Rewrite it with a specific, non-repetitive answer. Do not quote the student's question.");
  }

  // Pick how much problem context to dump into the prompt.
  // - casual/meta: minimal (no assignment, no code) so the model isn't
  //   tempted to start solving.
  // - runtime/code_help/solution: full context.
  const contextScope: "minimal" | "full" =
    intent === "casual" || intent === "meta" ? "minimal" : "full";

  if (appMode === "hint") {
    // Hints progress in specificity by level. Pseudo-code is allowed at
    // the higher levels because at that point the student has already
    // burned several lighter hints and an illustrative micro-example is
    // the next pedagogical step — still not the final solution.
    const hintRules = [
      "Match the student's language: Turkish in, Turkish out; English in, English out.",
      "Give exactly ONE hint. No multiple hints in one reply.",
      "Do not solve the assignment, do not write its final code, do not walk through step-by-step.",
      "Do not repeat a hint you already gave in this conversation; check the recent conversation and add something new.",
      "Prefer phrasing the hint as a question that makes the student think (e.g. 'What happens when the loop reaches the last element?').",
      hintLevel <= 1
        ? "Level 0-1: ONE short sentence. No code, no pseudo-code. Just point at the area or concept."
        : hintLevel === 2
          ? "Level 2: ONE sentence. You may name the specific construct or method to look at. Still no code."
          : hintLevel === 3
            ? "Level 3: Up to 2 sentences. Optional: ONE generic pseudo-code line, placeholder names only."
            : "Level 4-5: Up to 2 sentences plus a short pseudo-code block (max 3 lines, generic names). Never the final code.",
      `Current hint level: ${hintLevel}`,
    ];

    return [
      "You are a programming mentor giving a progressive hint.",
      "",
      "Rules:",
      ...hintRules.map((rule) => `- ${rule}`),
      "",
      "Context:",
      formatMentorContext(input, contextScope),
      "",
      "Hidden student adaptation:",
      formatSkillGuidance(input),
      "",
      "Recent conversation:",
      formatRecentHistory(input),
      "",
      `Student asks: ${input.studentQuestion || "Give me a hint."}`,
    ].join("\n");
  }

  if (intent === "solution") {
    rules.push("CRITICAL: The student is asking for a solution. Refuse in one sentence. Then ONE Socratic question. STOP.");
    rules.push("Do not give an exact edit like 'replace X with Y', 'change this line to that line', the final print/return statement, or any code that solves the assignment.");
  }

  if (intent === "runtime") {
    rules.push("Prioritize the first real error line if one is available.");
  }

  if (isBasicHelpQuestion(input.studentQuestion)) {
    rules.push("For basic syntax/concept questions, give a one-sentence direct answer followed by an example use-case as a question (e.g. 'Where in your code would you need this?').");
  }

  return [
    "You are a practical programming mentor for students.",
    "",
    "Rules:",
    ...rules.map((rule) => `- ${rule}`),
    "",
    "Context:",
    formatMentorContext(input, contextScope),
    "",
    "Hidden student adaptation:",
    formatSkillGuidance(input),
    "",
    "Recent conversation:",
    formatRecentHistory(input),
    "",
    `Student asks: ${input.studentQuestion || "Help me with my code."}`,
    "",
    "Mentor reply:",
  ].join("\n");
}

async function callModel(prompt: string, input: MentorRequestInput): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MENTOR_TIMEOUT_MS);

  try {
    const model = getMentorModelName(input);
    console.log("[mentor] model:", model);

    const res = await fetch(getOllamaGenerateUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        keep_alive: -1,
        options: {
          temperature: 0.15,
          top_p: 0.9,
          num_predict: 180,
          stop: [
            "\nUser:",
            "\nStudent:",
            "\nUser message:",
            "\nStudent message:",
            "\nAI response:",
            "\nAssistant:",
            "\nMentor reply:",
          ],
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as { response?: string };
    return normalizeText(data.response);
  } finally {
    clearTimeout(timeout);
  }
}

function stripTranscriptArtifacts(text: string): string {
  const withoutThinking = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:text|markdown)?\s*$/i, "")
    .trim();

  const lines = withoutThinking
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const line of lines) {
    if (/^(user|student)\s*(message|response)?\s*:/i.test(line)) break;
    const cleaned = line
      .replace(/^(ai\s*)?(mentor|assistant|response)\s*:\s*/i, "")
      .replace(/^mentor reply\s*:\s*/i, "")
      .trim();
    if (cleaned) kept.push(cleaned);
  }

  return kept.join("\n").trim();
}

function countCodeLikeLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) =>
      /^(def |class |function |const |let |var |if\b|for\b|while\b|return\b|print\(|input\(|console\.log\(|#include\b|import\b|\w+\s*=)/.test(
        line,
      ),
    ).length;
}

function looksTooSolutionLike(text: string): boolean {
  const lower = text.toLowerCase();
  const banned = [
    "complete solution",
    "full solution",
    "full code",
    "copy and paste",
    "submit this",
    "use this exact code",
    "here is the corrected version",
    "here's the corrected version",
    "final code",
  ];

  if (banned.some((phrase) => lower.includes(phrase))) return true;
  const fencedBlocks = (text.match(/```/g) ?? []).length / 2;
  return fencedBlocks >= 2 || countCodeLikeLines(text) >= 6;
}

function sentenceCount(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function isTooLong(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).length;
  return text.length > MAX_MODEL_CHARS || lines > 12 || sentenceCount(text) > 6;
}

function finalClean(text: string): string {
  return stripTranscriptArtifacts(text).slice(0, MAX_STREAM_CHARS).trim();
}

function assessText(input: MentorRequestInput, reply: string) {
  return assessMentorReply({
    reply,
    studentQuestion: input.studentQuestion,
    selectedCodeContext: input.selectedCodeContext,
    stderr: input.stderr,
    errorMessage: input.errorMessage,
    conversationHistory: input.conversationHistory,
  });
}

async function generateMentorText(input: MentorRequestInput): Promise<string> {
  const intent = detectMentorIntent(input.studentQuestion);
  const locale = normalizeMentorLocale(input.mentorLocale);

  if (intent === "casual") return casualReply(input.studentQuestion, locale);
  if (intent === "meta") return metaReply(locale);

  const firstPrompt = buildPrompt(input);
  let text = finalClean(await callModel(firstPrompt, input));

  if (!text) return safeFallback(input);

  let quality = assessText(input, text);

  if (looksTooSolutionLike(text) || isTooLong(text) || !quality.ok) {
    text = finalClean(
      await callModel(
        buildPrompt(input, {
          compact: true,
          repairReasons: [
            ...(looksTooSolutionLike(text) ? ["too_solution_like"] : []),
            ...(isTooLong(text) ? ["too_long"] : []),
            ...quality.reasons,
          ],
        }),
        input,
      ),
    );
    quality = assessText(input, text);
  }

  return text && quality.ok ? text : safeFallback(input);
}

/**
 * Real token streaming from Ollama. Each chunk is a fragment of text the model
 * has just produced (typically 1-3 characters). The caller is responsible for
 * concatenating the chunks into a final reply and running the validator/policy
 * pipeline on the buffered result.
 *
 * Casual / meta intents bypass the model — they return a canned reply, yielded
 * once. Streaming is only meaningful for real mentor questions.
 *
 * Errors during streaming raise — the caller decides whether to emit a
 * fallback text or surface the error.
 */
export async function* streamMentorTokens(
  input: MentorRequestInput,
): AsyncGenerator<string, void, unknown> {
  const intent = detectMentorIntent(input.studentQuestion);
  const locale = normalizeMentorLocale(input.mentorLocale);

  if (intent === "casual") { yield casualReply(input.studentQuestion, locale); return; }
  if (intent === "meta")   { yield metaReply(locale); return; }

  const prompt = buildPrompt(input);
  yield* streamOllamaTokens(prompt, input);
}

async function* streamOllamaTokens(
  prompt: string,
  input: MentorRequestInput,
): AsyncGenerator<string, void, unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MENTOR_TIMEOUT_MS);

  try {
    const model = getMentorModelName(input);
    const res = await fetch(getOllamaGenerateUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,             // ← real streaming
        keep_alive: -1,
        options: {
          temperature: 0.15,
          top_p: 0.9,
          num_predict: 180,
          stop: [
            "\nUser:",
            "\nStudent:",
            "\nUser message:",
            "\nStudent message:",
            "\nAI response:",
            "\nAssistant:",
            "\nMentor reply:",
          ],
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const text = !res.ok ? await res.text().catch(() => "") : "";
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    // Ollama's streaming API emits newline-delimited JSON. Each line is an
    // object like { "response": "tok", "done": false } until "done": true.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";

    // ── Live artifact filter ─────────────────────────────────────────────
    // Drop chain-of-thought (<think>...</think>) and a single "Mentor reply:"
    // style prefix before the tokens reach the client. We buffer until we
    // know whether we're inside a thinking block or still consuming the
    // leading prefix; nothing leaves this generator until both have cleared.
    let buffer = "";
    let inThink = false;
    let prefixCleared = false;
    const PREFIX_RE = /^\s*(?:ai\s*)?(?:mentor|assistant|response)(?:\s*reply)?\s*:\s*/i;

    function* drainBuffer(): Generator<string> {
      while (buffer.length > 0) {
        if (inThink) {
          const end = buffer.indexOf("</think>");
          if (end === -1) { buffer = ""; return; } // wait for more
          buffer = buffer.slice(end + "</think>".length);
          inThink = false;
        } else {
          const start = buffer.indexOf("<think>");
          if (start === -1) {
            // No think tag in flight — emit everything except any unsafe
            // trailing partial like "<thi" that might still grow.
            const safeCut = buffer.lastIndexOf("<");
            const tail = safeCut >= 0 ? buffer.slice(safeCut) : "";
            const flushable = safeCut >= 0 && /^<th?i?n?k?>?$/i.test(tail)
              ? buffer.slice(0, safeCut)
              : buffer;
            if (!prefixCleared) {
              const stripped = flushable.replace(PREFIX_RE, "");
              if (stripped.length < flushable.length || stripped.trim().length > 0) {
                prefixCleared = true;
                if (stripped.length > 0) yield stripped;
              }
              buffer = flushable === buffer ? "" : tail;
              return;
            }
            if (flushable.length > 0) yield flushable;
            buffer = flushable === buffer ? "" : tail;
            return;
          }
          const before = buffer.slice(0, start);
          if (before.length > 0) {
            if (!prefixCleared) {
              const stripped = before.replace(PREFIX_RE, "");
              if (stripped.length > 0) { prefixCleared = true; yield stripped; }
            } else {
              yield before;
            }
          }
          buffer = buffer.slice(start + "<think>".length);
          inThink = true;
        }
      }
    }

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed) as { response?: string; done?: boolean };
          if (typeof obj.response === "string" && obj.response.length > 0) {
            buffer += obj.response;
            yield* drainBuffer();
          }
          if (obj.done) {
            // Flush any safe remaining content (in case we stopped mid-buffer)
            if (!inThink && buffer.length > 0) {
              const final = prefixCleared ? buffer : buffer.replace(PREFIX_RE, "");
              if (final.length > 0) yield final;
              buffer = "";
            }
            return;
          }
        } catch { /* malformed line — skip */ }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Backwards-compatible single-chunk streaming generator used by callers that
 * need the *complete* reply (e.g. the non-stream /chat endpoint). Internally
 * this just produces the full text via generateMentorText. The /chat/stream
 * route now uses streamMentorTokens above for true token-by-token delivery.
 */
export async function* getMentorReplyStream(
  input: MentorRequestInput,
): AsyncGenerator<string, void, unknown> {
  try {
    yield await generateMentorText(input);
  } catch {
    yield safeFallback(input);
  }
}

export async function getMentorReply(input: MentorRequestInput): Promise<MentorResult> {
  try {
    const mentorReply = await generateMentorText(input);
    return { success: true, mentorReply };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, mentorReply: "", error: message };
  }
}
