import { normalizeText } from "./mentorContext";
import type { MentorLocale, MentorRequestInput } from "./mentorTypes";

const TURKISH_CHARACTER_PATTERN = /[çğıöşüÇĞİÖŞÜ]/;

const TURKISH_LOCALE_PATTERNS = [
  /\b(merhaba|selam|naber|ne haber|nhbr|slm|mrb|hey|günaydın|gunaydin|tünaydın|tunaydin|iyi günler|iyi gunler|iyi akşamlar|iyi aksamlar|iyi geceler)\b/,
  /\b(teşekkür|tesekkur|tsk|tşk|sağol|sagol|sağ ol|sag ol|teşekkürler|tesekkurler|müteşekkirim|minnettarım|eyvallah|eyv|hadi bay|hoşça kal|hosca kal|güle güle|gule gule|görüüşürüz|gorusuruz|bye|byby)\b/,
  /\b(tamam|olur|peki|anladım|anladim|evet|hayır|hayir|yani|aynen|kesinlikle|tabii|tabi|tabiki|tabii ki|haklısın|haklisin|aynen öyle|aynen oyle|şüphesiz|suphesiz|asla|hiçbir zaman|hicbir zaman|maalesef|malesef|yok|cık|naş|neyse|neyse ne)\b/,
  /\b(nedir|ne yapar|nasıl|nasil|neden|niye|niçin|nicin|hangi|ne demek|anlamadım|anlamadim|ne alaka|kim|nerede|nerde|nereye|hangisi|kaça|kaca|kaç|kac|ne zaman|ne kadar|nasıl yani|nasil yani|anlamı ne|anlami ne|açıklar mısın|aciklar misin)\b/,
  /\b(kodumda|kodda|editörde|editorde|gördüğün|gordugun|başka|baska|döngü|dongu|görüyor musun|goruyor musun|bak bakayım|bak bakayim|koduma bak|koda bak|bendeki|ekrandaki|dosyadaki|aktif|sekmedeki|kod satırı|kod satiri|açık olan|acik olan|yazılı olan|yazili olan|içerik|icerik|kod bloğu|kod blogu|script|fonksiyon|class|sınıf|sinif|değişken|degisken)\b/,
  /\b(hangi model|modelin ne|modelin nedir|model adını|model adini|model ismin|kimsin|ne yapabilirsin|nesin|yapay zeka mısın|yapay zeka misin|bot musun|gpt|gemini|llama|claude|kim tarafından|kim tarafindan|yaratıcın|yaraticin|görevin ne|gorevin ne|amacın ne|amacin ne)\b/,
  /\b(sadece|ipucu|çözmeden|cozmeden|yönlendir|yonlendir|örnek|ornek|girdi|çıktı|cikti|girinti|mantık|mantik|satır|satir|soru|hata|çözüm|cozum|kodlama|bana ipucu ver|çözme|cozme|doğrudan söyleme|dogrudan soyleme|kopya verme|taktik|taktik ver|adım adım|adim adim|yol göster|yol goster)\b/,
  /\b(miyim|misin|mısın|musun|müsün|miyiz|misiniz|mısınız|musunuz|müsünüz|mi|mı|mu|mü|basit|ver|denemem|gereken|sınır durum|sinir durum|edge case|en basit|kısa|kisa|özet|ozet|özetle|detaylı|detayli|uzun uzun|açıkla|acikla|anlat)\b/,
  /\b(tmm|okey|kb|kby|hll|helal|brb|asl|sa|as|sajen|aynn|hyr|evt|tmmdir|tamamdır|eyv|reiz|reis|hocam|usta|üstad|ustad|bro|kanka|kanks|dostum|baba|aga|be|ya|yahu|panpa|pampa)\b/,
  /\b(çalışmıyor|calismiyor|hata veriyor|patladı|patladi|çöktü|coktu|error|bug|uyarı|uyari|warning|exception|hata mesajı|hata mesaji|null pointer|sonsuz döngü|sonsuz dongu|derlenmiyor|compile olmuyor|run etmiyor|ekrana basmıyor|ekrana basmiyor|yanlış çıktı|yanlis cikti|boş dönüyor|bos donuyor)\b/,
  /\b(yaz|düzelt|duzelt|geliştir|gelistir|optimize et|hızlandır|hizlandir|kontrol et|incele|göz at|goz at|baksana|bul|söyle|soyle|çevir|cevir|dönüştür|donustur|refactor et|temizle|sadeleştir|sadelestir|tamamla|doldur)\b/,
];

const STRONG_ENGLISH_LOCALE_PATTERN =
  /\b(what|which|who|how|why|can|could|do|does|did|is|are|am|write|give|just|hello|hi|thanks|review|check|explain|show|tell|should|where|exactly|mean|understand|output|input|format|error|code|editor|line|function|loop|array|condition|recursion|pointer|variable|syntax|debug|compile|print|return|class|method|object|test|run|issue|fix|help|hint|step|example)\b/i;

