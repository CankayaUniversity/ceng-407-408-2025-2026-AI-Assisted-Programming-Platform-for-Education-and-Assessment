import type { MentorConversationMessage } from "./mentorQuality";

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

/**
 * Decide how much problem context to dump into the mentor prompt.
 *
 * For casual greetings and meta questions, including the full assignment text
 * + student code + cursor window is counterproductive: the model sees the
 * problem in front of it and is naturally tempted to start solving instead
 * of answering "hello." For real code questions, we still need the full
 * context.
 *
 * The intent is passed in so the caller (mentor.ts) controls the policy
 * rather than this module re-running intent detection.
 */
export type ContextScope = "minimal" | "full";

export function formatMentorContext(
  input: MentorContextInput,
  scope: ContextScope = "full",
): string {
  if (scope === "minimal") {
    // For casual / meta turns we hide the assignment from the model entirely.
    // Without the problem in the prompt, the model has nothing to "solve" and
    // naturally falls back to conversational tone.
    return [
      `Language: ${input.language || "unknown"}`,
      `Mode: ${input.mode || "mentor"}`,
    ].join("\n");
  }

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
  // Keep the last 10 messages = 5 question/answer pairs. Long enough that
  // students can refer back across a multi-turn debugging session, short
  // enough that the prompt stays lean.
  const history = (input.conversationHistory ?? [])
    .filter((message) => message.content.trim())
    .slice(-10);

  if (history.length === 0) return "(none)";

  return history
    .map((message) => `${message.role === "assistant" ? "Previous mentor" : "Previous student"}: ${message.content}`)
    .join("\n");
}
