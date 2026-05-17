import { validateMentorReply, type ValidatorResult } from "./validator";
import { getMentorReply, inferMentorLocale, type MentorRequestInput } from "./mentor";
import { detectMentorIntent } from "./mentorIntent";
import { assessMentorReply } from "./mentorQuality";

export type PolicyResult = {
  action: "allow" | "rewrite" | "block";
  finalText: string;
  rewriteCount: number;
  finalValidator?: ValidatorResult | null;
};

const MAX_REPAIR_ATTEMPTS = 1;

function hasAny(violations: string[], names: string[]): boolean {
  return violations.some((violation) => names.includes(violation));
}

export async function validateMentorReplyWithQuality(
  input: MentorRequestInput,
  mentorReply: string,
): Promise<ValidatorResult> {
  const validator = await validateMentorReply({
    studentQuestion: input.studentQuestion ?? "",
    mentorReply,
    runStatus: input.runStatus ?? "",
  });

  const quality = assessMentorReply({
    reply: mentorReply,
    studentQuestion: input.studentQuestion,
    selectedCodeContext: input.selectedCodeContext,
    stderr: input.stderr,
    errorMessage: input.errorMessage,
    conversationHistory: input.conversationHistory,
  });

  if (quality.ok) return validator;

  const qualityViolations = quality.reasons.map((reason) => `quality_${reason}`);

  return {
    ...validator,
    riskScore: Math.max(validator.riskScore, 0.58),
    decision: validator.decision === "block" ? "block" : "rewrite",
    violations: [...new Set([...validator.violations, ...qualityViolations])],
    reason: [
      validator.reason,
      `Quality check failed: ${quality.reasons.join(", ")}`,
    ]
      .filter(Boolean)
      .join(" | "),
    source: validator.decision === "allow" ? "heuristic" : validator.source,
  };
}


