import { PolicyAction } from "@prisma/client";
import {
  inferMentorLocale,
  type MentorRequestInput,
} from "./mentor";
import { normalizeText } from "./mentorContext";
import { resolveMentorContextScope } from "./mentorIntent";
import { callMentorModel } from "./mentorModel";
import { assessMentorReply, type MentorQualityResult } from "./mentorQuality";

export type MentorSafetyFilterResult = {
  text: string;
  quality: MentorQualityResult;
  policyAction: PolicyAction;
  rewriteCount: number;
  rewriteError: string | null;
};

export function mentorDebugEnabled(): boolean {
  return process.env.MENTOR_DEBUG === "true";
}

export function logMentorDebug(stage: string, payload: unknown): void {
  if (!mentorDebugEnabled()) return;
  console.log(`[ai:debug] ${stage}`, payload);
}

export function summarizeMentorInput(input: MentorRequestInput) {
  const contextScope = input.resolvedContextScope ?? resolveMentorContextScope({
    studentQuestion: input.studentQuestion,
    conversationHistory: input.conversationHistory,
    mode: input.mode,
  });

  return {
    question: input.studentQuestion,
    locale: input.mentorLocale,
    inferredLocale: inferMentorLocale(input),
    contextScope,
    resolvedContextScope: input.resolvedContextScope,
    candidateContextScopes: input.candidateContextScopes,
    intentClassifier: input.intentClassifier,
    runtimeAnalysis: input.runtimeAnalysis,
    studentCodeAnalysis: input.studentCodeAnalysis,
    controlledContextSources: input.controlledContextSources,
    mode: input.mode,
    hintLevel: input.hintLevel,
    language: input.language,
    difficulty: input.problemDifficulty,
    assignmentChars: (input.assignmentText || input.problemDescription || "").length,
    studentCodeChars: input.studentCode?.length ?? 0,
    selectedCodeContext: input.selectedCodeContext,
    activeFileName: input.activeFileName,
    activeLineNumber: input.activeLineNumber,
    runStatus: input.runStatus,
    stdout: input.stdout,
    stderr: input.stderr,
    errorMessage: input.errorMessage,
    visibleTestCases: input.testResults?.visibleCases?.length ?? 0,
    historyCount: input.conversationHistory?.length ?? 0,
    historyTail: input.conversationHistory?.slice(-4) ?? [],
  };
}

export function summarizeSafetyFilter(filter: MentorSafetyFilterResult) {
  return {
    text: filter.text,
    quality: {
      ok: filter.quality.ok,
      reasons: filter.quality.reasons,
    },
    policyAction: filter.policyAction,
    rewriteCount: filter.rewriteCount,
    rewriteError: filter.rewriteError,
  };
}

