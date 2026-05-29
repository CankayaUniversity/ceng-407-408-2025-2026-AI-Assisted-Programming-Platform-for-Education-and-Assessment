import { normalizeText } from "./mentorContext";
import {
  buildLanguageRepairPrompt,
  inferMentorLocale,
  languageRepairReason,
} from "./mentorLocale";
import { callMentorModel } from "./mentorModel";
import type {
  MentorLanguageRepairResult,
  MentorLocale,
  MentorRequestInput,
} from "./mentorTypes";

const COMPLETE_REPLY_END_PATTERN = /[.!?…)\]\}"'`;*_\-~>]$/;

const INCOMPLETE_TRAILING_WORD_PATTERN =
  /(?:^|\s)(and|or|but|because|so|then|if|when|while|for|to|with|the|a|an|of|in|at|is|are|was|were|be|as|than|that|which|from|by|ve|veya|yahut|ama|fakat|ancak|lakin|çünkü|cunku|eğer|eger|için|icin|ile|bir|bu|şu|su|o|ki|de|da|gibi|kadar|olan|olarak|ise|ya|hem)\s*$/i;

const INCOMPLETE_TRAILING_PHRASE_PATTERN =
  /(?:^|\s)(for example|for instance|such as|including|like|as follows|such that|in order to|örneğin|ornegin|mesela|şöyle|soyle|şöyle ki|soyle ki|örnek olarak|ornek olarak|şudur|sudur|şunlardır|sunlardir|şu şekilde|su sekilde|yani|eğer|eger|if|when|while)\s*$/i;

function hasUnclosedCodeFence(text: string): boolean {
  return (text.match(/```/g) ?? []).length % 2 === 1;
}

function hasUnclosedInlineBacktick(text: string): boolean {
  const withoutFences = text.replace(/```[\s\S]*?```/g, " ");
  return (withoutFences.match(/`/g) ?? []).length % 2 === 1;
}

function looksTruncatedReply(text: string): boolean {
  const trimmed = normalizeText(text);

  if (!trimmed) return false;
  if (hasUnclosedCodeFence(trimmed) || hasUnclosedInlineBacktick(trimmed)) return true;
  if (
    INCOMPLETE_TRAILING_WORD_PATTERN.test(trimmed) ||
    INCOMPLETE_TRAILING_PHRASE_PATTERN.test(trimmed)
  ) {
    return true;
  }
  if (/[,.:([{]\s*$/.test(trimmed)) return true;
  return !COMPLETE_REPLY_END_PATTERN.test(trimmed);
}

function buildTruncationRepairPrompt(
  targetLocale: MentorLocale,
  mentorReply: string,
  attempt: "compact" | "minimal",
): string {
  const isTr = targetLocale === "tr";

  // 1. Dile Özel Rol ve Görev Tanımı (Dil kanamasını engeller)
  const roleStr = isTr
    ? "Sen, bir Sokratik mentörün yarım kalmış (kesilmiş) yanıtını onaran bir asistansın. Görevin bu metni baştan aşağı, eksiksiz ve bitmiş bir cümle olarak yeniden yazmaktır."
    : "You are an assistant repairing a Socratic mentor answer that was cut off. Your task is to rewrite it from scratch as a complete, finished response.";

  // 2. Kesin Uzunluk Kuralları
  const lengthRule = attempt === "minimal"
    ? (isTr ? "UZUNLUK: Sadece TEK BİR kısa ve net cümle kullan." : "LENGTH: Use exactly ONE short and clear sentence.")
    : (isTr ? "UZUNLUK: En fazla 1-2 kısa cümle kullan." : "LENGTH: Use 1-2 short sentences maximum.");

  // 3. Sokratik Hafıza ve Güvenlik Duvarı
  const constraintStr = isTr
    ? "KURALLAR:\n- Orijinal anlamı KESİNLİKLE koru.\n- ANTI-CHEAT: Öğrenciye final çözüm kodunu, kod bloklarını veya çözüm adımlarını ASLA verme (Sokratik kal).\n- Yarım kalan cümleyi ucuna ekleyerek tamamlamaya çalışma; baştan, özet şeklinde yaz.\n- Yeni bir tavsiye, soru cümlesi veya örnek input/output EKLEME."
    : "RULES:\n- STRICTLY maintain the original meaning.\n- ANTI-CHEAT: NEVER provide final solution code, code blocks, or full steps (stay Socratic).\n- Do not just continue the sentence; summarize the intended answer from scratch.\n- DO NOT add new advice, guiding questions, or sample input/output.";

  // 4. XML Etiketli Montaj
  return [
    roleStr,
    "",
    lengthRule,
    constraintStr,
    "",
    isTr ? "<YARIM_KALAN_METIN>" : "<TRUNCATED_TEXT>",
    mentorReply.trim(),
    isTr ? "</YARIM_KALAN_METIN>" : "</TRUNCATED_TEXT>",
    "",
    isTr ? "Tamamlanmış kısa yanıt:" : "Complete compact answer:"
  ].join("\n");
}


export async function repairTruncatedMentorReply(
  input: MentorRequestInput,
  mentorReply: string,
): Promise<string> {
  if (!looksTruncatedReply(mentorReply)) return mentorReply;

  try {
    const targetLocale = inferMentorLocale(input);
    const compact = normalizeText(
      await callMentorModel(buildTruncationRepairPrompt(targetLocale, mentorReply, "compact"), input),
    );
    if (compact && !looksTruncatedReply(compact)) return compact;

    const minimal = normalizeText(
      await callMentorModel(buildTruncationRepairPrompt(targetLocale, compact || mentorReply, "minimal"), input),
    );
    return minimal || compact || mentorReply;
  } catch {
    return mentorReply;
  }
}

export async function repairMentorReplyLanguage(
  input: MentorRequestInput,
  mentorReply: string,
): Promise<MentorLanguageRepairResult> {
  const targetLocale = inferMentorLocale(input);
  const reason = languageRepairReason(input, mentorReply);

  if (!reason) {
    return {
      text: mentorReply,
      changed: false,
      targetLocale,
      reason: null,
      error: null,
    };
  }

  try {
    const repaired = normalizeText(
      await callMentorModel(buildLanguageRepairPrompt(targetLocale, mentorReply), input),
    );

    if (!repaired) {
      return {
        text: mentorReply,
        changed: false,
        targetLocale,
        reason,
        error: "language_repair_empty_response",
      };
    }

    const finished = await repairTruncatedMentorReply(input, repaired);
    return {
      text: finished,
      changed: finished !== mentorReply,
      targetLocale,
      reason,
      error: null,
    };
  } catch (err) {
    return {
      text: mentorReply,
      changed: false,
      targetLocale,
      reason,
      error: err instanceof Error ? err.message : "language_repair_failed",
    };
  }
}
