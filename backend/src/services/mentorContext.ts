import type { MentorContextScope, MentorHistoryScope } from "./mentorIntent";
import type { MentorRequestInput } from "./mentorTypes";

const MAX_RECENT_HISTORY_MESSAGES = 16;
const MAX_HISTORY_MESSAGE_CHARS = 800;
const MAX_DIAGNOSTICS = 8;
const MAX_DIAGNOSTIC_CHARS = 320;
const MAX_RELATED_FILES = 3;
const MAX_RELATED_FILE_CHARS = 2400;
const MAX_VISIBLE_TEST_CASES = 4;
const MAX_TEST_TEXT_CHARS = 700;
const MAX_RESTRICTED_KEYWORDS = 20;

export type MentorContextInput = Pick<
  MentorRequestInput,
  | "problemDescription"
  | "assignmentText"
  | "problemDifficulty"
  | "studentCode"
  | "errorMessage"
  | "runStatus"
  | "stdout"
  | "stderr"
  | "language"
  | "activeFileName"
  | "activeLineNumber"
  | "selectedCodeContext"
  | "lspDiagnostics"
  | "relatedFiles"
  | "testResults"
  | "restrictedKeywords"
  | "conversationHistory"
  | "mode"
>;

export function normalizeText(text: string | null | undefined): string {
  return (text ?? "").trim();
}

function formatCodeWithLineNumbers(code: string | null | undefined): string {
  const normalized = normalizeText(code);
  if (!normalized) return "(not provided)";

  return (code ?? "")
    .split(/\r?\n/)
    .map((line, index) => `${index + 1}: ${line}`)
    .join("\n");
}

