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

export async function runValidator(text: string): Promise<ValidatorResult> {
  const prompt = `
You are a strict but balanced validator for a coding mentor.

Return ONLY valid JSON.
Do not add markdown.
Do not add extra text.

JSON format:
{
  "risk_score": 0.0,
  "decision": "allow",
  "violations": [],
  "reason": "short explanation"
}

Rules:

BLOCK:
- full solution
- direct final answer
- copy-paste ready code
- large complete code block
- solving the assignment for the student

REWRITE:
- mostly solution-like
- too explicit
- too close to giving the exact fix
- code-heavy answer that should be turned into a hint

ALLOW:
- short hints
- reasoning
- conceptual explanation
- debugging guidance
- one-step guidance
- slightly explicit answers are allowed

Important:
- Do NOT be overly strict.
- Prefer "allow" unless the answer clearly solves the task.
- Small examples can be allowed if they do not solve the assignment.

Text to validate:
${text}
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