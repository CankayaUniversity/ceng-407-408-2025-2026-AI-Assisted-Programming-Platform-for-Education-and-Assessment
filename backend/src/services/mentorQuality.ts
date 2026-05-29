import { detectMentorIntent, type MentorContextScope } from "./mentorIntent";

export type MentorConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MentorQualityInput = {
  reply: string;
  studentQuestion?: string | null;
  studentCode?: string | null;
  selectedCodeContext?: string | null;
  stderr?: string | null;
  errorMessage?: string | null;
  conversationHistory?: MentorConversationMessage[] | null;
  contextScope?: MentorContextScope;
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
  /\bKullanıcı sadece\b/i,
  /\bKullanıcı\b.{0,80}\b(soruyor|istiyor)\b/i,
  /\bçözüm tavsiyesi, algoritma veya sonraki adım yazma\b/i,
  /\bThe user is only asking\b/i,
  /\bper the rules\b/i,
  /\bI cannot provide per\b/i,
  /\bmy instructions\b/i,
  /\bhidden policy\b/i,
  /\bvalidation\b/i,
];

const EDITOR_INSPECTION_ADVICE_PATTERNS = [
  /\bthink about\b/i,
  /\bfocus on\b/i,
  /\byou are (very )?close\b/i,
  /\bright track\b/i,
  /\bdynamic programming\b/i,
  /\bdp\s+table\b/i,
  /\brecurrence\b/i,
  /\bcell\b.{0,40}\b(previous|diagonal|top|left)\b/i,
  /\bcharacters? (match|don'?t match)\b/i,
  /\blcs\b/i,
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
  /\bmissing (a )?semicolon\b/i,
  /\bmissing ;\b/i,
  /\bsyntax error\b/i,
  /\bcompile[- ]time error\b/i,
  /\bwon'?t compile\b/i,
  /\bincomplete\b/i,
  /\bcheck if\b/i,
  /\bmake sure\b/i,
  /\blooks correct\b/i,
  /\beverything looks good\b/i,
  /\blogic (is|looks) (correct|sound|fine)\b/i,
  /\b(gerekiyor|gerekir|oluşturman|eklemen|yazman)\b/i,
  /\b(lazım|başlatman|yazdırman|eklemelisin|oluşturmalısın)\b/i,
  /\b(düşün|dusun|odaklan|yakınsın|yakinsin|doğru yoldasın|dogru yoldasin)\b/i,
  /\b(dinamik programlama|dp tablosu|tablo|hücre|hucre|recurrence|eşleşirse|eslesirse)\b/i,
  /\b(denemelisin|kullanmalısın|başlayabilirsin|ekleyebilirsin|yazabilirsin)\b/i,
  /\b(çözmüyor|hesaplamıyor|uygulama görünmüyor|kod yazılmamış|kontrol et|emin ol)\b/i,
  /\b(noktalı virgül|noktalı|semicolon|sözdizimi|syntax|derleme hatası|derlenmiyor|eksik)\b/i,
  /\ba\s*,\s*b\s*=/i,
  /\bmantık doğru\b/i,
  /\blogic is correct\b/i,
];

const CASUAL_CODE_ADVICE_PATTERNS = [
  /\b(input|print|for loop|while loop|recursion|factorial|palindrome|dynamic programming|algorithm|stdin|stdout|scanf|printf|fgets|dp|lcs|subsequence|table|current code|assignment)\b/i,
  /\b(use|try|start by|make sure|you need|you should|add|fix)\b.{0,50}\b(input|print|loop|recursion|code|algorithm|scanf|printf|fgets|semicolon|syntax|dp|table|assignment)\b/i,
  /\b(faktöriyel|palindrom|döngü|rekürsif|algoritma|girdi|çıktı|kod|noktalı virgül|derleme|satır|dp|lcs|tablo|ödev|problem)\b/i,
  /\b(kullanabilirsin|denemelisin|başlamalısın|yazmalısın|gerekiyor|lazım|ekle|düzelt)\b.{0,60}\b(input|print|kod|döngü|algoritma|girdi|çıktı|satır|noktalı virgül|derleme|dp|tablo|ödev|problem)\b/i,
];

const PRIOR_REPLY_ACKNOWLEDGEMENT_PATTERNS = [
  /\b(as before|same as before|still|again|previously|earlier|like I said|I still see|same visible|unchanged)\b/i,
  /\b(az önce|önceki|önceden|hala|hâlâ|yine|aynı)\b/i,
];

const TINY_VISIBLE_CONTEXT_CLAIM_PATTERNS = [
  /\bonly\b.{0,40}\bscanf\b/i,
  /\bonly\b.{0,40}\bthat line\b/i,
  /\bno other (code|code piece|line|part)\b/i,
  /\bthere is nothing else\b/i,
  /\bsadece\b.{0,40}\bscanf\b/i,
  /\bsadece\b.{0,40}\b(o|bu)?\s*satır\b/i,
  /\bbaşka hiçbir kod\b/i,
  /\bbaska hicbir kod\b/i,
  /\bbaşka bir kod parçası yok\b/i,
  /\bbaska bir kod parcasi yok\b/i,
];

const NO_CODE_AFTER_REFERENCE_PATTERNS = [
  /\bno\b.{0,40}\b(after|anything|code)\b/i,
  /\bnothing\b.{0,40}\bafter\b/i,
  /\bhiçbir şey yok\b/i,
  /\bhicbir sey yok\b/i,
  /\bbaşka hiçbir kod\b/i,
  /\bbaska hicbir kod\b/i,
  /\byok\b/i,
];

const CODE_REPEAT_INSPECTION_PATTERNS = [
  /\b(write|repeat|list)\b.*\b(what you see|visible lines|visible code|code visible|editor)\b/i,
  /\bgördüğün kodu yaz\b/i,
  /\bgordugun kodu yaz\b/i,
  /\bgörünen kodu yaz\b/i,
  /\bgorunen kodu yaz\b/i,
  /\bgörünen satırları listele\b/i,
  /\bgorunen satirlari listele\b/i,
];

const EDITOR_INSPECTION_EXTRA_ANALYSIS_PATTERNS = [
  /\bmissing (a )?semicolon\b/i,
  /\bsyntax error\b/i,
  /\bincomplete\b/i,
  /\bthere is no\b/i,
  /\bdoes not\b/i,
  /\bnoktalı virgül\b/i,
  /\bsemicolon\b/i,
  /\beksik\b/i,
  /\bhata\b/i,
  /\bgörünmüyor\b/i,
  /\bgozukmuyor\b/i,
];

const EDITOR_REFERENCE_PATTERNS = [
  /\b(editor|my code|code|line|cursor|error|compile|runtime|output|look at|take a look|check|inspect|debug)\b/i,
];

const EDITOR_CONTEXTUAL_POINTER_PATTERNS = [
  /\b(this|here)\b/i,
  /\b(code|line|error|output|editor)\b/i,
];

const SOURCE_ATTRIBUTION_PATTERNS = [
  /\b(from my code|from the assignment|assuming|seeing it|do you see|did i already do that|should i change my code)\b/i,
  /\b(kodumda mı|ödevden mi|varsayıyor musun|görüyor musun|zaten yaptım mı|değiştirmeli miyim)\b/i,
];

const CODE_VISIBILITY_CLAIM_PATTERNS = [
  /\b(i see|i am seeing|i'm seeing|visible in your code|in your code|in the editor)\b/i,
  /\b(kodunda görüyorum|kodunda var|editörde görüyorum|görünüyor)\b/i,
];

const ASSIGNMENT_EDIT_HINT_PATTERNS = [
  /n\s*=\s*int\s*\(\s*input\s*\(\s*\)\s*\)/i,
  /\b(input|print)\s*\(/i,
  /\b(for|while)\b.+:/i,
  /\bprintf\s*\(/i,
  /\bscanf\s*\(/i,
];

const TURKISH_QUESTION_LOCALE_PATTERNS = [
  /[çğıöşü]/i,
  /\b(merhaba|selam|naber|nasılsın|teşekkür|nedir|ne yapar|nasıl|neden|hangi|kimsin|kodumda|editörde|görüyor|musun|verir misin|açıklar mısın|çıktı|girdi|döngü|koşul|fonksiyon|değişken|örnek|basit|sınır durum|zor)\b/i,
  /\b(naber|nasilsin|tesekkur|nedir|ne yapar|nasil|neden|hangi|kimsin|kodumda|editorde|goruyor|musun|verir misin|aciklar misin|cikti|girdi|dongu|kosul|fonksiyon|degisken|ornek|basit|sinir durum|zor|ver)\b/i,
];

const ENGLISH_QUESTION_LOCALE_PATTERN =
  /\b(what|which|who|how|why|can|could|do|does|did|is|are|am|write|give|just|hello|hi|thanks|review|check|explain|show|tell|should|where|exactly|mean|understand|output|input|format|error|code|editor|line|function|loop|array|condition|recursion)\b/i;

const TURKISH_REPLY_SIGNAL_PATTERNS = [
  /[çğıöşü]/i,
  /\b(merhaba|selam|tabii|evet|hayır|çünkü|kodun|kodunda|kodunuz|şu anda|gerekiyor|lazım|örneğin|sonra|önce|cevap|girdi|çıktı|satır|hata|döngü|koşul|fonksiyon|değişken|dizi|kelime|sayısı|olmalı|yazdırmalısın|eklemelisin|görünüyor|görüyorum|anlamına gelir)\b/i,
];

const ENGLISH_REPLY_SIGNAL_PATTERNS = [
  /\b(i can|i am|i'm|you are|you need|you should|the code|the editor|that reads|hello|hi|you're welcome|this means|for example|current code|visible code|line|function|variable|array|loop|condition|output|input|a simple test case|comment line)\b/i,
  /\b(in python|reads a line|removes|leading|trailing|whitespace|sample input|expected output|simple test case|this checks)\b/i,
  /\b(missing|semicolon|syntax error|compile error|current code|visible lines)\b/i,
];

const LOGIC_MISTAKE_QUESTION_PATTERNS = [
  /logic mistake/i,
  /mantık hatası/i,
  /mantik hatasi/i,
];

const FALSE_LOGIC_CLEARANCE_PATTERNS = [
  /\b(no logic mistakes?|no logic issue|logic is correct)\b/i,
  /\b(mantık hatası yok|mantik hatasi yok|mantık doğru|mantik dogru)\b/i,
];

const IMPLEMENTED_LOGIC_CONTEXT_PATTERNS = [
  /\b(for|while|printf|cout|print\s*\()\b/i,
];

const LINE_REFERENCE_REPLY_PATTERN = /\bline\s+\d+/i;
const ASCII_ENGLISH_QUESTION_PATTERN = /^[a-z0-9\s'?.!,`():;"_-]+$/i;
const NON_TARGET_SCRIPT_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const ERROR_CONTEXT_QUESTION_PATTERN = /error|compile|runtime|exception|traceback|stderr/i;
const FIRST_ERROR_WORD_PATTERN = /[A-Za-z_][A-Za-z0-9_]*(Error|Exception)?|expected|undefined|Traceback/i;

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

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
  return matchesAny(reply, PRIOR_REPLY_ACKNOWLEDGEMENT_PATTERNS);
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

  return reply.toLowerCase().includes(firstIdentifier.toLowerCase()) || LINE_REFERENCE_REPLY_PATTERN.test(reply);
}

type VisibleLine = {
  number: number;
  code: string;
};

function parseVisibleLines(context?: string | null): VisibleLine[] {
  const raw = context ?? "";
  if (!raw.trim()) return [];

  return raw
    .split(/\r?\n/)
    .map((line, index) => {
      const numbered = line.match(/^\s*[> ]?\s*(\d+):\s?(.*)$/);
      return numbered
        ? { number: Number(numbered[1]), code: numbered[2] ?? "" }
        : { number: index + 1, code: line };
    })
    .filter((line) => line.code.trim());
}

function combinedEditorContext(input: MentorQualityInput): string {
  return [input.selectedCodeContext, input.studentCode].filter((part) => part?.trim()).join("\n");
}

function claimsOnlyTinyVisibleContext(reply: string, context: string): boolean {
  const visibleLines = parseVisibleLines(context);
  if (visibleLines.length < 3) return false;

  return matchesAny(reply, TINY_VISIBLE_CONTEXT_CLAIM_PATTERNS);
}

function claimsNoCodeAfterReferencedLine(question: string, reply: string, context: string): boolean {
  const visibleLines = parseVisibleLines(context);
  if (visibleLines.length === 0) return false;

  const lineNumber =
    question.match(/\bafter line\s+(\d+)\b/i)?.[1] ??
    question.match(/\b(\d+)\.\s*satırdan sonra\b/i)?.[1] ??
    question.match(/\b(\d+)\s*satırdan sonra\b/i)?.[1];

  if (!lineNumber) return false;
  const target = Number(lineNumber);
  if (!Number.isFinite(target)) return false;

  const hasCodeAfterTarget = visibleLines.some((line) => line.number > target && line.code.trim());
  if (!hasCodeAfterTarget) return false;

  return matchesAny(reply, NO_CODE_AFTER_REFERENCE_PATTERNS);
}

function isCodeRepeatInspection(question: string): boolean {
  return matchesAny(question, CODE_REPEAT_INSPECTION_PATTERNS);
}

function hasEditorInspectionExtraAnalysis(question: string, reply: string): boolean {
  if (!isCodeRepeatInspection(question)) return false;

  return matchesAny(reply, EDITOR_INSPECTION_EXTRA_ANALYSIS_PATTERNS);
}

function questionRefersToEditor(question: string): boolean {
  const explicitEditorReference = matchesAny(question, EDITOR_REFERENCE_PATTERNS);
  const contextualPointer = EDITOR_CONTEXTUAL_POINTER_PATTERNS.every((pattern) => pattern.test(question));

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
  return matchesAny(question, SOURCE_ATTRIBUTION_PATTERNS);
}

function claimsUnsupportedCodeVisibility(reply: string, context?: string | null): boolean {
  const normalizedContext = (context ?? "").toLowerCase();
  const lower = reply.toLocaleLowerCase("tr-TR");

  const claimsSeeingCode = matchesAny(reply, CODE_VISIBILITY_CLAIM_PATTERNS) || matchesAny(lower, CODE_VISIBILITY_CLAIM_PATTERNS);

  if (!claimsSeeingCode) return false;

  const codeFragments = reply.match(/`([^`]+)`/g)?.map((fragment) => fragment.replace(/`/g, "").trim()) ?? [];
  return (
    codeFragments.some((fragment) => fragment && !normalizedContext.includes(fragment.toLowerCase())) ||
    ASSIGNMENT_EDIT_HINT_PATTERNS.some((pattern) => pattern.test(reply) && !pattern.test(normalizedContext))
  );
}

function likelyQuestionLocale(question: string): "en" | "tr" | null {
  const lower = question.toLocaleLowerCase("tr-TR");

  if (matchesAny(lower, TURKISH_QUESTION_LOCALE_PATTERNS)) {
    return "tr";
  }

  if (
    ASCII_ENGLISH_QUESTION_PATTERN.test(question) &&
    ENGLISH_QUESTION_LOCALE_PATTERN.test(question)
  ) {
    return "en";
  }

  return null;
}


function replyLooksLikeLocaleMismatch(reply: string, locale: "en" | "tr"): boolean {
  const plainReply = reply
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\b[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)/g, " ");
  const lower = plainReply.toLocaleLowerCase("tr-TR");

  if (locale === "en") {
    return matchesAny(plainReply, TURKISH_REPLY_SIGNAL_PATTERNS);
  }

  return matchesAny(plainReply, ENGLISH_REPLY_SIGNAL_PATTERNS);
}


export function assessMentorReply(input: MentorQualityInput): MentorQualityResult {
  const reply = input.reply.trim();
  const question = (input.studentQuestion ?? "").trim();
  const intent = detectMentorIntent(question);
  const contextScope = input.contextScope;
  const isChatScope = contextScope ? contextScope === "chat" : intent === "casual" || intent === "meta";
  const isEditorScope = contextScope ? contextScope === "editor" : intent === "editor_inspection";
  const isRuntimeScope = contextScope ? contextScope === "runtime" : intent === "runtime";
  const hasErrorContext = Boolean((input.stderr || input.errorMessage || "").trim());
  const reasons: string[] = [];

  if (!reply) reasons.push("empty");

  if (NON_TARGET_SCRIPT_PATTERN.test(reply)) {
    reasons.push("non_target_script");
  }

  if (matchesAny(reply, TRANSCRIPT_PATTERNS)) {
    reasons.push("transcript_artifact");
  }

  const genericHits = GENERIC_PATTERNS.filter((pattern) => pattern.test(reply)).length;
  const questionWordCount = question.split(/\s+/).filter(Boolean).length;

  if (genericHits >= 2 && questionWordCount > 4) {
    reasons.push("generic_fallback");
  }

  if (question && echoesQuestion(reply, question)) {
    reasons.push("echoes_question");
  }

  for (const previous of lastAssistantReplies(input.conversationHistory)) {
    if (jaccardSimilarity(reply, previous) >= 0.72) {
      if (intent === "editor_inspection") {
        break;
      }

      reasons.push("repeats_previous_reply");
      break;
    }
  }

  if (hasErrorContext && ERROR_CONTEXT_QUESTION_PATTERN.test(question)) {
    const firstErrorWord = (input.stderr || input.errorMessage || "")
      .match(FIRST_ERROR_WORD_PATTERN)?.[0];

    if (firstErrorWord && !reply.toLowerCase().includes(firstErrorWord.toLowerCase())) {
      reasons.push("ignores_error_context");
    }
  }

  if (questionRefersToEditor(question) && !mentionsFocusedContext(reply, input.selectedCodeContext)) {
    reasons.push("ignores_focused_line");
  }

  if (isEditorScope && hasProvidedEditorContext(input.selectedCodeContext)) {
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

  if (isChatScope) {
    const replyLower = reply.toLowerCase();

    if (distinctiveContextTokens(input.selectedCodeContext).some((token) => replyLower.includes(token))) {
      reasons.push("context_misuse");
    }
  }

  if (isChatScope && matchesAny(reply, CASUAL_CODE_ADVICE_PATTERNS)) {
    reasons.push("casual_code_advice");
  }

  if (
    isEditorScope &&
    matchesAny(reply, EDITOR_INSPECTION_ADVICE_PATTERNS)
  ) {
    reasons.push("editor_inspection_solution_advice");
  }

  if (isEditorScope) {
    const editorContext = combinedEditorContext(input);

    if (claimsOnlyTinyVisibleContext(reply, editorContext)) {
      reasons.push("collapses_editor_context");
    }

    if (claimsNoCodeAfterReferencedLine(question, reply, editorContext)) {
      reasons.push("wrong_no_code_after_reference");
    }

    if (hasEditorInspectionExtraAnalysis(question, reply)) {
      reasons.push("editor_inspection_extra_analysis");
    }
  }

  if (
    isRuntimeScope &&
    !hasErrorContext &&
    matchesAny(reply, [
      /\b(the output is|it prints|it passes|passed|works as expected)\b/i,
      /\b(çıktı şudur|şunu yazdırır|geçti|başarılı|çalışıyor)\b/i,
    ])
  ) {
    reasons.push("runtime_guess");
  }

  if (
    matchesAny(question, LOGIC_MISTAKE_QUESTION_PATTERNS) &&
    matchesAny(reply, FALSE_LOGIC_CLEARANCE_PATTERNS) &&
    !matchesAny(combinedEditorContext(input), IMPLEMENTED_LOGIC_CONTEXT_PATTERNS)
  ) {
    reasons.push("false_logic_clearance");
  }

  const expectedLocale = likelyQuestionLocale(question);

  if (expectedLocale && replyLooksLikeLocaleMismatch(reply, expectedLocale)) {
    reasons.push("locale_mismatch");
  }

  return { ok: reasons.length === 0, reasons };
}


export function isProbablyRepetitive(input: MentorQualityInput): boolean {
  return assessMentorReply(input).reasons.some((reason) =>
    ["generic_fallback", "echoes_question", "repeats_previous_reply"].includes(reason),
  );
}
