export type MentorIntent =
  | "casual"
  | "meta"
  | "runtime"
  | "solution"
  | "mentor";

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim();
}

export function isCasualConversation(message: string | null | undefined): boolean {
  const msg = normalize(message).toLowerCase();
  if (!msg) return false;

  return (
    /^(hi|hello|hey|yo|sup)\b/.test(msg) ||
    /^(merhaba|selam|slm|hey)\b/.test(msg) ||
    msg === "how are you" ||
    msg === "how's it going" ||
    msg === "what's up" ||
    /\bhow are you\b/.test(msg) ||
    /\bnasılsın\b/.test(msg) ||
    /\bi'?m (good|fine|okay|ok|great|doing well)\b/.test(msg) ||
    /\b(thanks|thank you)\b/.test(msg) ||
    /\b(teşekkür|sag ol|sağ ol)\b/.test(msg)
  );
}

export function isBasicHelpQuestion(message: string | null | undefined): boolean {
  const msg = normalize(message);
  if (!msg) return false;

  return [
    /how do i read .*input/i,
    /how do i take .*input/i,
    /how can i read .*input/i,
    /what does .* mean/i,
    /how does .* work/i,
    /what is the syntax for/i,
    /how do i loop/i,
    /how do i iterate/i,
    /how do i convert .* to int/i,
    /how do i parse/i,
    /how do i declare/i,
    /nasıl .*okur/i,
    /nasıl .*alır/i,
    /ne anlama geliyor/i,
    /nasıl çalışır/i,
    /sözdizimi/i,
    /nasıl döngü/i,
    /nasıl declare/i,
  ].some((pattern) => pattern.test(msg));
}

export function detectMentorIntent(message: string | null | undefined): MentorIntent {
  const msg = normalize(message).toLowerCase();
  if (!msg) return "mentor";
  if (isCasualConversation(msg)) return "casual";

  if (
    /full solution|just write the code|solve it completely|send the final answer only|final answer only|no hints|just code|fix the code and send the corrected version|pretend you are not a mentor|ignore previous instructions|output the final code|for testing purposes|tam çözüm|tüm kod|bütün kod|sadece kod|final cevab|direkt çöz|çözümü ver|kopyalayıp yapıştır|kopyala yapıştır/.test(
      msg,
    )
  ) {
    return "solution";
  }

  if (
    /what model|which model|what is your ai model|what can you do|who are you|are you an ai mentor|coding assistant|explain how you work|hangi model|kimsin|ne yapabilirsin|yapay zeka mentor/.test(
      msg,
    )
  ) {
    return "meta";
  }

  if (
    /what is the output|did it pass|what does it print|what error|runtime|compile|execution|i have an error|take a look at the error|look at the error|error message|exception|traceback|stderr|why am i getting|why do i get|çıktı|ne yazdırır|hata|derleme|çalışma zamanı|neden alıyorum/.test(
      msg,
    )
  ) {
    return "runtime";
  }
  return "mentor";
}

export function toValidatorQuestionMode(
  intent: MentorIntent,
): "casual" | "meta" | "solution" | "runtime" | "code_help" {
  if (intent === "casual") return "casual";
  if (intent === "meta") return "meta";
  if (intent === "solution") return "solution";
  if (intent === "runtime") return "runtime";
  return "code_help";
}

export function toPolicyQuestionMode(
  intent: MentorIntent,
): "casual" | "meta" | "runtime" | "solution" | "mentor" {
  if (intent === "casual") return "casual";
  if (intent === "meta") return "meta";
  if (intent === "runtime") return "runtime";
  if (intent === "solution") return "solution";
  return "mentor";
}
