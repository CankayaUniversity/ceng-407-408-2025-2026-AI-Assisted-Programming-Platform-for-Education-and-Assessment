export type ValidatorDecision = "allow" | "rewrite" | "block";

export type ValidatorResult = {
  riskScore: number;
  decision: ValidatorDecision;
  violations: string[];
  reason: string;
  source: "ai" | "heuristic";
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
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

const CODE_PATTERNS = [
  "```",
  "#include",
  "def ",
  "class ",
  "function ",
  "console.log",
  "return ",
];

function heuristicValidate(text: string): ValidatorResult {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const violations: string[] = [];

  const codeHits = CODE_PATTERNS.filter((p) => lower.includes(p.toLowerCase())).length;

  if (codeHits >= 2) violations.push("contains_code_solution");
  if (lower.includes("complete solution") || lower.includes("full solution"))
    violations.push("explicit_solution_language");
  if (trimmed.split(/\r?\n/).length > 14) violations.push("overly_long_response");

  if (
    violations.includes("contains_code_solution") ||
    violations.includes("explicit_solution_language")
  ) {
    return {
      riskScore: 0.86,
      decision: "rewrite",
      violations,
      reason: "Response is too solution-like for a mentoring reply.",
      source: "heuristic",
    };
  }

  if (violations.includes("overly_long_response")) {
    return {
      riskScore: 0.42,
      decision: "rewrite",
      violations,
      reason: "Response should be shorter and more guided.",
      source: "heuristic",
    };
  }

  return {
    riskScore: 0.05,
    decision: "allow",
    violations,
    reason: "Response is acceptable.",
    source: "heuristic",
  };
}

async function aiValidate(text: string): Promise<ValidatorResult> {
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

  const model = getValidatorModelName();
  console.log("[validator] model:", model);

  const res = await fetch(getOllamaGenerateUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      keep_alive: -1,
      options: { temperature: 0, top_p: 0.1 },
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`validator http error: ${raw.slice(0, 200)}`);
  }

  const data = (await res.json()) as { response?: string };
  const jsonText = extractJson(data.response ?? "");

  if (!jsonText) {
    throw new Error("validator returned invalid json");
  }

  const parsed = JSON.parse(jsonText) as {
    risk_score?: number;
    decision?: string;
    violations?: unknown[];
    reason?: string;
  };

  const decision: ValidatorDecision =
    parsed.decision === "allow" || parsed.decision === "rewrite" || parsed.decision === "block"
      ? parsed.decision
      : "rewrite";

  return {
    riskScore: typeof parsed.risk_score === "number" ? parsed.risk_score : 0.5,
    decision,
    violations: Array.isArray(parsed.violations)
      ? parsed.violations.filter((v): v is string => typeof v === "string")
      : [],
    reason:
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason
        : "validator returned no reason",
    source: "ai",
  };
}

export async function validateMentorReply(text: string): Promise<ValidatorResult> {
  try {
    return await aiValidate(text);
  } catch (err) {
    console.warn("[validator] AI validation failed, falling back to heuristic:", err);
    return heuristicValidate(text);
  }
}
