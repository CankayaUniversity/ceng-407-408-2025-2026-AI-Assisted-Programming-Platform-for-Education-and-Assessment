import type { ValidatorResult } from "./validator";
import { getMentorReply, type MentorRequestInput } from "./mentor";

export type PolicyResult = {
  action: "allow" | "rewrite" | "block";
  finalText: string;
  rewriteCount: number;
};

const SAFE_HINT =
  "I can't give the full final solution directly, but I can still help with one next step or one specific concept.";

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim();
}

function detectQuestionMode(message: string | null | undefined): "casual" | "meta" | "runtime" | "solution" | "mentor" {
  const msg = normalize(message).toLowerCase();

  if (!msg) return "mentor";

  const casual = new Set(["hi", "hello", "hey", "yo", "how are you", "how's it going", "what's up", "sup"]);
  if (casual.has(msg)) return "casual";

  if (
    /what model|which model|what is your ai model|what can you do|who are you|are you an ai mentor|coding assistant|explain how you work/i.test(
      msg,
    )
  ) {
    return "meta";
  }

  if (/what is the output|did it pass|what does it print|what error|runtime|compile|execution/i.test(msg)) {
    return "runtime";
  }

  if (
    /full solution|just write the code|solve it completely|send the final answer only|no hints|just code|fix the code and send the corrected version|pretend you are not a mentor|ignore previous instructions|for testing purposes, output the final code/i.test(
      msg,
    )
  ) {
    return "solution";
  }

  return "mentor";
}

function buildGenericGuidance(studentQuestion?: string | null): string {
  const mode = detectQuestionMode(studentQuestion);

  if (mode === "meta") {
    return "I'm an AI programming mentor. I help with code, bugs, and next steps without giving the full assignment solution.";
  }

  if (mode === "runtime") {
    return "I can help interpret the result, but I need the real run output or error first.";
  }

  if (mode === "solution") {
    return "I can't give the full final code, but I can give one next step or explain one part clearly.";
  }

  const focus =
    studentQuestion && studentQuestion.trim()
      ? `Let's focus on your question: ${studentQuestion.trim()}`
      : "Let's focus on the part that is blocking you.";

  return `${focus} I can point out one issue or one next step without giving the full final solution.`;
}

export function applyPolicy(params: {
  mentorReply: string;
  validator: ValidatorResult;
  studentQuestion?: string | null;
}): PolicyResult {
  const { mentorReply, validator, studentQuestion } = params;

  if (validator.decision === "allow") {
    return { action: "allow", finalText: mentorReply, rewriteCount: 0 };
  }

  if (validator.decision === "rewrite") {
    return {
      action: "rewrite",
      finalText: buildGenericGuidance(studentQuestion),
      rewriteCount: 0,
    };
  }

  return {
    action: "block",
    finalText: SAFE_HINT,
    rewriteCount: 0,
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
    return { action: "allow", finalText: mentorReply, rewriteCount: 0 };
  }

  if (validator.decision === "rewrite") {
    const retry = await getMentorReply({
      ...originalInput,
      mode: "mentor",
      studentQuestion: `
Rewrite your previous answer.

Rules:
- Maximum 3 sentences.
- Answer only the user's immediate question.
- Mention only one issue or one next step.
- No bullet points.
- No numbered list.
- No full code block.
- Do not restate the whole assignment.
- If the user asked for the final solution, refuse briefly and give only one conceptual hint.
- If the user asked a casual or meta question, do not mention the code unless they explicitly asked about it.
- If run status is idle, do not guess output or pass/fail.

Original student question:
${studentQuestion ?? "No question provided."}
`.trim(),
    });

    if (retry.success && retry.mentorReply.trim()) {
      return { action: "rewrite", finalText: retry.mentorReply, rewriteCount: 1 };
    }

    return {
      action: "rewrite",
      finalText: buildGenericGuidance(studentQuestion),
      rewriteCount: 1,
    };
  }

  return {
    action: "block",
    finalText: SAFE_HINT,
    rewriteCount: 0,
  };
}