import requests
from pydantic import BaseModel

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "ai-mentor"


class MentorRequest(BaseModel):
    problem_description: str | None = None
    assignment_text: str | None = None
    student_code: str | None = None
    error_message: str | None = None
    student_question: str | None = None
    run_status: str | None = None
    stdout: str | None = None
    language: str | None = None
    mode: str | None = "mentor"
    hint_level: int | None = 1


# -------------------------
# MODE DETECTION
# -------------------------

def detect_message_mode(message: str | None) -> str:
    msg = (message or "").strip().lower()

    casual_patterns = [
        "hi", "hello", "hey", "yo",
        "how are you", "how's it going", "what's up", "sup",
    ]

    if msg in casual_patterns:
        return "casual"

    return "mentor"


# -------------------------
# PROMPTS
# -------------------------

def build_casual_prompt(message: str | None) -> str:
    return f"""
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
{message or 'No message provided.'}
""".strip()



def build_mentor_prompt(
    problem_description: str | None,
    assignment_text: str | None,
    student_code: str | None,
    error_message: str | None,
    student_question: str | None,
    run_status: str | None = None,
    stdout: str | None = None,
    language: str | None = None,
    mode: str | None = "mentor",
    hint_level: int | None = 1,
    force_guidance: bool = False,
) -> str:
    normalized_status = (run_status or "idle").strip().lower()
    normalized_mode = (mode or "mentor").strip().lower()

    prompt = f"""
Answer using only the context below.

[LANGUAGE]
{language or 'Unknown'}

[ASSIGNMENT]
{assignment_text or 'No assignment provided.'}

[CODE]
{student_code or 'No code provided.'}

[RUN_STATUS]
{normalized_status}

[OUTPUT]
{stdout or 'Not available.'}

[ERROR]
{error_message or 'No error message.'}

[MODE]
{normalized_mode}

[STUDENT_MESSAGE]
{student_question or 'No message provided.'}

Rules:
- Help the student, do not solve the assignment.
- Prefer explanation and hints over solutions.
- Do not give full code.
- Do not list multiple fixes at once.
- Focus on ONE main issue first.
- Avoid giving precise variable or syntax corrections directly.
- Keep hints slightly abstract so the student has to think.
- Keep answers short and clear.
- Focus on the most important issue first.
- Even for syntax errors, do NOT give the exact corrected code.
- Guide instead of fixing directly.
"""

    if normalized_status == "idle":
        prompt += """
- The code has not been executed yet.
- You cannot confirm behavior from execution.
- Do not claim it works.
- Do not claim exact output.
- Suggest running the code to verify behavior.
- If appropriate, encourage the student to click the run button.
"""

    if normalized_mode == "tip":
        prompt += """
- Give ONE short hint only.
- Do not give code.
"""

    if force_guidance:
        prompt += """
- The student is asking for the answer.
- Do NOT give it.
- Guide instead.
"""

    return prompt.strip()


# -------------------------
# MODEL CALL
# -------------------------

def call_model(prompt: str) -> str:
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.2,
            "top_p": 0.9,
        },
    }

    response = requests.post(OLLAMA_URL, json=payload, timeout=120)
    response.raise_for_status()
    data = response.json()

    text = data.get("response", "")

    if not text or not text.strip():
        return ""

    return text


# -------------------------
# GUARDS
# -------------------------

def looks_like_solution(text: str) -> bool:
    lower = text.lower()

    patterns = [
        "```",
        "def ",
        "for ",
        "while ",
        "return ",
        "console.log",
        "#include",
    ]

    return sum(p in lower for p in patterns) >= 3

def enforce_idle_hint(text: str, run_status: str | None) -> str:
    if (run_status or "").strip().lower() != "idle":
        return text

    if "run" in text.lower():
        return text

    return text + "\n\nTry running the code to see what error you get."

def violates_idle_rule(text: str, run_status: str | None) -> bool:
    if (run_status or "").strip().lower() != "idle":
        return False

    lower = text.lower()

    bad = [
        "it works",
        "it prints",
        "successfully",
        "output is",
        "correct",
    ]

    return any(p in lower for p in bad)


# -------------------------
# FALLBACK
# -------------------------

def fallback_casual_reply(message: str | None) -> str:
    msg = (message or "").lower()

    if "hi" in msg or "hello" in msg:
        return "Hello. How can I help you?"

    if "how are you" in msg:
        return "I'm doing well. Ready to help."

    return "Alright. What would you like to work on?"


# -------------------------
# MAIN ENTRY
# -------------------------

def get_mentor_reply(req: MentorRequest) -> dict:
    force_guidance = False
    message_mode = detect_message_mode(req.student_question)
    
    try:
        if message_mode == "casual":
            prompt = build_casual_prompt(req.student_question)
        else:
            prompt = build_mentor_prompt(
                req.problem_description,
                req.assignment_text,
                req.student_code,
                req.error_message,
                req.student_question,
                req.run_status,
                req.stdout,
                req.language,
                req.mode,
                req.hint_level,
                force_guidance=force_guidance,
            )
        
        response_text = call_model(prompt)
        
        # Guards only for mentor mode
        if message_mode != "casual":

            if violates_idle_rule(response_text, req.run_status):
                retry_prompt = prompt + """

IMPORTANT:
Do not assume execution results.
Do not say the code works or prints something.
"""
                response_text = call_model(retry_prompt)

            if looks_like_solution(response_text):
                retry_prompt = prompt + """

IMPORTANT:
Do not provide full code or full solution.
Explain instead.
"""
                response_text = call_model(retry_prompt)

            response_text = enforce_idle_hint(response_text, req.run_status)
            
        # Fallback
        if not response_text or not response_text.strip():
            if message_mode == "casual":
                response_text = fallback_casual_reply(req.student_question)
            else:
                response_text = "I couldn't generate a useful response."

        return {
            "success": True,
            "mentor_reply": response_text,
        }

    except Exception as e:
        return {
            "success": False,
            "mentor_reply": "",
            "error": str(e),
        }