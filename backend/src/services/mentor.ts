/**
 * Mentor prompts and Ollama calls.
 */

export type MentorRequestInput = {
  problemDescription?: string | null;
  assignmentText?: string | null;
  studentCode?: string | null;
  errorMessage?: string | null;
  studentQuestion?: string | null;
  runStatus?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  language?: string | null;
  mode?: string | null;
  hintLevel?: number | null;
};

export type MentorResult =
  | { success: true; mentorReply: string }
  | { success: false; mentorReply: ""; error: string };

const CASUAL_PATTERNS = new Set([
  "hi",
  "hello",
  "hey",
  "yo",
  "how are you",
  "how's it going",
  "what's up",
  "sup",
]);

function detectMessageMode(message: string | null | undefined): "casual" | "mentor" {
  const msg = (message ?? "").trim().toLowerCase();
  if (CASUAL_PATTERNS.has(msg)) {
    return "casual";
  }
  return "mentor";
}

function buildCasualPrompt(message: string | null | undefined): string {
  return `
You are an AI coding mentor.

The user is making casual conversation.

Rules:
- Reply naturally and briefly.
- Keep it short (1–2 sentences).
- Do not analyze code unless asked.
- Do not be robotic.
- Vary your wording.

Examples:
- "Hello. How can I help you?"
- "Hey. What are you working on?"
- "Hi. Need help with your code?"

User message:
${message ?? "No message provided."}
`.trim();
}

function buildMentorPrompt(
  input: MentorRequestInput,
  forceGuidance: boolean,
): string {
  const normalizedStatus = (input.runStatus ?? "idle").trim().toLowerCase();
  const normalizedMode = (input.mode ?? "mentor").trim().toLowerCase();

  let prompt = `
Answer using only the context below.

[LANGUAGE]
${input.language ?? "Unknown"}

[ASSIGNMENT]
${input.assignmentText || "Use the code as the primary source of truth."}

[CODE]
${input.studentCode ?? "No code provided."}

[STDERR]
${input.stderr ?? "No stderr"}

[RUN_STATUS]
${normalizedStatus}

[OUTPUT]
${input.stdout ?? "Not available."}

[ERROR]
${input.errorMessage ?? "No error message."}

[MODE]
${normalizedMode}

[STUDENT_MESSAGE]
${input.studentQuestion ?? "No message provided."}

Rules:
- Help the student, do not solve the assignment.
- Prefer explanation and hints over solutions.
- Do not give full code.
- Do not list multiple fixes at once.
- Focus on ONE main issue first.
- Avoid giving precise variable or syntax corrections directly.
- Keep hints slightly abstract so the student has to think.
- Keep answers short and clear.
- If the assignment does NOT match the code, trust the code.
- Always prioritize analyzing the student's code.
- Do NOT assume a different problem than the given code.
- Focus on the most important issue first.
- Even for syntax errors, do NOT give the exact corrected code.
- Guide instead of fixing directly.
- Think briefly about the student's mistake before giving a hint.
- Briefly explain your reasoning before the guidance.
- Do not sound repetitive.
- Avoid using the same phrases in every answer.
- Give a natural explanation, then guide.
`.trim();

  if (normalizedStatus === "idle") {
    prompt += `
- The code has not been executed yet.
- You cannot confirm behavior from execution.
- Do not claim it works.
- Do not claim exact output.
- Suggest running the code only when it is genuinely useful.
`;
  }

  if (normalizedMode === "tip") {
    prompt += `
- Give ONE short hint only.
- Do not give code.
`;
  }

  if (forceGuidance) {
    prompt += `
- The student is asking for the answer.
- Do NOT give it.
- Guide instead.
`;
  }

  return prompt.trim();
}

function getOllamaGenerateUrl(): string {
  const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  return `${base}/api/generate`;
}

function getModelName(): string {
  return process.env.OLLAMA_MODEL ?? "ai-mentor";
}

async function callModel(prompt: string): Promise<string> {
  const url = getOllamaGenerateUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const model = getModelName();
    console.log("[mentor] model:", model);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.2,
          top_p: 0.9,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as { response?: string };
    const text = data.response ?? "";
    return text.trim() ? text : "";
  } finally {
    clearTimeout(timeout);
  }
}

function looksLikeSolution(text: string): boolean {
  const lower = text.toLowerCase();

  if (lower.includes("```")) return true;
  if (lower.includes("complete solution")) return true;
  if (lower.includes("full code")) return true;
  if (lower.includes("copy and paste")) return true;

  return false;
}

function enforceIdleHint(text: string, runStatus: string | null | undefined): string {
  if ((runStatus ?? "").trim().toLowerCase() !== "idle") {
    return text;
  }

  const lower = text.toLowerCase();

  if (lower.includes("run") || lower.includes("execute")) {
    return text;
  }

  if (lower.includes("error") || lower.includes("output")) {
    return `${text}\n\nTry running the code to verify what happens.`;
  }

  return text;
}

function violatesIdleRule(text: string, runStatus: string | null | undefined): boolean {
  if ((runStatus ?? "").trim().toLowerCase() !== "idle") {
    return false;
  }

  const lower = text.toLowerCase();
  const bad = ["it works", "it prints", "successfully", "output is", "correct"];

  return bad.some((p) => lower.includes(p));
}

function fallbackCasualReply(message: string | null | undefined): string {
  const msg = (message ?? "").toLowerCase();
  if (msg.includes("hi") || msg.includes("hello")) {
    return "Hello. How can I help you?";
  }
  if (msg.includes("how are you")) {
    return "I'm doing well. Ready to help.";
  }
  return "Alright. What would you like to work on?";
}

export async function getMentorReply(input: MentorRequestInput): Promise<MentorResult> {
  const forceGuidance = false;
  const messageMode = detectMessageMode(input.studentQuestion ?? undefined);

  try {
    let prompt: string;

    if (messageMode === "casual") {
      prompt = buildCasualPrompt(input.studentQuestion);
    } else {
      prompt = buildMentorPrompt(input, forceGuidance);
    }

    let responseText = await callModel(prompt);

    if (messageMode !== "casual") {
      if (violatesIdleRule(responseText, input.runStatus)) {
        const retryPrompt = `${prompt}

IMPORTANT:
Do not assume execution results.
Do not say the code works or prints something.
Do not claim success.
`.trim();

        responseText = await callModel(retryPrompt);
      }

      if (looksLikeSolution(responseText)) {
        const retryPrompt = `${prompt}

IMPORTANT:
Do not provide full code or full solution.
Keep the reasoning but guide instead.
Do not reduce the answer to a generic hint.
`.trim();

        responseText = await callModel(retryPrompt);
      }

      responseText = enforceIdleHint(responseText, input.runStatus);
    }

    if (!responseText.trim()) {
      responseText =
        messageMode === "casual"
          ? fallbackCasualReply(input.studentQuestion)
          : "I couldn't generate a useful response.";
    }

    return { success: true, mentorReply: responseText };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, mentorReply: "", error: message };
  }
}