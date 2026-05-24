/**
 * AI mentor orchestration.
 *
 * This facade keeps the public mentor service API stable while the prompt,
 * locale, model-call, and repair work live in focused modules.
 */

import { normalizeText } from "./mentorContext";
import { callMentorModel } from "./mentorModel";
import { buildMentorPrompt } from "./mentorPrompt";
import { repairTruncatedMentorReply } from "./mentorRepair";
import type { MentorRequestInput, MentorResult } from "./mentorTypes";

export { inferMentorLocale } from "./mentorLocale";
export { getMentorModelName } from "./mentorModel";
export { repairMentorReplyLanguage } from "./mentorRepair";
export type {
  MentorLanguageRepairResult,
  MentorLocale,
  MentorRequestInput,
  MentorResult,
} from "./mentorTypes";

async function generateMentorText(input: MentorRequestInput): Promise<string> {
  const text = normalizeText(await callMentorModel(buildMentorPrompt(input), input));

  if (!text) {
    throw new Error("mentor_empty_response");
  }

  return repairTruncatedMentorReply(input, text);
}

/**
 * The frontend consumes this as SSE tokens. For reliability we generate and
 * clean the full answer first, then yield one model-authored chunk.
 */
export async function* getMentorReplyStream(
  input: MentorRequestInput,
): AsyncGenerator<string, void, unknown> {
  yield await generateMentorText(input);
}

export async function getMentorReply(input: MentorRequestInput): Promise<MentorResult> {
  try {
    const mentorReply = await generateMentorText(input);
    return { success: true, mentorReply };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, mentorReply: "", error: message };
  }
}
