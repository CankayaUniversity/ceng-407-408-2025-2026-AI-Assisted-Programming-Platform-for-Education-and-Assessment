import { normalizeText } from "./mentorContext";
import type { MentorRequestInput } from "./mentorTypes";

const MENTOR_TIMEOUT_MS = Number.parseInt(process.env.OLLAMA_MENTOR_TIMEOUT_MS ?? "60000", 10);
const MENTOR_NUM_PREDICT = Number.parseInt(process.env.OLLAMA_MENTOR_NUM_PREDICT ?? "240", 10);

function getOllamaGenerateUrl(): string {
  const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  return `${base}/api/generate`;
}

export function getMentorModelName(input?: MentorRequestInput): string {
  if (process.env.ALLOW_AI_MODEL_OVERRIDE === "true" && input?.modelOverride?.trim()) {
    return input.modelOverride.trim();
  }

  return process.env.OLLAMA_MODEL ?? "qwen2.5:3b-instruct";
}

export async function callMentorModel(prompt: string, input: MentorRequestInput): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MENTOR_TIMEOUT_MS);

  try {
    const model = getMentorModelName(input);
    console.log("[mentor] model:", model);

    const res = await fetch(getOllamaGenerateUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        keep_alive: -1,
        options: {
          temperature: 0.15,
          top_p: 0.9,
          num_predict: MENTOR_NUM_PREDICT,
          stop: [
            "\nUser:",
            "\nStudent:",
            "\nUser message:",
            "\nStudent message:",
            "\nAI response:",
            "\nAssistant:",
            "\nMentor reply:",
          ],
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as { response?: string };
    return normalizeText(data.response);
  } finally {
    clearTimeout(timeout);
  }
}