const ENGLISH_LOCALE_PATTERNS = [
  /\b(what|which|who|how|why|can|could|do|does|did|is|are|am|was|were|will|would|should|write|give|just|hello|hi|thanks|thank you|please|hey|sup|greet|greetings)\b/,
  /\b(explain|review|check|show|tell|print|display|list|copy|find|get|set|make|create|build|run|test|debug|fix|solve|optimize|refactor|clean|help|hint|suggest)\b/,
  /\b(code|editor|file|line|text|word|char|string|int|float|bool|variable|constant|array|list|vector|map|dict|tuple|set|struct|class|object|method|function|return)\b/,
  /\b(loop|for|while|if|else|switch|case|condition|break|continue|error|exception|bug|issue|fault|crash|fail|wrong|output|input|format|syntax|exactly|mean|understand)\b/,
];

const ASCII_ENGLISH_MESSAGE_PATTERN = /^[a-zA-Z0-9\s'?.!,`():;"_\-\+\*\/\\&%@#\[\]{}<>|=~\$\^]+$/;

const SHORT_AMBIGUOUS_MESSAGE_PATTERN =
  /^(ok|okay|oke|tamam|tmm|peki|olur|devam|aynen|evet|hayır|hayir|same question|same|again|tekrar|bunu|şunu|sunu|onu|c de|python da|js de|java da|anlat|açıkla|acikla)$/i;

const SYSTEM_ARTIFACT_PATTERNS = [
  /\bP\.S\./i,
  /\bassignment\s+statistics\b/i,
  /\busing\s+(me\s+as\s+)?(a\s+)?mentor\s+(may|might|can)\s+(affect|impact)\b/i,
  /\bmentor\s+support\s+may\s+(affect|impact)\b/i,
  /\busage\/scoring\b/i,
  /\busage\s+(stats|statistics|score|scoring)\b/i,
  /\bödev\s+istatistiklerine\b/i,
  /\bmentor\s+desteği\b.*\bistatistik\b/i,
  /\bpuana\/istatistiğe\b/i,
];

const TURKISH_PROSE_PATTERNS = [
  TURKISH_CHARACTER_PATTERN,
  /\b(ama|çünkü|cunku|eğer|eger|şimdi|simdi|bunu|böyle|boyle|değil|degil|gerekiyor|gerekir)\b/i,
  /\b(yapmalısın|yapmalisin|deneyebilirsin|dikkat|cevap|ödev|odev|soru|kodun|istersen|dönebiliriz|donebiliriz)\b/i,
  /\b(kullanım|kullanim|puan|puanlama|istatistik|etkileşim|etkilesim|hatırlat|hatirlat)\b/i,
];

const ENGLISH_PROSE_PATTERNS = [
  /\b(you|your|you're|youre|we|let's|lets)\b/i,
  /\b(should|need to|try to|make sure|because|means|it means|this means)\b/i,
  /\b(if you|when you|you can|we can|the answer|the code|the problem)\b/i,
  /\b(remember|feel free|assignment|scoring|usage|question|output|input)\b/i,
];

const COMMON_ENGLISH_PROSE_PATTERN =
  /\b(the|this|that|these|those|is|are|was|were|means|because|when|while|with|without|usually|example|for|from|into|your|you|it|can|should|would|could|need|try|answer|question|code|problem)\b/gi;

const COMMON_TURKISH_PROSE_PATTERN =
  /\b(bu|şu|su|o|bir|ve|veya|ama|çünkü|cunku|için|icin|ile|gibi|olarak|nedir|neden|nasıl|nasil|hangi|zaman|gerekir|demek|anlama|gelir|cevap|soru|kod|problem|örnek|ornek)\b/gi;

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function shouldInheritRecentLocale(rawQuestion: string): boolean {
  const text = normalizeText(rawQuestion);
  if (!text) return true;

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return wordCount <= 2 || SHORT_AMBIGUOUS_MESSAGE_PATTERN.test(text);
}

function inferLocaleFromText(rawText: string): MentorLocale | null {
  const text = normalizeText(rawText);
  if (!text) return null;

  const lowerTr = text.toLocaleLowerCase("tr-TR");
  const lowerEn = text.toLowerCase();

  if (TURKISH_CHARACTER_PATTERN.test(text)) return "tr";
  if (TURKISH_LOCALE_PATTERNS.some((pattern) => pattern.test(lowerTr))) return "tr";

  const strongEnglish =
    ASCII_ENGLISH_MESSAGE_PATTERN.test(text) &&
    STRONG_ENGLISH_LOCALE_PATTERN.test(text);
  if (strongEnglish || ENGLISH_LOCALE_PATTERNS.some((pattern) => pattern.test(lowerEn))) {
    return "en";
  }

  return null;
}

function inferRecentUserLocale(input: MentorRequestInput): MentorLocale | null {
  const recentUserMessages = (input.conversationHistory ?? [])
    .filter((message) => message.role === "user")
    .slice(-5);

  let tr = 0;
  let en = 0;

  for (const message of recentUserMessages) {
    const locale = inferLocaleFromText(message.content);
    if (locale === "tr") tr += 1;
    if (locale === "en") en += 1;
  }

  if (tr > en) return "tr";
  if (en > tr) return "en";
  return null;
}

export function inferMentorLocale(input: MentorRequestInput): MentorLocale {
  const rawQuestion = normalizeText(input.studentQuestion);
  const question = rawQuestion.toLocaleLowerCase("tr-TR");
  const englishQuestion = rawQuestion.toLowerCase();
  const strongEnglish =
    ASCII_ENGLISH_MESSAGE_PATTERN.test(rawQuestion) &&
    STRONG_ENGLISH_LOCALE_PATTERN.test(rawQuestion);

  if (TURKISH_CHARACTER_PATTERN.test(rawQuestion)) return "tr";
  if (TURKISH_LOCALE_PATTERNS.some((pattern) => pattern.test(question))) return "tr";
  if (strongEnglish && !shouldInheritRecentLocale(rawQuestion)) return "en";

  const inheritedLocale = inferRecentUserLocale(input);
  if (shouldInheritRecentLocale(rawQuestion) && inheritedLocale) return inheritedLocale;
  if (strongEnglish) return "en";
  if (ENGLISH_LOCALE_PATTERNS.some((pattern) => pattern.test(englishQuestion))) return "en";
  if (inheritedLocale) return inheritedLocale;
  return input.mentorLocale === "tr" ? "tr" : "en";
}

function countPatternMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function stripProtectedLanguageText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)/g, " ");
}

function countRegexMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function proseLooksMostlyEnglish(text: string): boolean {
  const englishHits = countRegexMatches(text, COMMON_ENGLISH_PROSE_PATTERN);
  const turkishHits = countRegexMatches(text, COMMON_TURKISH_PROSE_PATTERN);
  return englishHits >= 4 && englishHits >= turkishHits + 2;
}

function proseLooksMostlyTurkish(text: string): boolean {
  const englishHits = countRegexMatches(text, COMMON_ENGLISH_PROSE_PATTERN);
  const turkishHits = countRegexMatches(text, COMMON_TURKISH_PROSE_PATTERN);
  return turkishHits >= 4 && turkishHits >= englishHits + 2;
}

function hasSystemArtifact(reply: string): boolean {
  return matchesAny(reply, SYSTEM_ARTIFACT_PATTERNS);
}

export function languageRepairReason(input: MentorRequestInput, reply: string): string | null {
  const targetLocale = inferMentorLocale(input);
  const prose = stripProtectedLanguageText(reply);

  if (hasSystemArtifact(reply)) return "system_artifact_in_reply";

  if (targetLocale === "en") {
    const turkishHits = countPatternMatches(prose, TURKISH_PROSE_PATTERNS);
    if (proseLooksMostlyTurkish(prose)) return "turkish_reply_to_english_question";
    return turkishHits > 0 ? "turkish_text_in_english_reply" : null;
  }

  const englishHits = countPatternMatches(prose, ENGLISH_PROSE_PATTERNS);
  if (proseLooksMostlyEnglish(prose)) return "english_reply_to_turkish_question";
  return englishHits >= 2 ? "english_text_in_turkish_reply" : null;
}

export function buildLanguageRepairPrompt(targetLocale: MentorLocale, mentorReply: string): string {
  const targetLanguage = targetLocale === "tr" ? "Turkish" : "English";
  const targetInstruction =
    targetLocale === "tr"
      ? "Rewrite the answer in natural Turkish only."
      : "Rewrite the answer in natural English only.";

  return [
    "You are a language cleanup pass for an AI programming mentor.",
    targetInstruction,
    "Keep the same meaning, same amount of help, same tone, and same boundaries.",
    "Do not add new advice, new examples, new warnings, new questions, or new solution steps.",
    "Remove any P.S., assignment statistics, usage/scoring, product-policy, or hidden-system artifact entirely.",
    "Do not remove existing useful content unless it is only a duplicate language-mixing artifact or system artifact.",
    "Preserve code blocks, inline code, API names, function names, command names, filenames, and exact error/output text.",
    `Target language: ${targetLanguage}.`,
    "",
    "Original mentor answer:",
    "<<<",
    mentorReply,
    ">>>",
    "",
    "Cleaned mentor answer:",
  ].join("\n");
}
