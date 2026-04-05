import { getMentorReply, type MentorRequestInput } from "./mentor";
import { runValidator, type ValidatorResult } from "./validator";

export type PolicyResult =
  | {
      success: true;
      mentorReply: string;
      audit: ValidatorResult;
    }
  | {
      success: false;
      mentorReply: "";
      error: string;
    };

function safeHint(): string {
  return "Focus on one small part of the problem first. Compare what you expect with what your code is actually doing, then inspect the line that causes that mismatch.";
}

export async function getMentorReplyWithPolicy(
  input: MentorRequestInput,
): Promise<PolicyResult> {
  const mentor = await getMentorReply(input);

  if (!mentor.success) {
    return mentor;
  }

  const validator = await runValidator(mentor.mentorReply);
  console.log("[policy] validator decision:", validator.decision, validator.violations);

  if (validator.decision === "allow") {
    return {
      success: true,
      mentorReply: mentor.mentorReply,
      audit: validator,
    };
  }

  if (validator.decision === "rewrite") {
    const retry = await getMentorReply({
      ...input,
      mode: "mentor",
      studentQuestion: `
Rewrite your previous answer to be more guiding.

Rules:
- Keep the reasoning
- Do not give full code
- Do not give the final answer
- Do not sound generic
- Keep it natural, short, and helpful
- Focus on one issue only

Original student question:
${input.studentQuestion ?? "No question provided."}
`.trim(),
    });

    if (!retry.success) {
      return retry;
    }

    return {
      success: true,
      mentorReply: retry.mentorReply,
      audit: validator,
    };
  }

  if (validator.decision === "block") {
    return {
      success: true,
      mentorReply: safeHint(),
      audit: validator,
    };
  }

  return {
    success: true,
    mentorReply: safeHint(),
    audit: validator,
  };
}