function stableIndex(seed: string, length: number): number {
  if (length <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

export function buildMentorFallbackReply(
  input: MentorRequestInput,
  reason: string | null = null,
): string {
  const targetLocale = inferMentorLocale(input);
  const contextScope = input.resolvedContextScope ?? resolveMentorContextScope({
    studentQuestion: input.studentQuestion,
    conversationHistory: input.conversationHistory,
    mode: input.mode,
  });
  const question = normalizeText(input.studentQuestion);
  const seed = `${targetLocale}|${contextScope}|${reason ?? ""}|${question}|${input.conversationHistory?.length ?? 0}`;
  const reasonText = normalizeText(reason).toLowerCase();

  const reasonKind =
    /solution|algorithm|leak|unsafe|block/.test(reasonText)
      ? "solution"
      : /editor|visible|focused|line/.test(reasonText)
        ? "editor"
        : /runtime|error|stderr|terminal|output/.test(reasonText)
          ? "runtime"
          : /locale|language|dil/.test(reasonText)
            ? "language"
            : /context|casual|misuse/.test(reasonText)
              ? "context"
              : "unclear";

  if (targetLocale === "tr") {
    const focusByScope: Record<string, string> = {
      assignment: "assignmenttaki hangi kısmı kastettiğini",
      editor: "editördeki hangi satır ya da kısmı kastettiğini",
      runtime: "hangi çıktı veya hata üzerinden konuştuğunu",
      code: "kodunun hangi kısmını kastettiğini",
      concept: "hangi kavramı sorduğunu",
      chat: "ne sormak istediğini",
    };
    const focus = focusByScope[contextScope] ?? "ne sormak istediğini";
    const variantsByReason: Record<string, string[]> = {
      solution: [
        `Final cevaba kaymadan yardımcı olayım; ${focus} ve takıldığın küçük adımı tekrar eder misin?`,
        `Çözümü doğrudan vermeden ilerleyelim; ${focus} hangi noktada kaldığını bir cümleyle yazar mısın?`,
      ],
      editor: [
        `Editör bağlamını yanlış yorumlamamak için ${focus} tekrar eder misin?`,
        `Görünen koddan emin olayım; ${focus} kısaca yeniden yazar mısın?`,
      ],
      runtime: [
        `Terminali uydurmadan yorumlamak için ${focus} tekrar eder misin?`,
        `Çıktı/hata tarafını netleştirelim; ${focus} bir cümleyle yeniden yazar mısın?`,
      ],
      language: [
        `Yanıt dilini de doğru tutayım; ${focus} tekrar eder misin?`,
        `Dili karıştırmadan cevaplayayım; ${focus} kısaca yeniden yazar mısın?`,
      ],
      context: [
        `Soruyu yanlış bağlama çekmiş olabilirim; ${focus} tekrar eder misin?`,
        `Doğru yerden cevaplamak için ${focus} bir cümleyle yeniden yazar mısın?`,
      ],
      unclear: [
        `Sorunu net yakalayamadım; ${focus} biraz daha açık tekrar eder misin?`,
        `Bunu tam anlayamadım; ${focus} bir cümleyle yeniden yazar mısın?`,
        `Yanlış yönlendirmemek için emin olmak istiyorum; ${focus} tekrar eder misin?`,
        `Burada neye odaklanmam gerektiğini kaçırdım; ${focus} kısaca tekrar eder misin?`,
      ],
    };
    const variants = variantsByReason[reasonKind] ?? variantsByReason.unclear;
    return variants[stableIndex(seed, variants.length)];
  }

  const focusByScope: Record<string, string> = {
    assignment: "which part of the assignment you mean",
    editor: "which visible line or code section you mean",
    runtime: "which output or error you mean",
    code: "which part of your code you mean",
    concept: "which concept you want explained",
    chat: "what you want to ask",
  };
  const focus = focusByScope[contextScope] ?? "what you want to ask";
  const variantsByReason: Record<string, string[]> = {
    solution: [
      `I can help without giving the final answer; can you restate ${focus} and the small step where you are stuck?`,
      `Let's keep this as guidance rather than a direct solution; can you repeat ${focus} in one sentence?`,
    ],
    editor: [
      `I do not want to misread the editor context; can you repeat ${focus} briefly?`,
      `To stay grounded in the visible code, can you restate ${focus}?`,
    ],
    runtime: [
      `I do not want to guess the terminal behavior; can you repeat ${focus} briefly?`,
      `Let's clarify the output/error first; can you restate ${focus} in one sentence?`,
    ],
    language: [
      `I want to keep the answer in the right language; can you repeat ${focus} briefly?`,
      `To avoid mixing languages, can you restate ${focus}?`,
    ],
    context: [
      `I may have pulled this into the wrong context; can you repeat ${focus} briefly?`,
      `To answer from the right context, can you restate ${focus} in one sentence?`,
    ],
    unclear: [
      `I did not quite catch the question; can you repeat ${focus} a bit more clearly?`,
      `I want to avoid guessing here; can you restate ${focus} in one sentence?`,
      `I missed the exact point; can you repeat ${focus} briefly?`,
      `I am not fully sure what to answer yet; can you clarify ${focus}?`,
    ],
  };
  const variants = variantsByReason[reasonKind] ?? variantsByReason.unclear;
  return variants[stableIndex(seed, variants.length)];
}

function scopedQualityInput(input: MentorRequestInput, reply: string) {
  const contextScope = input.resolvedContextScope ?? resolveMentorContextScope({
    studentQuestion: input.studentQuestion,
    conversationHistory: input.conversationHistory,
    mode: input.mode,
  });
  const includeCodeContext = !["chat", "concept", "assignment"].includes(contextScope);

  return {
    contextScope,
    qualityInput: {
      reply,
      studentQuestion: input.studentQuestion,
      studentCode: includeCodeContext ? input.studentCode : null,
      selectedCodeContext: includeCodeContext ? input.selectedCodeContext : null,
      stderr: contextScope === "runtime" ? input.stderr : null,
      errorMessage: contextScope === "runtime" ? input.errorMessage : null,
      conversationHistory: input.conversationHistory,
      contextScope,
    },
  };
}

const SAFETY_REWRITE_REASONS = [
  "complete_solution_detected",
  "algorithm_recipe_leak",
  "student_correction_ignored",
  "casual_code_advice",
  "context_misuse",
  "unsupported_code_visibility_claim",
];

function buildSafetyRewritePrompt(
  input: MentorRequestInput,
  reply: string,
  reasons: string[],
): string {
  const targetLocale = inferMentorLocale(input);
  const isTr = targetLocale === "tr";
  const contextScope = input.resolvedContextScope ?? resolveMentorContextScope({
    studentQuestion: input.studentQuestion,
    conversationHistory: input.conversationHistory,
    mode: input.mode,
  });
  const includeAssignment = contextScope === "assignment" || contextScope === "code";
  const includeCode = contextScope === "editor" || contextScope === "runtime" || contextScope === "code";
  const includeRuntime = contextScope === "runtime";
  const question = normalizeText(input.studentQuestion) || (isTr ? "Öğrenci yardım istiyor." : "The student is asking for help.");
  const assignment = includeAssignment ? normalizeText(input.assignmentText || input.problemDescription) : "";
  const selected = includeCode ? normalizeText(input.selectedCodeContext) : "";
  const stderr = includeRuntime ? normalizeText(input.stderr || input.errorMessage) : "";

  if (isTr) {
    return [
      "Sen, bir programlama mentörünün güvenlik filtresinden kalan yanıtını yeniden yazan kalite geçidisin.",
      "Kullanıcıya hazır/sabit cevap verme; yanıtı yalnızca verilen öğrenci sorusu ve mevcut bağlama göre yeniden kur.",
      "Kurallar:",
      "- Tam çözüm, final kod, eksik satır, çalışır algoritma reçetesi veya kopyala-yapıştır cevap verme.",
      "- Öğrencinin yazmadığı kodu, görmediğin satırı veya belirli bir hatayı varsayma.",
      "- Öğrenci önceki tavsiyeyi reddediyorsa bunu dikkate al ve konuya yeni teknik varsayım ekleme.",
      "- Emoji kullanma.",
      "- En fazla 1-3 kısa cümle yaz.",
      "",
      `Filtre sebepleri: ${reasons.join(", ")}`,
      "",
      "<OGRENCI_SORUSU>",
      question,
      "</OGRENCI_SORUSU>",
      "",
      assignment ? `<ODEV_BAGLAMI>\n${assignment}\n</ODEV_BAGLAMI>` : "<ODEV_BAGLAMI />",
      "",
      selected ? `<GORUNUR_KOD>\n${selected}\n</GORUNUR_KOD>` : "<GORUNUR_KOD />",
      "",
      stderr ? `<HATA_CIKTISI>\n${stderr}\n</HATA_CIKTISI>` : "<HATA_CIKTISI />",
      "",
      "<GUVENSIZ_YANIT>",
      reply,
      "</GUVENSIZ_YANIT>",
      "",
      "Yeniden yazılmış güvenli mentör yanıtı:",
    ].join("\n");
  }

  return [
    "You are a quality gate rewriting an AI programming mentor answer after a safety filter.",
    "Do not return a canned/static answer; rewrite only from the student question and the available context.",
    "Rules:",
    "- Do not provide a full solution, final code, missing line, complete algorithm recipe, or copy-paste answer.",
    "- Do not assume code, lines, or a specific bug that is not visible in the provided context.",
    "- If the student rejects previous advice, acknowledge that in substance without adding a new technical assumption.",
    "- Do not use emojis.",
    "- Write at most 1-3 short sentences.",
    "",
    `Filter reasons: ${reasons.join(", ")}`,
    "",
    "<STUDENT_QUESTION>",
    question,
    "</STUDENT_QUESTION>",
    "",
    assignment ? `<ASSIGNMENT_CONTEXT>\n${assignment}\n</ASSIGNMENT_CONTEXT>` : "<ASSIGNMENT_CONTEXT />",
    "",
    selected ? `<VISIBLE_CODE>\n${selected}\n</VISIBLE_CODE>` : "<VISIBLE_CODE />",
    "",
    stderr ? `<ERROR_OUTPUT>\n${stderr}\n</ERROR_OUTPUT>` : "<ERROR_OUTPUT />",
    "",
    "<UNSAFE_REPLY>",
    reply,
    "</UNSAFE_REPLY>",
    "",
    "Rewritten safe mentor answer:",
  ].join("\n");
}

async function rewriteMentorReplyForSafety(
  input: MentorRequestInput,
  reply: string,
  reasons: string[],
): Promise<string> {
  return normalizeText(
    await callMentorModel(buildSafetyRewritePrompt(input, reply, reasons), {
      ...input,
      repairInstruction: "safety_rewrite",
    }),
  );
}

export async function applyMentorSafetyFilter(
  input: MentorRequestInput,
  reply: string,
): Promise<MentorSafetyFilterResult> {
  const { qualityInput } = scopedQualityInput(input, reply);
  const quality = assessMentorReply(qualityInput);

  const rewriteReasons = quality.reasons.filter((reason) => SAFETY_REWRITE_REASONS.includes(reason));
  if (rewriteReasons.length > 0) {
    try {
      const rewritten = await rewriteMentorReplyForSafety(input, reply, rewriteReasons);
      logMentorDebug("safety rewrite", { reasons: rewriteReasons, rewritten });
      const { qualityInput: rewrittenQualityInput } = scopedQualityInput(input, rewritten);
      const rewrittenQuality = assessMentorReply(rewrittenQualityInput);
      const stillUnsafe = rewrittenQuality.reasons.some((reason) =>
        SAFETY_REWRITE_REASONS.includes(reason),
      );

      return {
        text: rewritten && !stillUnsafe ? rewritten : "",
        quality: rewritten && !stillUnsafe ? rewrittenQuality : quality,
        policyAction: rewritten && !stillUnsafe ? PolicyAction.rewrite : PolicyAction.block,
        rewriteCount: 1,
        rewriteError: rewritten && !stillUnsafe ? null : "safety_rewrite_still_unsafe",
      };
    } catch (err) {
      return {
        text: "",
        quality,
        policyAction: PolicyAction.block,
        rewriteCount: 1,
        rewriteError: err instanceof Error ? err.message : "safety_rewrite_failed",
      };
    }
  }

  return {
    text: reply,
    quality,
    policyAction: PolicyAction.allow,
    rewriteCount: 0,
    rewriteError: null,
  };
}
