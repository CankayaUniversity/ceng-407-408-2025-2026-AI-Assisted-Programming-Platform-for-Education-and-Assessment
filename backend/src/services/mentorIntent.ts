export type MentorIntent =
  | "almost_code"
  | "casual"
  | "editor_inspection"
  | "meta"
  | "runtime"
  | "solution"
  | "mentor";

export type MentorTurnResolution = {
  latestIntent: MentorIntent;
  effectiveIntent: MentorIntent;
  isFollowUp: boolean;
  followUpKind: "ambiguous" | "line_reference" | "source_check" | "repeat_check" | null;
  previousUserQuestion: string | null;
  previousMentorReply: string | null;
};

export type MentorTurnHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim();
}

function asksAboutTerminalOrConsole(msg: string): boolean {
  return (
    /\bwhat\s+(do\s+you\s+see|is)\b.*\b(terminal|console|output)\b/.test(msg) ||
    /\b(terminal|console)\b.*\b(output|stdout|stderr|error|compile|show|see|visible)\b/.test(msg) ||
    /\b(output|stdout|stderr|error|compile)\b.*\b(terminal|console)\b/.test(msg) ||
    /\bterminalde\b.*\b(ne\s+(görüyorsun|goruyorsun|var)|görünüyor|gorunuyor|hata|çıktı|cikti|derleme)\b/.test(msg) ||
    /\bkonsolda\b.*\b(ne\s+(görüyorsun|goruyorsun|var)|görünüyor|gorunuyor|hata|çıktı|cikti|derleme)\b/.test(msg)
  );
}

function asksAboutErrorOrExecution(msg: string): boolean {
  return /what is the output|did it pass|what does it print|what error|what does this error mean|this error mean|runtime|compile|execution|i have an error|take a look at the error|look at the error|error message|exception|traceback|stderr|why am i getting|why do i get|çıktı|ne yazdırır|hata|derleme|çalışma zamanı|neden alıyorum/.test(
    msg,
  );
}

function asksAboutExpectedOutputOrFormat(msg: string): boolean {
  return /what am i supposed to output|what should i output|expected output|expected result|sample output|output format|sample input|input format|simple test case|failing test|edge case|smallest input|tricky input|test case to try|çıktı olarak|cikti olarak|beklenen çıktı|beklenen cikti|örnek çıktı|ornek cikti|çıktı formatı|cikti formati|örnek girdi|ornek girdi|giriş formatı|giris formati|ne vermem gerekiyor|basit bir test|test case|sınır durum|sinir durum|en küçük girdi|en kucuk girdi|zor bir test/.test(
    msg,
  );
}

function asksAboutEditorVisibility(msg: string): boolean {
  return (
    /\b(do|can|could)\s+you\s+see\b/.test(msg) ||
    /\bis\s+(there|this|that|it)\b.*\b(visible|shown|provided|in (my|the) (editor|code|context))\b/.test(msg) ||
    /\b(is|are)\b.*\bvisible\b/.test(msg) ||
    /\b(görüyor musun|goruyor musun|görünüyor mu|gorunuyor mu|görebiliyor musun|gorebiliyor musun)/.test(msg) ||
    /\b(editor|editör|editor[üu]|kod|code|satır|satir|line)\b.*(var mı|var mi|görünüyor mu|gorunuyor mu|görüyor musun|goruyor musun)/.test(msg) ||
    /\b(print|printf|console\.log|çıktı|cikti|yazdırma|yazdirma|loop|döngü|dongu|function|fonksiyon|condition|koşul|kosul|recursion|array|list)\b.*(var mı|var mi|görünüyor mu|gorunuyor mu|görüyor musun|goruyor musun)/.test(msg)
  );
}

function asksForEditorInspection(msg: string): boolean {
  return /what do you see in my (editor|code)|can you write what you see|write what you see in the editor|repeat the code visible|list only the visible lines|what else do you see|what else is in my code|what do you see now|is it still the same code|did anything change in my editor|check the visible code again|are you still seeing only those lines|code after the comment|after the comment|editörde ne görüyorsun|kodumda ne görüyorsun|gördüğün kodu yaz|başka ne görüyorsun|aynı kodu mu görüyorsun|tekrar bakar mısın|hala sadece bu satırlar mı var|yorumdan sonra/.test(
    msg,
  );
}

