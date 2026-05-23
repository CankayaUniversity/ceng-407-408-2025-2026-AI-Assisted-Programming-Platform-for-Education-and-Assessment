import { asksForSmallestInputCase, detectMentorIntent } from "./mentorIntent";

export type MentorConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MentorQualityInput = {
  reply: string;
  studentQuestion?: string | null;
  selectedCodeContext?: string | null;
  stderr?: string | null;
  errorMessage?: string | null;
  conversationHistory?: MentorConversationMessage[] | null;
};

export type MentorQualityResult = {
  ok: boolean;
  reasons: string[];
};

const GENERIC_PATTERNS = [
  /let'?s focus on your question/i,
  /i can help with (the )?(concept|syntax|next step)/i,
  /tell me the exact line or behavior/i,
  /show me the exact part/i,
  /i can give a focused hint or a tiny example/i,
  /i need the exact error text/i,
];

const TRANSCRIPT_PATTERNS = [
  /\bAI response\s*:/i,
  /\bUser message\s*:/i,
  /\bStudent message\s*:/i,
  /\bAssistant\s*:/i,
  /\bMentor reply\s*:/i,
  /\bthe student asked\b/i,
  /\bper the rules\b/i,
  /\bI cannot provide per\b/i,
  /\bmy instructions\b/i,
  /\bhidden policy\b/i,
  /\bvalidation\b/i,
];

const EDITOR_INSPECTION_ADVICE_PATTERNS = [
  /\byou need to\b/i,
  /\bshould\s+add\b/i,
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
  /\bmantık doğru\b/i,
  /\blogic is correct\b/i,
];

const CASUAL_CODE_ADVICE_PATTERNS = [
  /\b(input|print|for loop|while loop|recursion|factorial|palindrome|dynamic programming|algorithm|stdin|stdout|scanf|printf|fgets)\b/i,
  /\b(use|try|start by|make sure|you need|you should|add|fix)\b.{0,50}\b(input|print|loop|recursion|code|algorithm|scanf|printf|fgets|semicolon|syntax)\b/i,
  /\b(faktöriyel|palindrom|döngü|rekürsif|algoritma|girdi|çıktı|kod|noktalı virgül|derleme|satır)\b/i,
  /\b(kullanabilirsin|denemelisin|başlamalısın|yazmalısın|gerekiyor|lazım|ekle|düzelt)\b.{0,50}\b(input|print|kod|döngü|algoritma|girdi|çıktı|satır|noktalı virgül|derleme)\b/i,
];

