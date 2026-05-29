import type { MentorContextScope } from "./mentorIntent";

export type MentorLocale = "en" | "tr";

export type MentorConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MentorLspDiagnostic = {
  message: string;
  severity?: "error" | "warning" | "info" | "hint" | string | null;
  line?: number | null;
  source?: string | null;
};

export type MentorRelatedFile = {
  path: string;
  content: string;
};

export type MentorVisibleTestCaseResult = {
  input?: string | null;
  expected?: string | null;
  actual?: string | null;
  passed?: boolean | null;
};

export type MentorTestResults = {
  status?: string | null;
  summary?: string | null;
  visibleCases?: MentorVisibleTestCaseResult[] | null;
};

export type MentorScopeCandidate = {
  scope: MentorContextScope;
  confidence: number;
  reason?: string | null;
};

export type MentorRuntimeAnalysis = {
  kind:
    | "idle"
    | "accepted"
    | "wrong_answer"
    | "compile_error"
    | "runtime_error"
    | "timeout"
    | "unknown";
  confidence: number;
  evidence: string[];
  outputDiff?: {
    caseIndex: number;
    input?: string | null;
    expectedPreview: string;
    actualPreview: string;
    firstDifferenceIndex: number | null;
    whitespaceOnlyDifference: boolean;
    lengthDifference: number;
  } | null;
};

export type MentorStudentCodeAnalysis = {
  language: string;
  hasCode: boolean;
  loopCount: number;
  conditionalCount: number;
  recursion: boolean;
  dataStructures: string[];
  algorithmHints: string[];
  estimatedComplexity: string;
  narrative: string;
};

export type MentorControlledContextSource = {
  path: string;
  kind: "assignment" | "rubric" | "lesson" | "unknown";
};

export type MentorIntentClassifierResult = {
  used: boolean;
  scope: MentorContextScope | null;
  candidates?: MentorScopeCandidate[] | null;
  confidence: number | null;
  reason: string | null;
  error: string | null;
};

export type MentorRequestInput = {
  problemDescription?: string | null;
  assignmentText?: string | null;
  problemDifficulty?: string | null;
  studentCode?: string | null;
  errorMessage?: string | null;
  studentQuestion?: string | null;
  runStatus?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  language?: string | null;
  activeFileName?: string | null;
  activeLineNumber?: number | null;
  selectedCodeContext?: string | null;
  lspDiagnostics?: MentorLspDiagnostic[] | null;
  relatedFiles?: MentorRelatedFile[] | null;
  testResults?: MentorTestResults | null;
  restrictedKeywords?: string[] | null;
  conversationHistory?: MentorConversationMessage[] | null;
  mode?: string | null;
  hintLevel?: number | null;
  mentorLocale?: MentorLocale | string | null;
  modelOverride?: string | null;
  repairInstruction?: string | null;
  resolvedContextScope?: MentorContextScope | null;
  candidateContextScopes?: MentorScopeCandidate[] | null;
  intentClassifier?: MentorIntentClassifierResult | null;
  runtimeAnalysis?: MentorRuntimeAnalysis | null;
  studentCodeAnalysis?: MentorStudentCodeAnalysis | null;
  controlledContextSources?: MentorControlledContextSource[] | null;
};

export type MentorResult =
  | { success: true; mentorReply: string }
  | { success: false; mentorReply: ""; error: string };

export type MentorLanguageRepairResult = {
  text: string;
  changed: boolean;
  targetLocale: MentorLocale;
  reason: string | null;
  error: string | null;
};