function asksDebugOrStrategy(msg: string): boolean {
  return /\bwhy\b|\bfails?\b|\bfailing\b|\bwhat should i do\b|\bshould i\b|\bnext\b|\bissue with\b|\bbetter way\b|\bimprove\b|\bfix\b|\bdebug\b|\bproblem with\b|\bneden\b|\bne yapmalıyım\b|\bsonraki\b|\bdaha iyi\b|\bdüzelt\b|\bhata\b/.test(
    msg,
  );
}

function asksForSourceAttribution(msg: string): boolean {
  return (
    /\b(from my code|from the assignment|assuming|seeing it|is that from|are you assuming)\b/.test(msg) ||
    /\b(kodumda mı|ödevden mi|varsayıyor musun|varsayım mı|gördüğün mü)\b/.test(msg)
  );
}

function isRepeatCheckFollowUp(msg: string): boolean {
  return /^(same question|what about now|did anything change|check again|can you check.*again|again\??|tekrar bak|aynı kod|hala|hâlâ)/i.test(
    msg,
  );
}

function isLineReferenceFollowUp(msg: string): boolean {
  return /\b(which line|where exactly|what line|line where|tam olarak nerede|hangi satır|kaçıncı satır)\b/.test(
    msg,
  );
}

function isAmbiguousFollowUp(msg: string): boolean {
  return /^(why|why\?|neden|neden\?|what do you mean|ne demek istedin|can you explain that again|say it simpler|daha basit|anlamadım|i don'?t understand)\b/i.test(
    msg,
  );
}

export function isMetaQuestion(message: string | null | undefined): boolean {
  const msg = normalize(message).toLowerCase();
  if (!msg) return false;

  return /what'?s your model|what is your model|what model|which model|your ai model|which ai|model are you using|what can you do|who are you|are you an ai mentor|coding assistant|explain how you work|hangi model|kimsin|ne yapabilirsin|yapay zeka mentor/.test(
    msg,
  );
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
    /how do i read .*strings?/i,
    /how do i take .*input/i,
    /how can i read .*input/i,
    /what does .* mean/i,
    /what does .* do/i,
    /how does .* work/i,
    /what is the syntax for/i,
    /how do i loop/i,
    /how do i iterate/i,
    /how do i convert .* to int/i,
    /how do i parse/i,
    /how do i declare/i,
    /nasıl .*okur/i,
    /iki string.*nasıl okunur/i,
    /iki string.*nasil okunur/i,
    /nasıl .*alır/i,
    /ne anlama geliyor/i,
    /ne yapar/i,
    /nasıl çalışır/i,
    /sözdizimi/i,
    /nasıl döngü/i,
    /nasıl declare/i,
  ].some((pattern) => pattern.test(msg));
}

export function isVisibilityInspectionQuestion(message: string | null | undefined): boolean {
  const msg = normalize(message).toLowerCase();
  if (!msg) return false;

  if (asksAboutTerminalOrConsole(msg)) return false;

  return asksAboutEditorVisibility(msg) && !asksDebugOrStrategy(msg);
}

export function isAlmostCodeRequest(message: string | null | undefined): boolean {
  const msg = normalize(message).toLowerCase();
  if (!msg) return false;

  return /pseudocode|pseudo-code|psödo|sözde kod|sozde kod|template|skeleton|partial example|next two lines|only the condition|only the loop structure|function structure.*leave blanks|core idea as comments|write.*comments|sadece iskelet|boşluklu taslak|bosluklu taslak|sadece koşul|sadece kosul|sadece döngü (yapısı|iskeleti)|sadece dongu (yapisi|iskeleti)/.test(
    msg,
  );
}

export function asksForSmallestInputCase(message: string | null | undefined): boolean {
  const msg = normalize(message).toLowerCase();
  if (!msg) return false;

  return /\b(smallest|minimal|minimum)\s+(valid\s+)?(input|test\s+case)\b|\ben küçük girdi\b|\ben kucuk girdi\b|\bminimum girdi\b/.test(
    msg,
  );
}