function buildRepairInstruction(input: MentorRequestInput, validator: ValidatorResult): string {
  const locale = inferMentorLocale(input);
  const intent = detectMentorIntent(input.studentQuestion);
  const violations = validator.violations;
  const repairNotes: string[] = [];
  const addRepairNote = (en: string, tr: string) => {
    repairNotes.push(locale === "tr" ? tr : en);
  };

  if (
    intent === "solution" ||
    hasAny(violations, [
      "explicit_solution_language",
      "solution_seek_leak",
      "solution_seek_exact_fix",
    ])
  ) {
    addRepairNote(
      "The answer was too close to a final solution or the user asked for the final answer. Refuse briefly in a natural mentor voice, give only a conceptual direction, and include no code or exact final edit.",
      "Cevap final çözüme fazla yakındı veya kullanıcı final cevabı istedi. Doğal bir mentor tonuyla kısa reddet, sadece kavramsal yön ver; kod ya da birebir final düzenleme verme.",
    );
  }

  if (hasAny(violations, ["almost_code_too_complete", "almost_code_exact_fragment"])) {
    addRepairNote(
      "The answer gave too much assignment-specific almost-code. Rewrite it in 1-3 short sentences, preserve the requested form at a high level, and make it conceptual rather than copy-paste-ready. Avoid concrete final-solution syntax such as #include, main, scanf, printf, for (...), if (...), return 0, or exact assignment/update lines.",
      "Cevap ödeve özel neredeyse-kod olarak fazla ileri gitti. 1-3 kısa cümlede yeniden yaz; istenen formu yüksek seviyede koru ve kopyalanabilir değil kavramsal yap. #include, main, scanf, printf, for (...), if (...), return 0 veya birebir atama/güncelleme satırları gibi final çözüme yakın syntax kullanma.",
    );
  }

  if (hasAny(violations, ["quality_smallest_input_misread"])) {
    addRepairNote(
      "The answer interpreted smallest input as a numeric data-type limit. Rewrite it as the smallest valid test case shape; for N-based list problems, that means N is 1 and one value follows. Do not mention INT_MIN or integer ranges.",
      "Cevap en küçük girdiyi veri tipinin sayısal sınırı gibi yorumladı. En küçük geçerli test case biçimi olarak yeniden yaz; N tabanlı liste problemlerinde bu N'nin 1 olması ve ardından bir değer gelmesi demektir. INT_MIN veya integer aralığı anlatma.",
    );
  }

  if (hasAny(violations, ["context_misuse", "quality_context_misuse", "quality_casual_code_advice"])) {
    addRepairNote(
      "The answer used code or assignment context when the user asked a casual/meta question. Answer only the user's actual casual/meta question.",
      "Cevap, kullanıcı gündelik veya meta bir şey sormuşken kod/ödev bağlamına kaydı. Sadece kullanıcının gerçek gündelik/meta sorusunu yanıtla.",
    );
  }

  if (hasAny(violations, ["editor_inspection_advice", "quality_editor_inspection_solution_advice", "quality_unsupported_code_visibility_claim"])) {
    addRepairNote(
      "The user asked what is visible in the editor. Only report what is visible/provided; do not suggest changes, next steps, missing logic, or correctness.",
      "Kullanıcı editörde ne göründüğünü sordu. Sadece görünen/verilen şeyi söyle; değişiklik, sonraki adım, eksik mantık veya doğruluk yorumu ekleme.",
    );
  }

  if (hasAny(violations, ["runtime_guess"])) {
    addRepairNote(
      "The answer guessed runtime/output behavior. Only use provided terminal/stdout/stderr/run status; if it is idle, do not invent output.",
      "Cevap çalışma/çıktı davranışını tahmin etti. Sadece verilen terminal/stdout/stderr/run status bilgisini kullan; idle ise çıktı uydurma.",
    );
  }

  if (hasAny(violations, ["generic_fallback"])) {
    addRepairNote(
      "The answer sounded generic. Answer the specific latest question directly using the available context.",
      "Cevap fazla genel kaldı. Mevcut bağlamı kullanarak son soruyu doğrudan yanıtla.",
    );
  }


  if (hasAny(violations, ["quality_locale_mismatch"])) {
    addRepairNote(
      "The answer used the wrong language. Rewrite the entire answer in English only. Do not use Turkish words or Turkish sentence structure unless quoting exact user text.",
      "Cevap yanlış dildeydi. Cevabın tamamını yalnızca Türkçe yeniden yaz. Kod, hata mesajı, API adları veya birebir alıntı dışında İngilizce cümle kullanma.",
    );
  }

  if (hasAny(violations, ["quality_ignores_error_context"])) {
    addRepairNote(
      "The answer ignored the provided error context. Address the actual error/output context directly; do not answer a previous or unrelated question.",
      "Cevap verilen hata bağlamını dikkate almadı. Önceki veya alakasız bir soruyu değil, mevcut hata/çıktı bağlamını doğrudan yanıtla.",
    );
  }

  if (hasAny(violations, ["quality_transcript_artifact"])) {
    addRepairNote(
      "The answer included transcript or system-like artifacts. Remove labels and answer naturally.",
      "Cevap transcript veya sistem benzeri etiketler içerdi. Etiketleri çıkar ve doğal cevap ver.",
    );
  }


  if (hasAny(violations, ["overly_long_response", "assignment_walkthrough"])) {
    addRepairNote(
      "The answer was too long or broad. Keep it focused on the immediate question in 1-4 short sentences.",
      "Cevap fazla uzun veya genişti. 1-4 kısa cümlede sadece anlık soruya odaklan.",
    );
  }

  if (hasAny(violations, ["internal_policy_narration"])) {
    addRepairNote(
      "The answer mentioned hidden rules, policy, validation, or talked about the user in third person. Remove that and speak directly.",
      "Cevap gizli kurallardan, policy/validation’dan bahsetti veya kullanıcıdan üçüncü şahıs gibi söz etti. Bunları çıkar ve doğrudan kullanıcıya konuş.",
    );
  }
  if (hasAny(violations, ["quality_locale_mismatch", "locale_mismatch"])) {
    addRepairNote(
      "The previous answer used the wrong language. Rewrite the entire answer in English only. Do not use Turkish words or Turkish sentence structure unless quoting exact user text.",
      "Önceki cevap yanlış dildeydi. Cevabın tamamını yalnızca Türkçe yeniden yaz. Kod, hata mesajı, API adları veya birebir alıntı dışında İngilizce cümle kullanma.",
    );
  }
  if (hasAny(violations, ["quality_locale_mismatch"])) {
    addRepairNote(
      "The answer used the wrong language. Preserve the latest user's language exactly.",
      "Cevap yanlış dildeydi. Son kullanıcı mesajının dilini aynen koru.",
    );
  }
  if (hasAny(violations, ["quality_non_target_script"])) {
    addRepairNote(
      "The answer contained characters from the wrong writing system. Rewrite using only the target response language, except code/API names.",
      "Cevap yanlış yazı sisteminden karakterler içerdi. Kod/API adları dışında yalnızca hedef cevap dilini kullanarak yeniden yaz.",
    );
  }

  const notes = repairNotes.length
    ? repairNotes
    : [
        locale === "tr"
          ? "Önceki cevap validation’dan geçmedi. Son kullanıcı sorusuna doğal bir mentor cevabı olarak yeniden yaz."
          : "The previous answer failed validation. Rewrite it as a natural mentor answer to the latest user question.",
      ];

  if (locale === "tr") {
    return [
      "Önceki mentor cevabını yeniden yaz.",
      "LANGUAGE LOCK: Cevabı yalnızca Türkçe yaz. Kod, hata mesajı, API adları, fonksiyon adları ve birebir alıntılar dışında İngilizce cümle kullanma.",
      "Validator, policy, gizli kural, risk skoru veya bu repair yönergesinden bahsetme.",
      "Kullanıcıdan 'öğrenci şunu sordu' diye üçüncü şahısla bahsetme; doğrudan kullanıcıya konuş.",
      "Mentor reply, AI response veya Student gibi etiketler yazma.",
      "Son kullanıcı mesajı Türkçeyse önceki konuşma İngilizce olsa bile Türkçe cevap ver.",
      "Bu repair yalnızca bir kez denenir; cevabı 1-3 kısa cümlede kısalt ve gerekiyorsa soyutlaştır.",
      "Minimal öğretici kod yalnızca final/neredeyse final ödev çözümü değilse ve kavram, sözdizimi veya lokal bug için doğrudan yardımcıysa serbest.",
      "Küçük bir sözde kod fikri yardımcı olabilir, ama tam cevaba dönüşmemeli.",
      "Kullanıcı tam/final çözüm istediyse kısa reddet ve sadece tek bir kavramsal sonraki adım ver.",
      ...notes,
      `Validator kararı: ${validator.decision}`,
      `Validator ihlalleri: ${violations.length ? violations.join(", ") : "none"}`,
      `Validator nedeni: ${validator.reason}`,
    ].join("\n- ");
  }

  return [
    "Rewrite the previous mentor answer.",
    "LANGUAGE LOCK: Write the answer in English only. Do not use Turkish words or Turkish sentence structure unless quoting exact user text.",
    "Do not mention validators, policy, hidden rules, risk scores, or this repair instruction.",
    "Do not say 'the student asked'; speak directly to the user.",
    "Do not output labels like Mentor reply, AI response, or Student.",
    "The latest user message language overrides previous conversation history, editor text, assignment text, and previous mentor replies.",
    "This repair is attempted only once; keep the answer to 1-3 short sentences and abstract it when needed.",
    "Minimal teaching code is allowed only when it is not a final/near-final assignment solution and directly helps with a concept, syntax, or local bug.",
    "A small pseudo-code idea is allowed when helpful, but it must not become a complete answer.",
    "If the user asked for the full/final solution, refuse briefly and give only one conceptual next step.",
    ...notes,
    `Validator decision: ${validator.decision}`,
    `Validator violations: ${violations.length ? violations.join(", ") : "none"}`,
    `Validator reason: ${validator.reason}`,
  ].join("\n- ");
}

