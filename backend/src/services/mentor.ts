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

type MessageMode = "casual" | "meta" | "runtime" | "solution" | "mentor";

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

const BASIC_HELP_PATTERNS = [
  /how do i read .*input/i,
  /how do i take .*input/i,
  /how can i read .*input/i,
  /what does .* mean/i,
  /how does .* work/i,
  /what is the syntax for/i,
  /how do i loop/i,
  /how do i iterate/i,
  /how do i check length/i,
  /how do i get length/i,
  /how do i convert .* to int/i,
  /how do i parse/i,
  /how do i declare/i,
  /how do arrays work/i,
  /how do strings work/i,
];

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim();
}

function detectMessageMode(message: string | null | undefined): MessageMode {
  const msg = normalize(message).toLowerCase();
  if (!msg) return "mentor";
  if (CASUAL_PATTERNS.has(msg)) return "casual";

  if (
    /what model|which model|what is your ai model|what can you do|who are you|are you an ai mentor|coding assistant|explain how you work/i.test(
      msg,
    )
  ) {
    return "meta";
  }

  if (
    /what is the output|did it pass|what does it print|what error|runtime|compile|execution/i.test(
      msg,
    )
  ) {
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

function isBasicHelpQuestion(message: string | null | undefined): boolean {
  const text = normalize(message);
  if (!text) return false;
  return BASIC_HELP_PATTERNS.some((pattern) => pattern.test(text));
}

function buildCasualPrompt(message: string | null | undefined): string {
  return `
You are an AI coding mentor.

The user is making casual conversation.

Rules:
- You MUST respond in English only.
- Reply naturally.
- Keep it to 1 short sentence.
- Do not mention the code unless the user asks about it.
- Do not be robotic.

User message:
${message ?? "No message provided."}
`.trim();
}

function buildMetaPrompt(message: string | null | undefined): string {
  return `
You are an AI coding mentor.

The user asked a meta question.

Rules:
- You MUST respond in English only.
- Answer only the actual question.
- Keep it to 1-2 short sentences.
- Do not mention the student's code, assignment, output, or error unless the user directly asked about them.
- Do not turn this into debugging advice.

User message:
${message ?? "No message provided."}
`.trim();
}

function buildMentorPrompt(
  input: MentorRequestInput,
  options?: {
    forceGuidance?: boolean;
    basicHelp?: boolean;
    compactRewrite?: boolean;
  },
): string {
  const normalizedStatus = normalize(input.runStatus || "idle").toLowerCase();
  const normalizedMode = normalize(input.mode || "mentor").toLowerCase();
  const forceGuidance = options?.forceGuidance ?? false;
  const basicHelp = options?.basicHelp ?? false;
  const compactRewrite = options?.compactRewrite ?? false;

  let prompt = `
You are an AI programming mentor.

You MUST respond in English only.

Your goal is to help the student make progress without completing the assignment for them.

[LANGUAGE]
${input.language ?? "Unknown"}

[ASSIGNMENT]
${input.assignmentText || "Use the code as the main technical context only when relevant."}

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

Core rules:
- Never provide the full final solution.
- Never provide a complete copy-paste answer for the assignment.
- Never provide a full completed function, method, class, or end-to-end submission.
- Answer only the user's actual question.
- If the question is simple, keep the answer short.
- Focus on the single most important issue first.
- Do not give long step-by-step lists unless explicitly asked.
- Do not restate the whole assignment.
- Do not mention unrelated fixes.
- If the student's message is not about the code, do not drag the answer back to the code.

Allowed help:
- explain a concept
- explain syntax
- explain one error
- point out one likely bug
- suggest one next step
- give one tiny non-solution snippet if absolutely necessary

Response style:
- Default to 1-3 sentences.
- For "what is wrong?" mention only one main issue first.
- For "what should I fix first?" give exactly one next step.
- For "can you help me?" ask one focused follow-up or give one short starting point.
- Avoid bullet lists unless explicitly requested.
- Avoid walls of text.
- Sound natural, not robotic.
`.trim();

  if (normalizedStatus === "idle") {
    prompt += `
    
Idle rule:
- The code has not been executed yet.
- Do not claim the code works.
- Do not claim the code fails for a specific runtime reason unless clearly shown in the error context.
- Do not guess output.
- If the user asks about output/pass/failure and execution is idle, say you cannot know yet without running it.
`;
  }

  if (normalizedMode === "tip") {
    prompt += `
    
Tip mode:
- Give exactly one short useful hint.
- Do not expand into a tutorial.
`;
  }

  if (basicHelp) {
    prompt += `
    
Basic-help rule:
- If the user asks a basic programming question, answer it directly and briefly.
- Still avoid reconstructing the full assignment.
`;
  }

  if (forceGuidance) {
    prompt += `
    
Direct-answer request rule:
- The user asked for the final answer or direct code.
- Refuse briefly in 1 sentence.
- Then give at most one conceptual hint or one next step.
- Do not include a full code block.
- Do not reconstruct the full solution across multiple lines.
`;
  }

  if (compactRewrite) {
    prompt += `
    
Rewrite strictness:
- Maximum 3 sentences.
- No bullet points.
- No numbered list.
- No multi-line code block.
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
        keep_alive: -1,
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
    return text.trim() ? text.trim() : "";
  } finally {
    clearTimeout(timeout);
  }
}

function countFencedCodeBlocks(text: string): number {
  return Math.floor((text.match(/```/g) ?? []).length / 2);
}

function countCodeLikeLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) =>
      /^(def |class |function |const |let |var |if\b|for\b|while\b|return\b|print\(|input\(|console\.log\(|\w+\s*=\s*.+)/.test(
        line,
      ),
    ).length;
}

function looksLikeSolution(text: string): boolean {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  const bannedPhrases = [
    "complete solution",
    "full solution",
    "full code",
    "copy and paste",
    "submit this",
    "use this exact code",
    "here is the corrected version",
    "here's the corrected version",
    "your code should look like",
    "final code",
  ];

  if (bannedPhrases.some((p) => lower.includes(p))) return true;

  const fencedBlocks = countFencedCodeBlocks(trimmed);
  const codeLikeLines = countCodeLikeLines(trimmed);

  if (fencedBlocks >= 1) return true;
  if (codeLikeLines >= 4) return true;

  const hasWorkflow =
    lower.includes("read input") &&
    lower.includes("split") &&
    lower.includes("convert") &&
    (lower.includes("print") || lower.includes("sum"));

  if (hasWorkflow && trimmed.split(/\r?\n/).length >= 10) return true;

  return false;
}

function countSentences(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function isTooVerbose(text: string, mode: MessageMode): boolean {
  const lineCount = text.split(/\r?\n/).filter((l) => l.trim()).length;
  const sentenceCount = countSentences(text);

  if (mode === "casual" || mode === "meta") return sentenceCount > 2 || lineCount > 4;
  if (mode === "solution") return sentenceCount > 3 || lineCount > 6;
  if (mode === "runtime") return sentenceCount > 3 || lineCount > 6;
  return sentenceCount > 5 || lineCount > 10;
}

function enforceIdleHint(text: string, runStatus: string | null | undefined): string {
  if (normalize(runStatus).toLowerCase() !== "idle") {
    return text;
  }

  const lower = text.toLowerCase();

  if (lower.includes("cannot know yet") || lower.includes("run the code")) {
    return text;
  }

  if (lower.includes("output") || lower.includes("pass") || lower.includes("runtime")) {
    return `${text}\n\nRun the code first to verify what actually happens.`;
  }

  return text;
}

function violatesIdleRule(text: string, runStatus: string | null | undefined): boolean {
  if (normalize(runStatus).toLowerCase() !== "idle") {
    return false;
  }

  const lower = text.toLowerCase();
  const bad = ["it works", "it prints", "successfully", "output is", "it passed", "correct output"];
  return bad.some((p) => lower.includes(p));
}

function fallbackCasualReply(message: string | null | undefined): string {
  const msg = normalize(message).toLowerCase();
  if (msg.includes("hi") || msg.includes("hello")) {
    return "Hello. How can I help?";
  }
  if (msg.includes("how are you")) {
    return "I'm doing well. What are you working on?";
  }
  return "Alright. What do you need help with?";
}

function fallbackMentorReply(input: MentorRequestInput): string {
  const question = normalize(input.studentQuestion);
  const mode = detectMessageMode(question);
  const basicHelp = isBasicHelpQuestion(question);

  if (mode === "meta") {
    return "I'm an AI programming mentor. I help with code, errors, and next steps without giving the full assignment solution.";
  }

  if (mode === "runtime" && normalize(input.runStatus).toLowerCase() === "idle") {
    return "I can't know the real output yet because the code has not been run. Run it once and I can help interpret the result.";
  }

  if (basicHelp) {
    return question
      ? `Let's answer that directly: "${question}". I can explain the concept or syntax briefly without writing the full assignment for you.`
      : "Tell me the exact concept or syntax you are stuck on.";
  }

  if (question) {
    return `Let's focus on your question: "${question}". Start with the single step that is blocking you most.`;
  }

  return "Show me the exact step where you are stuck.";
}

/**
 * Streams tokens from Ollama directly to the caller.
 * Yields each text token as it arrives.
 * Does NOT run validator/policy — caller handles that after collecting full text.
 */
export async function* getMentorReplyStream(
  input: MentorRequestInput,
): AsyncGenerator<string, void, unknown> {
  const messageMode = detectMessageMode(input.studentQuestion ?? undefined);
  const basicHelp = isBasicHelpQuestion(input.studentQuestion ?? undefined);

  const prompt =
    messageMode === "casual"
      ? buildCasualPrompt(input.studentQuestion)
      : messageMode === "meta"
        ? buildMetaPrompt(input.studentQuestion)
        : buildMentorPrompt(input, { forceGuidance: messageMode === "solution", basicHelp });

  const url = getOllamaGenerateUrl();
  const model = getModelName();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        keep_alive: -1,
        options: { temperature: 0.2, top_p: 0.9 },
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as { response?: string; done?: boolean };
          if (parsed.response) yield parsed.response;
          if (parsed.done) return;
        } catch {
          // ignore malformed chunks
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function getMentorReply(input: MentorRequestInput): Promise<MentorResult> {
  const messageMode = detectMessageMode(input.studentQuestion ?? undefined);
  const basicHelp = isBasicHelpQuestion(input.studentQuestion ?? undefined);

  try {
    const prompt =
      messageMode === "casual"
        ? buildCasualPrompt(input.studentQuestion)
        : messageMode === "meta"
          ? buildMetaPrompt(input.studentQuestion)
          : buildMentorPrompt(input, {
              forceGuidance: messageMode === "solution",
              basicHelp,
            });

    let responseText = await callModel(prompt);

    if (messageMode !== "casual" && messageMode !== "meta") {
      if (violatesIdleRule(responseText, input.runStatus)) {
        const retryPrompt = `${prompt}

IMPORTANT:
- Do not assume execution results.
- Do not say the code works or prints something.
- Do not claim success.
- If execution is idle and the user asks about output, pass/fail, or runtime behavior, say you cannot know yet without running it.
`.trim();

        responseText = await callModel(retryPrompt);
      }

      if (looksLikeSolution(responseText) || isTooVerbose(responseText, messageMode)) {
        const retryPrompt = buildMentorPrompt(input, {
          forceGuidance: messageMode === "solution",
          basicHelp,
          compactRewrite: true,
        });

        responseText = await callModel(retryPrompt);
      }

      responseText = enforceIdleHint(responseText, input.runStatus);
    }

    if (!responseText.trim()) {
      responseText =
        messageMode === "casual"
          ? fallbackCasualReply(input.studentQuestion)
          : fallbackMentorReply(input);
    }

    return { success: true, mentorReply: responseText };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, mentorReply: "", error: message };
  }
}