import type { ValidatorResult } from "./validator";
import { getMentorReply, normalizeMentorLocale, type MentorRequestInput } from "./mentor";
import { detectMentorIntent, toPolicyQuestionMode } from "./mentorIntent";

export type PolicyResult = {
  action: "allow" | "rewrite" | "block";
  finalText: string;
  rewriteCount: number;
};

function safeHint(locale: MentorRequestInput["mentorLocale"]): string {
  if (normalizeMentorLocale(locale) === "tr") {
    return "Tam final çözümü doğrudan veremem, ama bir sonraki adımda veya belirli bir kavramda yardımcı olabilirim.";
  }

  return "I can't give the full final solution directly, but I can still help with one next step or one specific concept.";
}

function detectQuestionMode(message: string | null | undefined): "casual" | "meta" | "runtime" | "solution" | "mentor" {
  return toPolicyQuestionMode(detectMentorIntent(message));
}

function buildGenericGuidance(
  studentQuestion?: string | null,
  mentorLocale?: MentorRequestInput["mentorLocale"],
): string {
  const mode = detectQuestionMode(studentQuestion);
  const locale = normalizeMentorLocale(mentorLocale);

  if (mode === "meta") {
    if (locale === "tr") {
      return "Ben bir yapay zeka programlama mentoruyum. Tam çözümü vermeden kod, hata ve sonraki adımlar konusunda yardımcı olurum.";
    }
    return "I'm an AI programming mentor. I help with code, bugs, and next steps without giving the full assignment solution.";
  }

  if (mode === "runtime") {
    if (locale === "tr") {
      return "Sonucu yorumlamana yardım edebilirim, ama önce gerçek çalışma çıktısını veya hata mesajını görmem gerekiyor.";
    }
    return "I can help interpret the result, but I need the real run output or error first.";
  }

  if (mode === "solution") {
    if (locale === "tr") {
      return "Tam final kodu veremem, ama bir sonraki adımı gösterebilir veya bir parçayı net açıklayabilirim.";
    }
    return "I can't give the full final code, but I can give one next step or explain one part clearly.";
  }

  if (studentQuestion && studentQuestion.trim()) {
    if (locale === "tr") {
      return "Bu soruya yardımcı olabilirim; gerekirse küçük bir örnek veya sözde kod verebilirim, ama final teslim çözümünü veremem.";
    }
    return `I can help with that specific question, including a tiny example or pseudo-code if it helps, but not the full final submission.`;
  }

  if (locale === "tr") {
    return "Takıldığın yeri net göster; odaklı bir ipucu veya küçük bir örnekle yardımcı olabilirim.";
  }
  return "Show me the exact part that is blocking you, and I can give a focused hint or a tiny example.";
}

export function applyPolicy(params: {
  mentorReply: string;
  validator: ValidatorResult;
  studentQuestion?: string | null;
  mentorLocale?: MentorRequestInput["mentorLocale"];
}): PolicyResult {
  const { mentorReply, validator, studentQuestion, mentorLocale } = params;

  if (validator.decision === "allow") {
    return { action: "allow", finalText: mentorReply, rewriteCount: 0 };
  }

  if (validator.decision === "rewrite") {
    return {
      action: "rewrite",
      finalText: buildGenericGuidance(studentQuestion, mentorLocale),
      rewriteCount: 0,
    };
  }

  return {
    action: "block",
    finalText: safeHint(mentorLocale),
    rewriteCount: 0,
  };
}

export async function applyPolicyWithRetry(params: {
  mentorReply: string;
  validator: ValidatorResult;
  studentQuestion?: string | null;
  originalInput: MentorRequestInput;
}): Promise<PolicyResult> {
  const { mentorReply, validator, studentQuestion, originalInput } = params;
  const locale = normalizeMentorLocale(originalInput.mentorLocale);

  if (validator.decision === "allow") {
    return { action: "allow", finalText: mentorReply, rewriteCount: 0 };
  }

  if (validator.decision === "rewrite") {
    const retry = await getMentorReply({
      ...originalInput,
      mode: "mentor",
      studentQuestion: locale === "tr" ? `
Önceki cevabını yeniden yaz.

Kurallar:
- En fazla 4 cümle.
- Yalnızca kullanıcının son sorusunu cevapla.
- Cevabı ilgili satıra, soruna veya sonraki adıma odakla.
- Madde işareti kullanma.
- Numaralı liste kullanma.
- Sadece soruyu doğrudan cevaplıyorsa en fazla 3 satırlık çok küçük bir kod veya sözde kod parçası ekleyebilirsin.
- Tam fonksiyon, tam sınıf, tam program, importlar artı ana mantık veya kopyala-yapıştır final çözümü verme.
- Tüm ödevi yeniden anlatma.
- Kullanıcı final çözümü istediyse kısa biçimde reddet ve yalnızca bir kavramsal ipucu ver.
- Kullanıcı gündelik veya meta soru sorduysa, açıkça kod hakkında sormadığı sürece koddan bahsetme.
- Çalıştırma durumu idle ise çıktı veya geçti/kaldı tahmini yapma.
- Cevabı doğal Türkçe yaz; kod, hata mesajı ve API adları dışında İngilizceye geçme.

Orijinal öğrenci sorusu:
${studentQuestion ?? "Soru verilmedi."}
`.trim() : `
Rewrite your previous answer.

Rules:
- Maximum 4 sentences.
- Answer only the user's immediate question.
- Keep the answer focused on the relevant line, issue, or next step.
- No bullet points.
- No numbered list.
- You may include at most one tiny code or pseudo-code snippet, maximum 3 lines, only if it directly answers the question.
- Do not provide a complete function, complete class, complete program, imports plus main logic, or copy-paste-ready assignment answer.
- Do not restate the whole assignment.
- If the user asked for the final solution, refuse briefly and give only one conceptual hint.
- If the user asked a casual or meta question, do not mention the code unless they explicitly asked about it.
- If run status is idle, do not guess output or pass/fail.

Original student question:
${studentQuestion ?? "No question provided."}
`.trim(),
    });

    if (retry.success && retry.mentorReply.trim()) {
      return { action: "rewrite", finalText: retry.mentorReply, rewriteCount: 1 };
    }

    return {
      action: "rewrite",
      finalText: buildGenericGuidance(studentQuestion, originalInput.mentorLocale),
      rewriteCount: 1,
    };
  }

  return {
    action: "block",
    finalText: safeHint(originalInput.mentorLocale),
    rewriteCount: 0,
  };
}
