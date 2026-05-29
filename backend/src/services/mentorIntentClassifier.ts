import { callMentorModel } from "./mentorModel";
import { normalizeText } from "./mentorContext";
import {
  isCasualConversation,
  isMetaQuestion,
  resolveMentorContextScope,
  type MentorContextScope,
} from "./mentorIntent";
import type { MentorRequestInput } from "./mentorTypes";
import type { MentorScopeCandidate } from "./mentorTypes";

const CLASSIFIER_REWRITE_SCOPE: MentorContextScope[] = [
  "chat",
  "concept",
  "assignment",
  "editor",
  "runtime",
  "code",
];

type IntentClassifierResult = NonNullable<MentorRequestInput["intentClassifier"]>;

function classifierDebugEnabled(): boolean {
  return process.env.MENTOR_DEBUG === "true";
}

function hasProblemWorkspace(input: MentorRequestInput): boolean {
  return Boolean(
    normalizeText(input.assignmentText || input.problemDescription) ||
      normalizeText(input.studentCode) ||
      normalizeText(input.selectedCodeContext) ||
      normalizeText(input.stderr || input.errorMessage) ||
      normalizeText(input.stdout),
  );
}

function shouldUseClassifier(input: MentorRequestInput, heuristicScope: MentorContextScope): boolean {
  const question = normalizeText(input.studentQuestion);
  if (!question) return false;
  if (normalizeText(input.repairInstruction)) return false;
  if (heuristicScope !== "chat") return false;
  if (isCasualConversation(question) || isMetaQuestion(question)) return false;

  return hasProblemWorkspace(input);
}

function buildIntentClassifierPrompt(
  input: MentorRequestInput,
  heuristicScope: MentorContextScope,
): string {
  const question = normalizeText(input.studentQuestion);
  const assignment = normalizeText(input.assignmentText || input.problemDescription);
  const code = normalizeText(input.selectedCodeContext || input.studentCode);
  const terminal = normalizeText(input.stderr || input.errorMessage || input.stdout);
  const historyTail = (input.conversationHistory ?? [])
    .slice(-4)
    .map((message) => `${message.role}: ${normalizeText(message.content).slice(0, 240)}`)
    .join("\n");

  return [
    "Classify the latest student message for an educational programming mentor.",
    "Return ONLY compact JSON with this exact shape:",
    '{"scope":"chat|concept|assignment|editor|runtime|code","confidence":0.0,"reason":"short reason","candidates":[{"scope":"runtime","confidence":0.0,"reason":"short reason"}]}',
    "",
    "Scope definitions:",
    "- chat: pure casual/meta/off-task conversation, no programming or assignment help needed.",
    "- concept: general programming concept/syntax question not tied to the current assignment.",
    "- assignment: asks what the assignment/problem means or its boundaries, without asking about current code.",
    "- editor: asks what is visible in the editor/current file/line, or asks to inspect visible code.",
    "- runtime: asks about terminal output, errors, run status, failing tests, stdout, or stderr.",
    "- code: asks how to proceed with current code/assignment, implementation strategy, debugging, or code-related next step.",
    "",
    "Priority:",
    "runtime > editor > code/assignment > concept > chat.",
    "Greetings such as 'selam' are tone only; if the same message asks a technical question, do not classify as chat.",
    "If unsure and the student is on an assignment/problem screen, prefer code or assignment over chat.",
    "",
    `Heuristic scope: ${heuristicScope}`,
    `Has assignment text: ${assignment ? "yes" : "no"}`,
    `Has visible code: ${code ? "yes" : "no"}`,
    `Has terminal text: ${terminal ? "yes" : "no"}`,
    "",
    "<RECENT_HISTORY>",
    historyTail || "(none)",
    "</RECENT_HISTORY>",
    "",
    "<LATEST_MESSAGE>",
    question,
    "</LATEST_MESSAGE>",
  ].join("\n");
}

function normalizeCandidate(value: unknown): MentorScopeCandidate | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as { scope?: unknown; confidence?: unknown; reason?: unknown };
  const scope = typeof raw.scope === "string" ? raw.scope.trim().toLowerCase() : "";
  if (!CLASSIFIER_REWRITE_SCOPE.includes(scope as MentorContextScope)) return null;
  const confidence =
    typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0;
  return {
    scope: scope as MentorContextScope,
    confidence,
    reason: typeof raw.reason === "string" ? raw.reason.slice(0, 160) : null,
  };
}

function dedupeCandidates(candidates: MentorScopeCandidate[]): MentorScopeCandidate[] {
  const byScope = new Map<MentorContextScope, MentorScopeCandidate>();
  for (const candidate of candidates) {
    const previous = byScope.get(candidate.scope);
    if (!previous || candidate.confidence > previous.confidence) {
      byScope.set(candidate.scope, candidate);
    }
  }
  return [...byScope.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4);
}

