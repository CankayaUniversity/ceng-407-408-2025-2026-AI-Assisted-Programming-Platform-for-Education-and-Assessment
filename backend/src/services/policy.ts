import type { ValidatorResult } from "./validator";

export function applyPolicy(params: {
  mentorReply: string;
  validator: ValidatorResult;
  studentQuestion?: string | null;
}) {
  const { mentorReply, validator, studentQuestion } = params;

  if (validator.decision === "allow") {
    return {
      action: "allow" as const,
      finalText: mentorReply,
    };
  }

  if (validator.decision === "rewrite") {
    const focus =
      studentQuestion && studentQuestion.trim()
        ? `Senin soruna odaklanalim: ${studentQuestion.trim()}`
        : "Sorununun ana nedenine odaklanalim.";

    return {
      action: "rewrite" as const,
      finalText: `${focus} Cozumu dogrudan vermeden ilerleyelim. Once girdiyi, beklenen ciktiyi ve hata aldigin tek noktayi adim adim kontrol et.`,
    };
  }

  return {
    action: "block" as const,
    finalText:
      "Bu noktada dogrudan cozum vermek yerine seni daha guvenli bir sekilde yonlendirebilirim. Hangi adimda takildigini soyle, birlikte o parcayi inceleyelim.",
  };
}
