import type { ValidatorResult } from "./validator";
import { getMentorReply, type MentorRequestInput } from "./mentor";

export type PolicyResult = {
  action: "allow" | "rewrite" | "block";
  finalText: string;
  rewriteCount: number;
};

const SAFE_HINT =
  "Bu noktada dogrudan cozum vermek yerine seni daha guvenli bir sekilde yonlendirebilirim. Hangi adimda takildigini soyle, birlikte o parcayi inceleyelim.";

export function applyPolicy(params: {
  mentorReply: string;
  validator: ValidatorResult;
  studentQuestion?: string | null;
}): PolicyResult {
  const { mentorReply, validator, studentQuestion } = params;

  if (validator.decision === "allow") {
    return { action: "allow", finalText: mentorReply, rewriteCount: 0 };
  }

  if (validator.decision === "rewrite") {
    const focus =
      studentQuestion && studentQuestion.trim()
        ? `Senin soruna odaklanalim: ${studentQuestion.trim()}`
        : "Sorununun ana nedenine odaklanalim.";

    return {
      action: "rewrite",
      finalText: `${focus} Cozumu dogrudan vermeden ilerleyelim. Once girdiyi, beklenen ciktiyi ve hata aldigin tek noktayi adim adim kontrol et.`,
      rewriteCount: 0,
    };
  }

  return { action: "block", finalText: SAFE_HINT, rewriteCount: 0 };
}

export async function applyPolicyWithRetry(params: {
  mentorReply: string;
  validator: ValidatorResult;
  studentQuestion?: string | null;
  originalInput: MentorRequestInput;
}): Promise<PolicyResult> {
  const { mentorReply, validator, studentQuestion, originalInput } = params;

  if (validator.decision === "allow") {
    return { action: "allow", finalText: mentorReply, rewriteCount: 0 };
  }

  if (validator.decision === "rewrite") {
    const retry = await getMentorReply({
      ...originalInput,
      mode: "mentor",
      studentQuestion: `
Rewrite your previous answer to be more guiding.

Rules:
- Keep the reasoning
- Do not give full code
- Do not give the final answer
- Do not sound generic
- Keep it natural, short, and helpful
- Focus on one issue only

Original student question:
${studentQuestion ?? "No question provided."}
`.trim(),
    });

    if (retry.success) {
      return { action: "rewrite", finalText: retry.mentorReply, rewriteCount: 1 };
    }

    const focus =
      studentQuestion && studentQuestion.trim()
        ? `Senin soruna odaklanalim: ${studentQuestion.trim()}`
        : "Sorununun ana nedenine odaklanalim.";

    return {
      action: "rewrite",
      finalText: `${focus} Cozumu dogrudan vermeden ilerleyelim. Once girdiyi, beklenen ciktiyi ve hata aldigin tek noktayi adim adim kontrol et.`,
      rewriteCount: 1,
    };
  }

  return { action: "block", finalText: SAFE_HINT, rewriteCount: 0 };
}