export function applyPolicy(params: {
  mentorReply: string;
  validator?: ValidatorResult | null;
}): PolicyResult {
  const validator = params.validator ?? null;
  if (!validator || validator.decision === "allow") {
    return { action: "allow", finalText: params.mentorReply, rewriteCount: 0, finalValidator: validator };
  }

  return {
    action: validator.decision,
    finalText: params.mentorReply,
    rewriteCount: 0,
    finalValidator: validator,
  };
}

export async function applyPolicyWithRetry(params: {
  mentorReply: string;
  validator: ValidatorResult;
  studentQuestion?: string | null;
  originalInput: MentorRequestInput;
}): Promise<PolicyResult> {
  const { mentorReply, validator, studentQuestion, originalInput } = params;

  if (validator.decision === "allow") {
    return { action: "allow", finalText: mentorReply, rewriteCount: 0, finalValidator: validator };
  }

  let lastText = mentorReply;
  let currentValidator = validator;
  let rewriteCount = 0;

  for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt += 1) {
    const retry = await getMentorReply({
      ...originalInput,
      mode: "mentor",
      studentQuestion: studentQuestion ?? originalInput.studentQuestion,
      repairInstruction: buildRepairInstruction(originalInput, currentValidator),
    });

    rewriteCount += 1;

    if (!retry.success || !retry.mentorReply.trim()) {
      continue;
    }

    lastText = retry.mentorReply;
    currentValidator = await validateMentorReplyWithQuality(originalInput, retry.mentorReply);

    if (currentValidator.decision === "allow") {
      return {
        action: "rewrite",
        finalText: retry.mentorReply,
        rewriteCount,
        finalValidator: currentValidator,
      };
    }
  }

  return {
    action: currentValidator.decision === "allow" ? "rewrite" : currentValidator.decision,
    finalText: lastText,
    rewriteCount,
    finalValidator: currentValidator,
  };
}
