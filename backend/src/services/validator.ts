export type ValidatorDecision =
  | "allow"
  | "rewrite"
  | "fallback_safe_hint"
  | "block";

export type ValidatorResult = {
  risk_score: number;
  decision: ValidatorDecision;
  violations: string[];
  reason: string;
};
export type ValidatorInput = {
  userMessage: string;
  history: string[];
  candidate: string;
};

function getOllamaGenerateUrl(): string {
  const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  return `${base}/api/generate`;
}

function getValidatorModelName(): string {
  return process.env.OLLAMA_VALIDATOR_MODEL ?? process.env.OLLAMA_MODEL ?? "ai-mentor";
}

function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function fallback(reason: string): ValidatorResult {
  return {
    risk_score: 1,
    decision: "fallback_safe_hint",
    violations: ["parse_error"],
    reason,
  };
}

export async function runValidator(input: ValidatorInput): Promise<ValidatorResult> {
  const prompt = `
You are a strict response validator for an AI coding mentor.

You will receive:
- the user's latest message
- recent assistant replies (history)
- a candidate response

Your job is to decide whether the candidate response is acceptable.

Evaluate based on:

1. Repetition:
- Is the candidate overly similar to recent assistant replies?
- Does it reuse the same structure, phrases, or advice?
- Does it feel like a repeated template response?

2. Relevance:
- Does it directly answer the user's latest message?
- If the user is chatting casually or asking about the previous reply, does the response adapt naturally?
- Or does it force coding guidance unnecessarily?

3. Helpfulness:
- Is it concise and not unnecessarily verbose?
- Does it avoid robotic or generic mentor phrases?

4. Solution Leak:
- Does it give a full solution when it should guide instead?

5. Language Consistency:
- Is the response in the same language as the user?

Return ONLY valid JSON in this exact format:

{
  "risk_score": 0.0,
  "decision": "allow" | "rewrite" | "fallback_safe_hint" | "block",
  "violations": ["repetition", "irrelevant", "robotic", "solution_leak", "language_mismatch"],
  "reason": "short explanation"
}

[USER_MESSAGE]
${input.userMessage}

[RECENT_ASSISTANT_REPLIES]
${input.history.length > 0 ? input.history.join("\n---\n") : "No recent assistant replies."}

[CANDIDATE_RESPONSE]
${input.candidate}
`.trim();

  try {
    const model = getValidatorModelName();
    console.log("[validator] model:", model);

    const res = await fetch(getOllamaGenerateUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0,
          top_p: 0.1,
        },
      }),
    });

    if (!res.ok) {
      const raw = await res.text();
      return fallback(`validator http error: ${raw.slice(0, 200)}`);
    }

    const data = (await res.json()) as { response?: string };
    const jsonText = extractJson(data.response ?? "");

    if (!jsonText) {
      return fallback("validator returned invalid json");
    }

    const parsed = JSON.parse(jsonText) as Partial<ValidatorResult>;

    const result: ValidatorResult = {
      risk_score:
        typeof parsed.risk_score === "number" ? parsed.risk_score : 0.5,
      decision:
        parsed.decision === "allow" ||
        parsed.decision === "rewrite" ||
        parsed.decision === "fallback_safe_hint" ||
        parsed.decision === "block"
          ? parsed.decision
          : "fallback_safe_hint",
      violations: Array.isArray(parsed.violations)
        ? parsed.violations.filter((v): v is string => typeof v === "string")
        : [],
      reason:
        typeof parsed.reason === "string" && parsed.reason.trim()
          ? parsed.reason
          : "validator returned no reason",
    };

    console.log("[validator] decision:", result.decision, result.violations);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fallback(message);
  }
}