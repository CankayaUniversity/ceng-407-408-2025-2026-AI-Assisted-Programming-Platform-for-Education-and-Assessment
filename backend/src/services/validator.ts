export type ValidatorDecision = "allow" | "rewrite" | "block";

export type ValidatorResult = {
  riskScore: number;
  decision: ValidatorDecision;
  violations: string[];
  reason: string;
  source: "heuristic";
};

const CODE_PATTERNS = [
  "```",
  "#include",
  "def ",
  "class ",
  "function ",
  "console.log",
  "return ",
];

export async function validateMentorReply(text: string): Promise<ValidatorResult> {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const violations: string[] = [];

  const codeHits = CODE_PATTERNS.filter((pattern) =>
    lower.includes(pattern.toLowerCase()),
  ).length;

  if (codeHits >= 2) {
    violations.push("contains_code_solution");
  }
  if (lower.includes("complete solution") || lower.includes("full solution")) {
    violations.push("explicit_solution_language");
  }
  if (trimmed.split(/\r?\n/).length > 14) {
    violations.push("overly_long_response");
  }

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