export function detectMentorIntent(message: string | null | undefined): MentorIntent {
  const msg = normalize(message).toLowerCase();
  if (!msg) return "mentor";

  if (asksAboutExpectedOutputOrFormat(msg)) {
    return "mentor";
  }

  if (asksAboutTerminalOrConsole(msg) || asksAboutErrorOrExecution(msg)) {
    return "runtime";
  }

  if (
    asksForEditorInspection(msg) ||
    isVisibilityInspectionQuestion(msg)
  ) {
    return "editor_inspection";
  }

  if (isMetaQuestion(msg)) return "meta";

  if (isCasualConversation(msg)) return "casual";

  if (isAlmostCodeRequest(msg)) return "almost_code";

  if (
    /full solution|complete solution|just write the code|just give me the code|give me the code|solve it for me|solve it completely|send the final answer only|final answer only|write the final answer only|no hints|just code|only code|fix the code and send the corrected version|pretend you are not a mentor|ignore previous instructions|output the final code|for testing purposes|tam çözüm|tüm kod|bütün kod|sadece kod|sadece kodu ver|final cevab|direkt çöz|çözümü\s+ver\b|kopyalayıp yapıştır|kopyala yapıştır/.test(
      msg,
    )
  ) {
    return "solution";
  }

  return "mentor";
}

function recentNonEmpty(history: MentorTurnHistoryMessage[] | null | undefined): MentorTurnHistoryMessage[] {
  return (history ?? []).filter((message) => message.content.trim());
}

function lastMessageByRole(
  history: MentorTurnHistoryMessage[] | null | undefined,
  role: "user" | "assistant",
): string | null {
  return recentNonEmpty(history)
    .slice()
    .reverse()
    .find((message) => message.role === role)
    ?.content.trim() ?? null;
}

function lastNonAmbiguousUserContext(
  history: MentorTurnHistoryMessage[] | null | undefined,
): { question: string | null; intent: MentorIntent } {
  const messages = recentNonEmpty(history).slice().reverse();
  for (const message of messages) {
    if (message.role !== "user") continue;
    if (detectFollowUpKind(message.content) !== null) continue;

    return {
      question: message.content.trim(),
      intent: detectMentorIntent(message.content),
    };
  }

  const previousQuestion = lastMessageByRole(history, "user");
  return {
    question: previousQuestion,
    intent: detectMentorIntent(previousQuestion),
  };
}

function detectFollowUpKind(message: string | null | undefined): MentorTurnResolution["followUpKind"] {
  const msg = normalize(message).toLowerCase();
  if (!msg) return null;

  if (isRepeatCheckFollowUp(msg)) {
    return "repeat_check";
  }

  if (isLineReferenceFollowUp(msg)) {
    return "line_reference";
  }

  if (asksForSourceAttribution(msg)) {
    return "source_check";
  }

  if (isAmbiguousFollowUp(msg)) {
    return "ambiguous";
  }

  return null;
}

export function resolveMentorTurn(
  message: string | null | undefined,
  history: MentorTurnHistoryMessage[] | null | undefined,
): MentorTurnResolution {
  const latestIntent = detectMentorIntent(message);
  const followUpKind = detectFollowUpKind(message);
  const inheritedContext = lastNonAmbiguousUserContext(history);
  const previousUserQuestion = inheritedContext.question;
  const previousMentorReply = lastMessageByRole(history, "assistant");
  const inheritedIntent = inheritedContext.intent;

  let effectiveIntent = latestIntent;
  if (followUpKind === "repeat_check") {
    effectiveIntent = inheritedIntent === "mentor" ? "editor_inspection" : inheritedIntent;
  } else if (followUpKind === "source_check") {
    effectiveIntent = "editor_inspection";
  } else if (followUpKind && latestIntent === "mentor" && inheritedIntent !== "mentor") {
    effectiveIntent = inheritedIntent;
  }

  return {
    latestIntent,
    effectiveIntent,
    isFollowUp: followUpKind !== null,
    followUpKind,
    previousUserQuestion,
    previousMentorReply,
  };
}

export function toValidatorQuestionMode(
  intent: MentorIntent,
): "almost_code" | "casual" | "meta" | "solution" | "runtime" | "code_help" {
  if (intent === "almost_code") return "almost_code";
  if (intent === "casual") return "casual";
  if (intent === "meta") return "meta";
  if (intent === "solution") return "solution";
  if (intent === "runtime") return "runtime";
  return "code_help";
}

export function toPolicyQuestionMode(
  intent: MentorIntent,
): "almost_code" | "casual" | "editor_inspection" | "meta" | "runtime" | "solution" | "mentor" {
  if (intent === "almost_code") return "almost_code";
  if (intent === "casual") return "casual";
  if (intent === "editor_inspection") return "editor_inspection";
  if (intent === "meta") return "meta";
  if (intent === "runtime") return "runtime";
  if (intent === "solution") return "solution";
  return "mentor";
}