function heuristicCandidates(input: MentorRequestInput, heuristicScope: MentorContextScope): MentorScopeCandidate[] {
  const candidates: MentorScopeCandidate[] = [
    { scope: heuristicScope, confidence: 0.7, reason: "heuristic primary" },
  ];
  if (normalizeText(input.stderr || input.errorMessage || input.stdout)) {
    candidates.push({ scope: "runtime", confidence: 0.85, reason: "terminal text available" });
  }
  if (normalizeText(input.selectedCodeContext || input.studentCode)) {
    candidates.push({ scope: "code", confidence: 0.65, reason: "student code available" });
  }
  if (normalizeText(input.assignmentText || input.problemDescription)) {
    candidates.push({ scope: "assignment", confidence: 0.55, reason: "assignment available" });
  }
  return dedupeCandidates(candidates);
}

function parseClassifierJson(text: string): IntentClassifierResult {
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? "";
  const parsed = JSON.parse(jsonText) as {
    scope?: unknown;
    confidence?: unknown;
    reason?: unknown;
    candidates?: unknown;
  };
  const scope = typeof parsed.scope === "string" ? parsed.scope.trim().toLowerCase() : "";
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : null;

  const parsedCandidates = Array.isArray(parsed.candidates)
    ? parsed.candidates.map(normalizeCandidate).filter((item): item is MentorScopeCandidate => item !== null)
    : [];
  const primaryCandidate =
    CLASSIFIER_REWRITE_SCOPE.includes(scope as MentorContextScope) && confidence !== null
      ? [{ scope: scope as MentorContextScope, confidence, reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 160) : null }]
      : [];

  return {
    used: true,
    scope: CLASSIFIER_REWRITE_SCOPE.includes(scope as MentorContextScope)
      ? (scope as MentorContextScope)
      : null,
    candidates: dedupeCandidates([...primaryCandidate, ...parsedCandidates]),
    confidence,
    reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 240) : null,
    error: null,
  };
}

function fallbackClassifierResult(error: string): IntentClassifierResult {
  return {
    used: true,
    scope: null,
    candidates: null,
    confidence: null,
    reason: null,
    error,
  };
}

function safeFallbackScope(input: MentorRequestInput): MentorContextScope {
  if (normalizeText(input.stderr || input.errorMessage || input.stdout)) return "runtime";
  if (normalizeText(input.assignmentText || input.problemDescription)) return "code";
  if (normalizeText(input.studentCode || input.selectedCodeContext)) return "code";
  return "chat";
}

export async function resolveMentorContextWithClassifier(
  input: MentorRequestInput,
): Promise<MentorRequestInput> {
  const heuristicScope = resolveMentorContextScope({
    studentQuestion: input.studentQuestion,
    conversationHistory: input.conversationHistory,
    mode: input.mode,
  });

  if (!shouldUseClassifier(input, heuristicScope)) {
    const candidates = heuristicCandidates(input, heuristicScope);
    input.resolvedContextScope = heuristicScope;
    input.candidateContextScopes = candidates;
    input.intentClassifier = {
      used: false,
      scope: heuristicScope,
      candidates,
      confidence: null,
      reason: "heuristic",
      error: null,
    };
    return input;
  }

  try {
    const raw = normalizeText(
      await callMentorModel(buildIntentClassifierPrompt(input, heuristicScope), {
        ...input,
        repairInstruction: "intent_classifier",
      }),
    );
    const result = parseClassifierJson(raw);
    const pureChat = isCasualConversation(input.studentQuestion) || isMetaQuestion(input.studentQuestion);
    const classifierScope =
      result.scope === "chat" && !pureChat && hasProblemWorkspace(input)
        ? safeFallbackScope(input)
        : result.scope;
    const confidentScope =
      classifierScope && (result.confidence === null || result.confidence >= 0.55)
        ? classifierScope
        : safeFallbackScope(input);

    input.resolvedContextScope = confidentScope;
    input.candidateContextScopes = dedupeCandidates([
      ...(result.candidates ?? []),
      ...heuristicCandidates(input, heuristicScope),
      { scope: confidentScope, confidence: 0.75, reason: "resolved fallback/primary" },
    ]);
    input.intentClassifier = result;

    if (classifierDebugEnabled()) {
      console.log("[mentor:intent-classifier]", {
        raw,
        heuristicScope,
        resolvedContextScope: input.resolvedContextScope,
        result,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "intent_classifier_failed";
    input.resolvedContextScope = safeFallbackScope(input);
    input.candidateContextScopes = heuristicCandidates(input, heuristicScope);
    input.intentClassifier = fallbackClassifierResult(message);

    if (classifierDebugEnabled()) {
      console.warn("[mentor:intent-classifier] failed", {
        heuristicScope,
        resolvedContextScope: input.resolvedContextScope,
        error: message,
      });
    }
  }

  return input;
}
