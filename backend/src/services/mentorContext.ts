import type { MentorConversationMessage } from "./mentorQuality";

const MAX_RECENT_HISTORY_MESSAGES = 16;
const MAX_HISTORY_MESSAGE_CHARS = 800;

export type MentorContextInput = {
  problemDescription?: string | null;
  assignmentText?: string | null;
  studentCode?: string | null;
  errorMessage?: string | null;
  runStatus?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  language?: string | null;
  activeFileName?: string | null;
  activeLineNumber?: number | null;
  selectedCodeContext?: string | null;
  conversationHistory?: MentorConversationMessage[] | null;
  mode?: string | null;
};

export function normalizeText(text: string | null | undefined): string {
  return (text ?? "").trim();
}

export function firstNonEmptyLine(text: string | null | undefined): string {
  return normalizeText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

export function firstErrorLine(input: MentorContextInput): string {
  return firstNonEmptyLine(input.errorMessage || input.stderr);
}

function truncateHistoryContent(content: string): string {
  const normalized = normalizeText(content).replace(/\s+\n/g, "\n");
  if (normalized.length <= MAX_HISTORY_MESSAGE_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_HISTORY_MESSAGE_CHARS - 3).trimEnd()}...`;
}

export function formatMentorContext(input: MentorContextInput): string {
  const activeLine =
    typeof input.activeLineNumber === "number" && Number.isFinite(input.activeLineNumber)
      ? String(input.activeLineNumber)
      : "unknown";

  return [
    `Language: ${input.language || "unknown"}`,
    `Mode: ${input.mode || "mentor"}`,
    `Run status: ${input.runStatus || "unknown"}`,
    `Active file: ${input.activeFileName || "unknown"}`,
    `Active line: ${activeLine}`,
    "",
    "Focused code near cursor:",
    input.selectedCodeContext || "(not provided)",
    "",
    "Assignment:",
    input.assignmentText || input.problemDescription || "(not provided)",
    "",
    "Student code:",
    input.studentCode || "(not provided)",
    "",
    "stderr/error:",
    input.stderr || input.errorMessage || "(none)",
    "",
    "stdout:",
    input.stdout || "(none)",
  ].join("\n");
}

export function formatRecentHistory(input: MentorContextInput): string {
  const history = (input.conversationHistory ?? [])
    .filter((message) => message.content.trim())
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