function normalizeForSimilarity(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/`[^`]*`/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .filter(
      (token) =>
        ![
          "the",
          "and",
          "you",
          "your",
          "that",
          "this",
          "with",
          "for",
          "can",
          "but",
          "not",
          "line",
          "code",
        ].includes(token),
    );
}

function jaccardSimilarity(a: string, b: string): number {
  const aSet = new Set(normalizeForSimilarity(a));
  const bSet = new Set(normalizeForSimilarity(b));
  if (aSet.size === 0 || bSet.size === 0) return 0;

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection++;
  }

  const union = aSet.size + bSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function lastAssistantReplies(history: MentorConversationMessage[] | null | undefined): string[] {
  return (history ?? [])
    .filter((message) => message.role === "assistant" && message.content.trim())
    .slice(-3)
    .map((message) => message.content.trim());
}

function hasRecentEditorInspectionQuestion(history: MentorConversationMessage[] | null | undefined): boolean {
  return (history ?? [])
    .filter((message) => message.role === "user" && message.content.trim())
    .slice(-4)
    .some((message) => detectMentorIntent(message.content) === "editor_inspection");
}

function acknowledgesPriorReply(reply: string): boolean {
  return /\b(as before|same as before|still|again|previously|earlier|like I said|I still see|same visible|unchanged|az önce|önceki|önceden|hala|hâlâ|yine|aynı)\b/i.test(
    reply,
  );
}

function echoesQuestion(reply: string, question: string): boolean {
  const quotedQuestion = new RegExp(question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (question.length >= 12 && quotedQuestion.test(reply)) return true;
  return jaccardSimilarity(reply, question) >= 0.82 && reply.length < question.length + 80;
}

function mentionsFocusedContext(reply: string, selectedCodeContext?: string | null): boolean {
  const context = selectedCodeContext ?? "";
  if (!context.trim()) return true;

  const focusedLine = context
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith(">"))
    ?.replace(/^>\s*\d+:\s*/, "")
    .trim();

  if (!focusedLine || focusedLine.length < 3) return true;

  const firstIdentifier = focusedLine.match(/[A-Za-z_][A-Za-z0-9_]*/)?.[0];
  if (!firstIdentifier) return true;

  return reply.toLowerCase().includes(firstIdentifier.toLowerCase()) || /\bline\s+\d+/i.test(reply);
}

function questionRefersToEditor(question: string): boolean {
  const explicitEditorReference =
    /\b(editor|my code|code|line|cursor|error|compile|runtime|output|look at|take a look|check|inspect|debug)\b/i.test(
      question,
    );
  const contextualPointer =
    /\b(this|here)\b/i.test(question) && /\b(code|line|error|output|editor)\b/i.test(question);

  return explicitEditorReference || contextualPointer;
}

function distinctiveContextTokens(context?: string | null): string[] {
  return Array.from(
    new Set(
      (context ?? "")
        .toLowerCase()
        .match(/[a-z_][a-z0-9_]{2,}/g)
        ?.filter(
          (token) =>
            ![
              "input",
              "strip",
              "int",
              "print",
              "line",
              "using",
              "find",
              "the",
              "and",
              "for",
              "with",
              "code",
              "programming",
            ].includes(token),
        ) ?? [],
    ),
  ).slice(0, 12);
}

function hasProvidedEditorContext(context?: string | null): boolean {
  return Boolean((context ?? "").trim());
}

function asksForSourceAttribution(question: string): boolean {
  return /\b(from my code|from the assignment|assuming|seeing it|do you see|did i already do that|should i change my code)\b/i.test(
    question,
  ) || /\b(kodumda mı|ödevden mi|varsayıyor musun|görüyor musun|zaten yaptım mı|değiştirmeli miyim)\b/i.test(
    question,
  );
}

function claimsUnsupportedCodeVisibility(reply: string, context?: string | null): boolean {
  const normalizedContext = (context ?? "").toLowerCase();
  const lower = reply.toLocaleLowerCase("tr-TR");

  const claimsSeeingCode =
    /\b(i see|i am seeing|i'm seeing|visible in your code|in your code|in the editor)\b/i.test(reply) ||
    /\b(kodunda görüyorum|kodunda var|editörde görüyorum|görünüyor)\b/i.test(lower);

  if (!claimsSeeingCode) return false;

  const codeFragments = reply.match(/`([^`]+)`/g)?.map((fragment) => fragment.replace(/`/g, "").trim()) ?? [];
  const assignmentEditHints = [
    /n\s*=\s*int\s*\(\s*input\s*\(\s*\)\s*\)/i,
    /\b(input|print)\s*\(/i,
    /\b(for|while)\b.+:/i,
    /\bprintf\s*\(/i,
    /\bscanf\s*\(/i,
  ];

  return (
    codeFragments.some((fragment) => fragment && !normalizedContext.includes(fragment.toLowerCase())) ||
    assignmentEditHints.some((pattern) => pattern.test(reply) && !pattern.test(normalizedContext))
  );
}

function likelyQuestionLocale(question: string): "en" | "tr" | null {
  const lower = question.toLocaleLowerCase("tr-TR");

  if (
    /[çğıöşü]/i.test(lower) ||
    /\b(merhaba|selam|naber|nasılsın|teşekkür|nedir|ne yapar|nasıl|neden|hangi|kimsin|kodumda|editörde|görüyor|musun|verir misin|açıklar mısın|çıktı|girdi|döngü|koşul|fonksiyon|değişken|örnek|basit|sınır durum|zor)\b/i.test(lower)
  ) {
    return "tr";
  }

  if (
    /^[a-z0-9\s'?.!,`():;"_-]+$/i.test(question) &&
    /\b(what|which|who|how|why|can|could|do|does|did|is|are|am|write|give|just|hello|hi|thanks|review|check|explain|show|tell|should|where|exactly|mean|understand|output|input|format|error|code|editor|line|function|loop|array|condition|recursion)\b/i.test(question)
  ) {
    return "en";
  }

  return null;
}


function replyLooksLikeLocaleMismatch(reply: string, locale: "en" | "tr"): boolean {
  const plainReply = reply
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ");
  const lower = plainReply.toLocaleLowerCase("tr-TR");

  const turkishSignals = [
    /[çğıöşü]/i,
    /\b(merhaba|selam|tabii|evet|hayır|çünkü|kodun|kodunda|kodunuz|şu anda|gerekiyor|lazım|örneğin|sonra|önce|cevap|girdi|çıktı|satır|hata|döngü|koşul|fonksiyon|değişken|dizi|kelime|sayısı|olmalı|yazdırmalısın|eklemelisin|görünüyor|görüyorum|anlamına gelir)\b/i,
  ];

  const englishSignals = [
    /\b(i can|i am|i'm|you are|you need|you should|the code|the editor|that reads|hello|you're welcome|this means|for example|current code|visible code|a simple test case|comment line)\b/i,
  ];

  if (locale === "en") {
    return turkishSignals.some((pattern) => pattern.test(plainReply));
  }

  return englishSignals.some((pattern) => pattern.test(plainReply));
}

function misreadsSmallestInputAsNumericLimit(reply: string): boolean {
  return [
    /\bINT_?MIN\b/i,
    /\b(integer|int|data type|veri tipi|tamsayı)\b.{0,80}\b(minimum|smallest|lower bound|alt sınır|en küçük)\b/i,
    /\b-?2\s*,?\s*147\s*,?\s*483\s*,?\s*648\b/,
    /\b-?2147483648\b/,
  ].some((pattern) => pattern.test(reply));
}

export function assessMentorReply(input: MentorQualityInput): MentorQualityResult {
  const reply = input.reply.trim();
  const question = (input.studentQuestion ?? "").trim();
  const intent = detectMentorIntent(question);
  const hasErrorContext = Boolean((input.stderr || input.errorMessage || "").trim());
  const reasons: string[] = [];

  if (!reply) reasons.push("empty");
  if (TRANSCRIPT_PATTERNS.some((pattern) => pattern.test(reply))) reasons.push("transcript_artifact");

  const genericHits = GENERIC_PATTERNS.filter((pattern) => pattern.test(reply)).length;
  if (genericHits >= 2) reasons.push("generic_fallback");

  if (question && echoesQuestion(reply, question)) reasons.push("echoes_question");

  for (const previous of lastAssistantReplies(input.conversationHistory)) {
    if (jaccardSimilarity(reply, previous) >= 0.72) {
      if (intent === "editor_inspection") {
        break;
      }
      reasons.push("repeats_previous_reply");
      break;
    }
  }

  if (hasErrorContext && /error|compile|runtime|exception|traceback|stderr/i.test(question)) {
    const firstErrorWord = (input.stderr || input.errorMessage || "")
      .match(/[A-Za-z_][A-Za-z0-9_]*(Error|Exception)?|expected|undefined|Traceback/i)?.[0];
    if (firstErrorWord && !reply.toLowerCase().includes(firstErrorWord.toLowerCase())) {
      reasons.push("ignores_error_context");
    }
  }

  if (questionRefersToEditor(question) && !mentionsFocusedContext(reply, input.selectedCodeContext)) {
    reasons.push("ignores_focused_line");
  }

  if (intent === "editor_inspection" && hasProvidedEditorContext(input.selectedCodeContext)) {
    const replyLower = reply.toLowerCase();
    const tokens = distinctiveContextTokens(input.selectedCodeContext);
    if (tokens.length > 0 && !tokens.some((token) => replyLower.includes(token))) {
      reasons.push("ignores_editor_context");
    }
  }

  if (
    asksForSourceAttribution(question) &&
    hasProvidedEditorContext(input.selectedCodeContext) &&
    claimsUnsupportedCodeVisibility(reply, input.selectedCodeContext)
  ) {
    reasons.push("unsupported_code_visibility_claim");
  }

  if (intent === "meta" || intent === "casual") {
    const replyLower = reply.toLowerCase();
    if (distinctiveContextTokens(input.selectedCodeContext).some((token) => replyLower.includes(token))) {
      reasons.push("context_misuse");
    }
  }

  if (intent === "casual" && CASUAL_CODE_ADVICE_PATTERNS.some((pattern) => pattern.test(reply))) {
    reasons.push("casual_code_advice");
  }

  if (
    intent === "editor_inspection" &&
    EDITOR_INSPECTION_ADVICE_PATTERNS.some((pattern) => pattern.test(reply))
  ) {
    reasons.push("editor_inspection_solution_advice");
  }

  const expectedLocale = likelyQuestionLocale(question);
  if (expectedLocale && replyLooksLikeLocaleMismatch(reply, expectedLocale)) {
    reasons.push("locale_mismatch");
  }

  if (asksForSmallestInputCase(question) && misreadsSmallestInputAsNumericLimit(reply)) {
    reasons.push("smallest_input_misread");
  }

  return { ok: reasons.length === 0, reasons };
}

export function isProbablyRepetitive(input: MentorQualityInput): boolean {
  return assessMentorReply(input).reasons.some((reason) =>
    ["generic_fallback", "echoes_question", "repeats_previous_reply"].includes(reason),
  );
}