function truncateHistoryContent(content: string): string {
  const normalized = normalizeText(content).replace(/\s+\n/g, "\n");
  if (normalized.length <= MAX_HISTORY_MESSAGE_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_HISTORY_MESSAGE_CHARS - 3).trimEnd()}...`;
}

function truncateContextText(content: string | null | undefined, maxChars: number): string {
  const normalized = normalizeText(content);
  if (!normalized) return "(not provided)";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
}

function formatBaseContext(input: MentorContextInput): string[] {
  const activeLine =
    typeof input.activeLineNumber === "number" && Number.isFinite(input.activeLineNumber)
      ? String(input.activeLineNumber)
      : "unknown";

  return [
    `Language: ${input.language || "unknown"}`,
    `Problem difficulty: ${input.problemDifficulty || "unknown"}`,
    `Mode: ${input.mode || "mentor"}`,
    `Active file: ${input.activeFileName || "unknown"}`,
    `Active line: ${activeLine}`,
  ];
}

function formatDiagnostics(input: MentorContextInput): string[] {
  const diagnostics = (input.lspDiagnostics ?? [])
    .filter((diagnostic) => normalizeText(diagnostic.message))
    .slice(0, MAX_DIAGNOSTICS);

  if (diagnostics.length === 0) {
    return ["Editor diagnostics:", "(none provided)"];
  }

  return [
    "Editor diagnostics:",
    ...diagnostics.map((diagnostic) => {
      const details = [
        normalizeText(diagnostic.severity) || "diagnostic",
        typeof diagnostic.line === "number" ? `line ${diagnostic.line}` : null,
        normalizeText(diagnostic.source) || null,
      ].filter(Boolean);

      return `- ${details.join(", ")}: ${truncateContextText(
        diagnostic.message,
        MAX_DIAGNOSTIC_CHARS,
      )}`;
    }),
  ];
}

function formatRelatedFiles(input: MentorContextInput): string[] {
  const files = (input.relatedFiles ?? [])
    .filter((file) => normalizeText(file.path) && normalizeText(file.content))
    .slice(0, MAX_RELATED_FILES);

  if (files.length === 0) return [];

  return [
    "Related files provided to mentor:",
    ...files.flatMap((file) => [
      `File: ${file.path}`,
      truncateContextText(file.content, MAX_RELATED_FILE_CHARS),
    ]),
  ];
}

function formatTestResults(input: MentorContextInput): string[] {
  const results = input.testResults;
  if (!results) {
    return ["Visible test results:", "(none provided)"];
  }

  const lines = [
    "Visible test results:",
    `Status: ${normalizeText(results.status) || "unknown"}`,
  ];

  if (normalizeText(results.summary)) {
    lines.push(`Summary: ${truncateContextText(results.summary, MAX_TEST_TEXT_CHARS)}`);
  }

  const visibleCases = (results.visibleCases ?? []).slice(0, MAX_VISIBLE_TEST_CASES);
  if (visibleCases.length === 0) {
    lines.push("Visible cases: (none provided)");
    return lines;
  }

  lines.push("Visible cases:");
  visibleCases.forEach((testCase, index) => {
    const status =
      testCase.passed === true ? "passed" : testCase.passed === false ? "failed" : "unknown";
    lines.push(`Case ${index + 1}: ${status}`);
    if (normalizeText(testCase.input)) {
      lines.push(`Input: ${truncateContextText(testCase.input, MAX_TEST_TEXT_CHARS)}`);
    }
    if (normalizeText(testCase.expected)) {
      lines.push(`Expected: ${truncateContextText(testCase.expected, MAX_TEST_TEXT_CHARS)}`);
    }
    if (normalizeText(testCase.actual)) {
      lines.push(`Actual: ${truncateContextText(testCase.actual, MAX_TEST_TEXT_CHARS)}`);
    }
  });
  return lines;
}

function formatRestrictions(input: MentorContextInput): string[] {
  const keywords = (input.restrictedKeywords ?? [])
    .map((keyword) => normalizeText(keyword))
    .filter(Boolean)
    .slice(0, MAX_RESTRICTED_KEYWORDS);

  if (keywords.length === 0) return [];

  return [
    "Assignment restrictions:",
    `Avoid recommending these restricted keywords or constructs: ${keywords.join(", ")}`,
  ];
}

export function formatMentorContext(
  input: MentorContextInput,
  scope: MentorContextScope = "code",
): string {
  if (scope === "chat") {
    return [
      "Code/editor/terminal context intentionally omitted.",
      "Reason: the latest message should be answered as conversation, meta, or off-topic chat.",
    ].join("\n");
  }

  if (scope === "concept") {
    return [
      `Language: ${input.language || "unknown"}`,
      "Assignment/editor/terminal context intentionally omitted.",
      "Reason: the latest message asks for a general programming concept or syntax explanation.",
    ].join("\n");
  }

  if (scope === "assignment") {
    return [
      `Language: ${input.language || "unknown"}`,
      `Problem difficulty: ${input.problemDifficulty || "unknown"}`,
      `Mode: ${input.mode || "mentor"}`,
      "",
      "Assignment:",
      input.assignmentText || input.problemDescription || "(not provided)",
      ...formatRestrictions(input),
    ].join("\n");
  }

  if (scope === "editor") {
    return [
      ...formatBaseContext(input),
      "",
      "Focused code near cursor:",
      input.selectedCodeContext || "(not provided)",
      "",
      "Visible active editor code (full, line-numbered):",
      formatCodeWithLineNumbers(input.studentCode),
      "",
      ...formatDiagnostics(input),
    ].join("\n");
  }

  if (scope === "runtime") {
    return [
      ...formatBaseContext(input),
      `Terminal/run status: ${input.runStatus || "unknown"}`,
      "",
      "Focused code near cursor:",
      input.selectedCodeContext || "(not provided)",
      "",
      "Visible active editor code (full, line-numbered):",
      formatCodeWithLineNumbers(input.studentCode),
      "",
      "Terminal stderr/error:",
      input.stderr || input.errorMessage || "(none)",
      "",
      "Terminal stdout:",
      input.stdout || "(none)",
      "",
      ...formatDiagnostics(input),
      "",
      ...formatTestResults(input),
    ].join("\n");
  }

  return [
    ...formatBaseContext(input),
    `Terminal/run status: ${input.runStatus || "unknown"}`,
    "",
    "Focused code near cursor:",
    input.selectedCodeContext || "(not provided)",
    "",
    "Assignment:",
    input.assignmentText || input.problemDescription || "(not provided)",
    "",
    "Visible active editor code (full, line-numbered):",
    formatCodeWithLineNumbers(input.studentCode),
    "",
    "Terminal stderr/error:",
    input.stderr || input.errorMessage || "(none)",
    "",
    "Terminal stdout:",
    input.stdout || "(none)",
    "",
    ...formatDiagnostics(input),
    "",
    ...formatTestResults(input),
    "",
    ...formatRestrictions(input),
    "",
    ...formatRelatedFiles(input),
  ].join("\n");
}

export function formatRecentHistory(
  input: MentorContextInput,
  scope: MentorHistoryScope = "full",
): string {
  if (scope === "none") return "(omitted)";

  const history = (input.conversationHistory ?? [])
    .filter((message) => message.content.trim())
    .filter((message) => scope === "full" || message.role === "user")
    .slice(-MAX_RECENT_HISTORY_MESSAGES);

  if (history.length === 0) return "(none)";

  return history
    .map(
      (message) =>
        `${message.role === "assistant" ? "Previous mentor" : "Previous student"}: ${truncateHistoryContent(
          message.content,
        )}`,
    )
    .join("\n");
}
