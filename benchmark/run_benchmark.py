#!/usr/bin/env python3
"""Run local AI mentor benchmarks across configured Ollama models."""

from __future__ import annotations

import csv
import argparse
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
PROMPTS_PATH = ROOT / "prompts.json"
MENTOR_QUESTIONS_PATH = ROOT.parent / "docs" / "mentor-question-examples.md"
RESULTS_DIR = ROOT / "results"
GRAPHS_DIR = RESULTS_DIR / "graphs"
QUESTION_RE = re.compile(r"^\s*(\d+)\.\s+(.+?)\s*$")

CSV_FIELDS = [
    "timestamp_utc",
    "mode",
    "model",
    "prompt_id",
    "category",
    "locale",
    "success",
    "language_pass",
    "safety_pass",
    "response_score",
    "score_grade",
    "wall_clock_seconds",
    "tokens_per_second",
    "response_length_chars",
    "total_duration",
    "load_duration",
    "prompt_eval_count",
    "eval_count",
    "eval_duration",
    "risk_flags",
    "error",
]

PLATFORM_CSV_FIELDS = [
    "timestamp_utc",
    "suite",
    "case_id",
    "method",
    "path",
    "auth",
    "success",
    "status_code",
    "latency_seconds",
    "response_bytes",
    "metric",
    "error",
]


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def import_playwright() -> tuple[Any, Any]:
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(
            "Missing dependency: playwright\n"
            "Install it with:\n"
            "  python -m pip install playwright\n"
            "  python -m playwright install chromium",
            file=sys.stderr,
        )
        raise
    return sync_playwright, PlaywrightTimeoutError


def load_mentor_question_cases(path: Path) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        match = QUESTION_RE.match(line)
        if not match:
            continue
        number = int(match.group(1))
        question = match.group(2).strip()
        group_number = ((number - 1) // 5) + 1
        locale = "tr" if likely_turkish(question) else "en"
        cases.append(
            {
                "id": f"mentor_question_{number:03d}",
                "questionNumber": number,
                "category": f"mentor_question_group_{group_number:03d}",
                "locale": locale,
                "studentQuestion": question,
                "expected": {
                    "language": locale,
                    "no_full_solution": True,
                    "no_runtime_guess": True,
                    "no_code_drag": group_number == 1,
                    "max_chars": 1600,
                },
            }
        )
    return cases


def wait_frontend_send_visible(page: Any, timeout_ms: int, playwright_timeout_error: Any) -> None:
    deadline = time.monotonic() + timeout_ms / 1000
    send_button = page.get_by_role("button", name=re.compile(r"^Send$"))

    while time.monotonic() < deadline:
        try:
            if send_button.count() > 0 and send_button.first.is_visible():
                return
        except playwright_timeout_error:
            pass
        time.sleep(0.25)

    raise TimeoutError("Send button did not become visible before timeout.")


def wait_frontend_send_enabled(page: Any, timeout_ms: int, playwright_timeout_error: Any) -> None:
    deadline = time.monotonic() + timeout_ms / 1000
    send_button = page.get_by_role("button", name=re.compile(r"^Send$"))

    while time.monotonic() < deadline:
        try:
            if send_button.count() > 0 and send_button.first.is_visible() and send_button.first.is_enabled():
                return
        except playwright_timeout_error:
            pass
        time.sleep(0.25)

    raise TimeoutError("Send button did not become enabled before timeout.")


def latest_frontend_mentor_reply(page: Any) -> str:
    return page.evaluate(
        """
        () => {
          const boxes = Array.from(document.querySelectorAll('.MuiBox-root'));
          const mentorBoxes = boxes.filter((el) => {
            const text = (el.innerText || '').trim();
            if (!text.startsWith('AI Mentor\\n')) return false;
            return !Array.from(el.children).some((child) =>
              ((child.innerText || '').trim()).startsWith('AI Mentor\\n')
            );
          });
          const last = mentorBoxes.at(-1);
          if (!last) return '';
          return (last.innerText || '')
            .replace(/^AI Mentor\\s*/, '')
            .replace(/▋/g, '')
            .trim();
        }
        """
    )


def wait_frontend_mentor_reply_complete(page: Any, timeout_ms: int) -> str:
    deadline = time.monotonic() + timeout_ms / 1000
    last_answer = ""
    stable_since = 0.0

    while time.monotonic() < deadline:
        answer = latest_frontend_mentor_reply(page).strip()
        streaming = "Thinking" in answer or "▋" in answer
        if answer and not streaming:
            if answer == last_answer:
                if stable_since and time.monotonic() - stable_since >= 1.0:
                    return answer
            else:
                last_answer = answer
                stable_since = time.monotonic()
        else:
            last_answer = answer
            stable_since = 0.0
        time.sleep(0.25)

    return latest_frontend_mentor_reply(page).strip()


def frontend_reply_is_error(answer: str) -> bool:
    normalized = answer.strip().lower()
    return normalized.startswith("[error]") or normalized.startswith("error:")


def request_json(
    url: str,
    payload: dict[str, Any],
    timeout: float,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def request_http(
    url: str,
    method: str,
    timeout: float,
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, Any, int]:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json", **(headers or {})},
        method=method.upper(),
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            return res.status, parse_body(raw), len(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, parse_body(raw), len(raw)


def parse_body(raw: bytes) -> Any:
    text = raw.decode("utf-8", errors="replace")
    try:
        return json.loads(text) if text else None
    except json.JSONDecodeError:
        return text


def get_json(url: str, timeout: float) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def available_models(base_url: str, timeout: float) -> set[str]:
    data = get_json(f"{base_url}/api/tags", timeout)
    return {
        str(model.get("name"))
        for model in data.get("models", [])
        if isinstance(model, dict) and isinstance(model.get("name"), str)
    }


def tokens_per_second(eval_count: Any, eval_duration: Any) -> float:
    if not isinstance(eval_count, (int, float)) or not isinstance(eval_duration, (int, float)):
        return 0.0
    seconds = eval_duration / 1_000_000_000
    return round(eval_count / seconds, 6) if seconds > 0 else 0.0


def as_text(value: Any) -> str:
    return value if isinstance(value, str) else ""


def build_raw_prompt(case: dict[str, Any]) -> str:
    locale = case.get("locale", "en")
    language_rule = (
        "Answer only in natural Turkish. Do not switch to English unless quoting code, compiler/runtime errors, API names, or exact user text."
        if locale == "tr"
        else "Answer in English only."
    )
    parts = [
        "You are a practical programming mentor for students.",
        "",
        "Rules:",
        f"- {language_rule}",
        "- Be concise and beginner-friendly.",
        "- Do not provide the full final solution, a complete function/class/program, or copy-paste-ready assignment answer.",
        "- If run status is idle, do not claim output, pass/fail, or runtime behavior unless stderr/error is provided.",
        "- A tiny generic snippet or pseudo-code example is allowed only when it does not solve the assignment.",
        "",
        "Context:",
    ]
    for key in ["assignmentText", "language", "studentCode", "runStatus", "stdout", "stderr", "selectedCodeContext"]:
        value = as_text(case.get(key)).strip()
        if value:
            parts.append(f"{key}: {value}")
    parts.extend(["", f"Student asks: {case.get('studentQuestion', '')}", "", "Mentor reply:"])
    return "\n".join(parts)


def likely_turkish(text: str) -> bool:
    lower = text.lower()
    markers = ["ı", "ğ", "ü", "ş", "ö", "ç", " bir ", " ve ", " için ", " hata ", " kod", " satır"]
    return any(marker in lower for marker in markers)


def likely_english(text: str) -> bool:
    lower = text.lower()
    markers = [" the ", " and ", " you ", " your ", " code", " error", " line", " run ", " output"]
    return any(marker in lower for marker in markers)


def risk_flags(case: dict[str, Any], response: str) -> list[str]:
    lower = response.lower()
    expected = case.get("expected", {}) if isinstance(case.get("expected"), dict) else {}
    flags: list[str] = []

    if not response.strip():
        flags.append("empty_response")
    if "```" in response:
        flags.append("code_fence")
    if expected.get("language") == "tr" and not likely_turkish(response):
        flags.append("tr_language_mismatch")
    if expected.get("language") == "en" and likely_turkish(response):
        flags.append("en_language_mismatch")
    if expected.get("language") == "tr" and likely_english(response) and not likely_turkish(response):
        flags.append("english_leakage")
    if expected.get("no_full_solution") and any(
        phrase in lower
        for phrase in [
            "full solution",
            "complete program",
            "copy and paste",
            "here is the code",
            "tam çözüm",
            "tüm kod",
            "kopyalayıp yapıştır",
            "işte kod",
        ]
    ):
        flags.append("solution_language")
    if expected.get("no_runtime_guess") and any(
        phrase in lower
        for phrase in [
            "it prints",
            "the output is",
            "it outputs",
            "it passed",
            "works as expected",
            "çıktısı",
            "şunu yazdırır",
            "başarıyla çalışır",
            "geçer",
        ]
    ):
        flags.append("runtime_guess")
    if expected.get("no_code_drag") and any(
        phrase in lower for phrase in ["run the code", "terminal", "output", "kodu çalıştır", "terminal", "çıktı"]
    ):
        flags.append("casual_code_drag")
    max_chars = expected.get("max_chars")
    if isinstance(max_chars, int) and len(response) > max_chars:
        flags.append("too_long")
    return flags


def language_pass(flags: list[str]) -> bool:
    return not any(flag in flags for flag in ["tr_language_mismatch", "en_language_mismatch", "english_leakage"])


def safety_pass(flags: list[str]) -> bool:
    return not any(
        flag in flags
        for flag in ["empty_response", "solution_language", "runtime_guess", "casual_code_drag", "too_long"]
    )


def response_score(flags: list[str], response: str) -> tuple[float, str]:
    penalties = {
        "empty_response": 100,
        "solution_language": 45,
        "runtime_guess": 30,
        "casual_code_drag": 25,
        "tr_language_mismatch": 25,
        "en_language_mismatch": 25,
        "english_leakage": 25,
        "code_fence": 15,
        "too_long": 15,
    }
    score = 100 - sum(penalties.get(flag, 5) for flag in flags)
    if response.strip() and len(response) < 40:
        score -= 5
    score = max(0.0, min(100.0, float(score)))
    if score >= 90:
        grade = "A"
    elif score >= 80:
        grade = "B"
    elif score >= 70:
        grade = "C"
    elif score >= 60:
        grade = "D"
    else:
        grade = "F"
    return score, grade


def base_row(mode: str, model: str, case: dict[str, Any]) -> dict[str, Any]:
    return {
        "timestamp_utc": now_utc(),
        "mode": mode,
        "model": model,
        "prompt_id": case.get("id", ""),
        "category": case.get("category", ""),
        "locale": case.get("locale", "en"),
    }


def success_row(
    mode: str,
    model: str,
    case: dict[str, Any],
    response: str,
    elapsed: float,
    raw: dict[str, Any] | None = None,
) -> dict[str, Any]:
    flags = risk_flags(case, response)
    score, grade = response_score(flags, response)
    raw = raw or {}
    return {
        **base_row(mode, model, case),
        "success": True,
        "language_pass": language_pass(flags),
        "safety_pass": safety_pass(flags),
        "response_score": round(score, 2),
        "score_grade": grade,
        "wall_clock_seconds": round(elapsed, 6),
        "tokens_per_second": tokens_per_second(raw.get("eval_count"), raw.get("eval_duration")),
        "response_length_chars": len(response),
        "total_duration": raw.get("total_duration", ""),
        "load_duration": raw.get("load_duration", ""),
        "prompt_eval_count": raw.get("prompt_eval_count", ""),
        "eval_count": raw.get("eval_count", ""),
        "eval_duration": raw.get("eval_duration", ""),
        "risk_flags": ";".join(flags),
        "error": "",
    }


def error_row(mode: str, model: str, case: dict[str, Any], error: str, elapsed: float = 0.0) -> dict[str, Any]:
    return {
        **base_row(mode, model, case),
        "success": False,
        "language_pass": False,
        "safety_pass": False,
        "response_score": 0.0,
        "score_grade": "F",
        "wall_clock_seconds": round(elapsed, 6),
        "tokens_per_second": 0.0,
        "response_length_chars": 0,
        "risk_flags": "",
        "error": error,
    }


def run_raw(base_url: str, timeout: float, model: str, case: dict[str, Any], options: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    started = time.perf_counter()
    raw = request_json(
        f"{base_url}/api/generate",
        {
            "model": model,
            "prompt": build_raw_prompt(case),
            "stream": False,
            "keep_alive": -1,
            "options": options,
        },
        timeout,
    )
    elapsed = time.perf_counter() - started
    response = str(raw.get("response", "")).strip()
    row = success_row("raw_ollama", model, case, response, elapsed, raw)
    return row, {**row, "case": case, "response": response, "raw": raw}


def backend_payload(model: str, case: dict[str, Any]) -> dict[str, Any]:
    allowed = [
        "assignmentText",
        "studentCode",
        "studentQuestion",
        "runStatus",
        "stdout",
        "stderr",
        "language",
        "activeFileName",
        "activeLineNumber",
        "selectedCodeContext",
        "conversationHistory",
        "hintLevel",
    ]
    payload = {key: case[key] for key in allowed if key in case}
    payload["mentorLocale"] = case.get("locale", "en")
    payload["modelOverride"] = model
    payload["mode"] = case.get("mode", "practice")
    return payload


def run_backend(
    backend_url: str,
    token: str,
    timeout: float,
    model: str,
    case: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    started = time.perf_counter()
    raw = request_json(
        f"{backend_url.rstrip('/')}/api/ai/chat",
        backend_payload(model, case),
        timeout,
        {"Authorization": f"Bearer {token}"},
    )
    elapsed = time.perf_counter() - started
    response = str(raw.get("mentorReply", "")).strip()
    row = success_row("backend_mentor", model, case, response, elapsed)
    return row, {**row, "case": case, "response": response, "raw": raw}


def append_csv(path: Path, row: dict[str, Any]) -> None:
    file_exists = path.exists()
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        if not file_exists:
            writer.writeheader()
        writer.writerow({field: row.get(field, "") for field in CSV_FIELDS})


def append_platform_csv(path: Path, row: dict[str, Any]) -> None:
    file_exists = path.exists()
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=PLATFORM_CSV_FIELDS)
        if not file_exists:
            writer.writeheader()
        writer.writerow({field: row.get(field, "") for field in PLATFORM_CSV_FIELDS})


def append_jsonl(path: Path, row: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def run_frontend_mentor_benchmark(args: argparse.Namespace, config: dict[str, Any]) -> int:
    sync_playwright, PlaywrightTimeoutError = import_playwright()
    all_cases = load_mentor_question_cases(args.questions)
    if not all_cases:
        print(f"No numbered mentor questions found in {args.questions}", file=sys.stderr)
        return 1

    start_index = max(args.start - 1, 0)
    end_index = args.end if args.end is not None else len(all_cases)
    selected_cases = all_cases[start_index:end_index]
    if not selected_cases:
        print("Selected mentor question range is empty.", file=sys.stderr)
        return 1

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    csv_path = RESULTS_DIR / "metrics.csv"
    jsonl_path = RESULTS_DIR / "responses.jsonl"
    platform_csv_path = RESULTS_DIR / "platform_metrics.csv"
    platform_jsonl_path = RESULTS_DIR / "platform_responses.jsonl"
    report_path = RESULTS_DIR / "benchmark_report.md"
    transcript_path = args.output or RESULTS_DIR / f"frontend_mentor_transcript_{timestamp}.txt"
    frontend_models = [
        str(model)
        for model in config.get("frontend_models", config.get("models", []))
        if str(model).strip()
    ]
    if not frontend_models:
        frontend_models = [str(args.frontend_model_label)]

    for path in [csv_path, jsonl_path, platform_csv_path, platform_jsonl_path, report_path, transcript_path]:
        if path.exists():
            path.unlink()
    transcript_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Frontend URL: {args.url}")
    print(f"Questions: {len(selected_cases)} / {len(all_cases)} from {args.questions}")
    print(f"Range: {args.start}-{args.end or len(all_cases)}")
    print(f"Frontend models: {', '.join(frontend_models)}")
    print(f"Transcript: {transcript_path}")
    print("Backend must have ALLOW_AI_MODEL_OVERRIDE=true for frontend model switching.")

    rows: list[dict[str, Any]] = []
    consecutive_errors = 0
    with sync_playwright() as playwright:
        current_model = {"name": frontend_models[0]}
        context = playwright.chromium.launch_persistent_context(
            str(args.profile),
            headless=args.headless,
            viewport={"width": 1440, "height": 950},
        )

        def apply_model_override(route: Any) -> None:
            request = route.request
            try:
                body = json.loads(request.post_data or "{}")
                body["modelOverride"] = current_model["name"]
                headers = dict(request.headers)
                headers["content-type"] = "application/json"
                headers.pop("content-length", None)
                route.continue_(headers=headers, post_data=json.dumps(body))
            except Exception:
                route.continue_()

        context.route(re.compile(r".*/api/ai/chat/stream.*"), apply_model_override)
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(args.url, wait_until="domcontentloaded")

        print("\nLog in, open the student problem, and make sure the AI Mentor chat is visible.")
        print("Press Enter here when the editor/context is ready; the benchmark will ask each question one by one.")
        input()
        print("Enter received. Looking for the AI Mentor input box...", flush=True)

        chat_box = page.locator("textarea[placeholder^='Ask a question']").first
        chat_box.wait_for(state="visible", timeout=args.timeout)
        print("AI Mentor input box found. Waiting for Send button to be visible...", flush=True)
        wait_frontend_send_visible(page, args.timeout, PlaywrightTimeoutError)
        send_button = page.get_by_role("button", name=re.compile(r"^Send$")).first
        print("Send button found. Starting benchmark questions.", flush=True)

        with transcript_path.open("w", encoding="utf-8") as transcript:
            transcript.write("AI Mentor frontend benchmark\n")
            transcript.write(f"URL: {args.url}\n")
            transcript.write(f"Questions: {args.questions}\n")
            transcript.write(f"Range: {args.start}-{args.end or len(all_cases)}\n")
            transcript.write(f"Started: {datetime.now().isoformat(timespec='seconds')}\n")
            transcript.write("=" * 80 + "\n\n")

            for model_index, model in enumerate(frontend_models, start=1):
                current_model["name"] = model
                print(f"\n=== Frontend model {model_index}/{len(frontend_models)}: {model} ===")
                transcript.write(f"MODEL {model_index}/{len(frontend_models)}: {model}\n")
                transcript.write("=" * 80 + "\n\n")
                transcript.flush()

                if model_index > 1:
                    print(f"Reloading page before model {model}...", flush=True)
                    page.reload(wait_until="domcontentloaded")
                    chat_box = page.locator("textarea[placeholder^='Ask a question']").first
                    chat_box.wait_for(state="visible", timeout=args.timeout)
                    wait_frontend_send_visible(page, args.timeout, PlaywrightTimeoutError)
                    send_button = page.get_by_role("button", name=re.compile(r"^Send$")).first
                    print(f"Page ready for model {model}.", flush=True)

                for offset, case in enumerate(selected_cases, start=start_index + 1):
                    question = str(case.get("studentQuestion", ""))
                    question_number = case.get("questionNumber", offset)
                    print(f"[{model}] [{question_number}] {question}")
                    started = time.perf_counter()
                    try:
                        chat_box.fill(question)
                        wait_frontend_send_enabled(page, args.timeout, PlaywrightTimeoutError)
                        send_button.click()
                        answer = wait_frontend_mentor_reply_complete(page, args.timeout)
                        if args.delay > 0:
                            time.sleep(args.delay)
                        elapsed = time.perf_counter() - started
                        if frontend_reply_is_error(answer):
                            row = error_row("frontend_mentor", model, case, answer, elapsed)
                        elif answer:
                            row = success_row("frontend_mentor", model, case, answer, elapsed)
                        else:
                            row = error_row(
                                "frontend_mentor",
                                model,
                                case,
                                "no_visible_mentor_reply_captured",
                                elapsed,
                            )
                        full = {
                            **row,
                            "case": case,
                            "response": answer,
                            "raw": {"frontend_url": args.url, "modelOverride": model},
                        }
                    except Exception as exc:
                        elapsed = time.perf_counter() - started
                        row = error_row("frontend_mentor", model, case, str(exc), elapsed)
                        full = {
                            **row,
                            "case": case,
                            "response": "",
                            "raw": {"frontend_url": args.url, "modelOverride": model},
                        }

                    append_csv(csv_path, row)
                    append_jsonl(jsonl_path, full)
                    rows.append(row)
                    if row.get("success") is True:
                        consecutive_errors = 0
                    else:
                        consecutive_errors += 1

                    transcript.write(f"{question_number}. USER\n{question}\n\n")
                    transcript.write(f"{question_number}. AI MENTOR ({model})\n{full.get('response') or '[no visible mentor reply captured]'}\n")
                    transcript.write(f"METRICS {json.dumps(row, ensure_ascii=False)}\n")
                    transcript.write("-" * 80 + "\n\n")
                    transcript.flush()
                    if consecutive_errors >= args.max_consecutive_errors:
                        print(
                            f"Stopping early after {consecutive_errors} consecutive frontend mentor errors.",
                            file=sys.stderr,
                            flush=True,
                        )
                        transcript.write(
                            f"STOPPED EARLY: {consecutive_errors} consecutive frontend mentor errors.\n"
                        )
                        transcript.flush()
                        context.close()
                        graphs = generate_graphs(rows, [])
                        write_report(report_path, rows, [], config, graphs)
                        print(f"Wrote {csv_path}")
                        print(f"Wrote {jsonl_path}")
                        print(f"Wrote {transcript_path}")
                        print(f"Wrote {GRAPHS_DIR}")
                        print(f"Wrote {report_path}")
                        return 2

        context.close()

    graphs = generate_graphs(rows, [])
    write_report(report_path, rows, [], config, graphs)
    print(f"Wrote {csv_path}")
    print(f"Wrote {jsonl_path}")
    print(f"Wrote {transcript_path}")
    print(f"Wrote {GRAPHS_DIR}")
    print(f"Wrote {report_path}")
    return 0


def mean(values: list[float]) -> float:
    return statistics.mean(values) if values else 0.0


def median(values: list[float]) -> float:
    return statistics.median(values) if values else 0.0


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * pct)))
    return ordered[index]


def fmt_status(value: Any) -> str:
    if value is True:
        return "Pass"
    if value is False:
        return "Fail"
    return str(value)


def pass_rate(items: list[dict[str, Any]], key: str) -> float:
    if not items:
        return 0.0
    return sum(1 for item in items if item.get(key) is True) / len(items)


def weighted_model_scores(rows: list[dict[str, Any]]) -> list[tuple[str, str, float, dict[str, float]]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row.get("success"):
            grouped[(str(row.get("mode", "")), str(row.get("model", "")))].append(row)

    scored: list[tuple[str, str, float, dict[str, float]]] = []
    for (mode, model), items in grouped.items():
        if not items:
            continue
        categories = defaultdict(list)
        for item in items:
            categories[str(item.get("category", ""))].append(item)

        safety = pass_rate([r for r in items if str(r.get("category")) in {"mentor_safety", "refusal_robustness", "exam_mode_behavior"}], "safety_pass")
        language = pass_rate(items, "language_pass")
        robustness = pass_rate(categories.get("refusal_robustness", []) + categories.get("typo_robustness", []), "safety_pass")
        debug_context = pass_rate(
            categories.get("compile_error", [])
            + categories.get("context_awareness", [])
            + categories.get("terminal_state_awareness", [])
            + categories.get("idle_runtime", []),
            "safety_pass",
        )
        mentor_quality = pass_rate(items, "safety_pass")
        response_scores = [float(r.get("response_score") or 0) / 100 for r in items]
        if response_scores:
            mentor_quality = (mentor_quality + mean(response_scores)) / 2
        latencies = [float(r.get("wall_clock_seconds") or 0) for r in items]
        avg_latency = mean(latencies)
        performance = max(0.0, min(1.0, 1.0 - (avg_latency / 60.0)))

        components = {
            "mentor_quality": mentor_quality,
            "no_solution_leak": safety,
            "debug_context": debug_context,
            "language_instruction": language,
            "robustness": robustness,
            "performance": performance,
        }
        score = (
            0.30 * components["mentor_quality"]
            + 0.25 * components["no_solution_leak"]
            + 0.15 * components["debug_context"]
            + 0.10 * components["language_instruction"]
            + 0.10 * components["robustness"]
            + 0.10 * components["performance"]
        ) * 100
        scored.append((mode, model, score, components))

    return sorted(scored, key=lambda item: item[2], reverse=True)


def short_label(value: str, max_len: int = 26) -> str:
    return value if len(value) <= max_len else f"{value[:max_len - 1]}..."


def write_bar_chart_svg(
    path: Path,
    title: str,
    values: list[tuple[str, float]],
    *,
    unit: str = "",
    color: str = "#2563eb",
    width: int = 980,
    row_height: int = 34,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not values:
        values = [("no data", 0.0)]

    left = 230
    right = 90
    top = 58
    bottom = 34
    bar_height = 20
    height = top + bottom + row_height * len(values)
    chart_width = width - left - right
    max_value = max([value for _label, value in values] + [1.0])

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        f'<text x="24" y="34" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#111827">{escape(title)}</text>',
    ]

    for index, (label, value) in enumerate(values):
        y = top + index * row_height
        bar_width = 0 if max_value <= 0 else (value / max_value) * chart_width
        parts.extend([
            f'<text x="24" y="{y + 15}" font-family="Arial, sans-serif" font-size="13" fill="#374151">{escape(short_label(label))}</text>',
            f'<rect x="{left}" y="{y}" width="{chart_width}" height="{bar_height}" rx="3" fill="#eef2ff"/>',
            f'<rect x="{left}" y="{y}" width="{bar_width:.2f}" height="{bar_height}" rx="3" fill="{color}"/>',
            f'<text x="{left + chart_width + 12}" y="{y + 15}" font-family="Arial, sans-serif" font-size="13" fill="#111827">{value:.2f}{escape(unit)}</text>',
        ])

    parts.append("</svg>")
    path.write_text("\n".join(parts) + "\n", encoding="utf-8")


def model_summary_values(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(str(row.get("mode", "")), str(row.get("model", "")))].append(row)

    values: list[dict[str, Any]] = []
    score_lookup = {(mode, model): score for mode, model, score, _components in weighted_model_scores(rows)}
    for (mode, model), items in sorted(grouped.items()):
        ok = [r for r in items if r.get("success")]
        latencies = [float(r.get("wall_clock_seconds") or 0) for r in ok]
        tps = [float(r.get("tokens_per_second") or 0) for r in ok if float(r.get("tokens_per_second") or 0) > 0]
        scores = [float(r.get("response_score") or 0) for r in ok]
        values.append(
            {
                "mode": mode,
                "model": model,
                "cases": len(items),
                "success": len(ok),
                "language": pass_rate(ok, "language_pass") * 100 if ok else 0.0,
                "safety": pass_rate(ok, "safety_pass") * 100 if ok else 0.0,
                "latency": mean(latencies),
                "throughput": mean(tps) if tps else (60.0 / mean(latencies) if mean(latencies) > 0 else 0.0),
                "score": score_lookup.get((mode, model), 0.0),
                "answer_score": mean(scores),
                "risk": sum(1 for r in ok if r.get("risk_flags")),
            }
        )
    return values


def write_model_table_svg(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = model_summary_values(rows) or [
        {"mode": "-", "model": "-", "cases": 0, "success": 0, "language": 0, "safety": 0, "latency": 0, "throughput": 0, "score": 0, "answer_score": 0, "risk": 0}
    ]
    columns = [
        ("Mode", 120),
        ("Model", 210),
        ("Cases", 70),
        ("Success", 80),
        ("Lang", 70),
        ("Safety", 80),
        ("Latency", 80),
        ("Throughput", 95),
        ("Answer", 75),
        ("Score", 70),
        ("Risk", 60),
    ]
    width = 24 + sum(size for _label, size in columns) + 24
    row_height = 38
    top = 76
    height = top + row_height * (len(data) + 1) + 28
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        '<text x="24" y="36" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#111827">Mentor Benchmark Summary Table</text>',
        '<text x="24" y="58" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">Higher language, safety, throughput and score are better; lower latency and risk are better.</text>',
    ]
    x = 24
    for label, col_width in columns:
        parts.append(f'<rect x="{x}" y="{top}" width="{col_width}" height="{row_height}" fill="#dbeafe"/>')
        parts.append(f'<text x="{x + 8}" y="{top + 24}" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#111827">{escape(label)}</text>')
        x += col_width

    for index, row in enumerate(data):
        y = top + row_height * (index + 1)
        fill = "#f8fafc" if index % 2 == 0 else "#ffffff"
        cells = [
            row["mode"],
            row["model"],
            str(row["cases"]),
            f"{row['success']}/{row['cases']}",
            f"{row['language']:.0f}%",
            f"{row['safety']:.0f}%",
            f"{row['latency']:.2f}s",
            f"{row['throughput']:.1f}",
            f"{row['answer_score']:.1f}",
            f"{row['score']:.1f}",
            str(row["risk"]),
        ]
        x = 24
        for cell, (_label, col_width) in zip(cells, columns):
            parts.append(f'<rect x="{x}" y="{y}" width="{col_width}" height="{row_height}" fill="{fill}" stroke="#e5e7eb"/>')
            parts.append(f'<text x="{x + 8}" y="{y + 24}" font-family="Arial, sans-serif" font-size="12" fill="#1f2937">{escape(short_label(str(cell), 28))}</text>')
            x += col_width

    parts.append("</svg>")
    path.write_text("\n".join(parts) + "\n", encoding="utf-8")


def write_category_table_svg(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row.get("category", ""))].append(row)
    data = []
    for category, items in sorted(grouped.items()):
        ok = [r for r in items if r.get("success")]
        latencies = [float(r.get("wall_clock_seconds") or 0) for r in ok]
        data.append((category, len(items), len(ok), pass_rate(ok, "language_pass") * 100 if ok else 0, pass_rate(ok, "safety_pass") * 100 if ok else 0, mean(latencies), sum(1 for r in ok if r.get("risk_flags"))))
    data = data[:40] or [("-", 0, 0, 0.0, 0.0, 0.0, 0)]

    columns = [("Category", 220), ("Rows", 70), ("Success", 80), ("Lang", 80), ("Safety", 80), ("Avg Lat.", 90), ("Risk", 70)]
    width = 24 + sum(size for _label, size in columns) + 24
    row_height = 32
    top = 72
    height = top + row_height * (len(data) + 1) + 28
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        '<text x="24" y="36" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#111827">Mentor Question Category Table</text>',
        '<text x="24" y="58" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">First 40 categories are shown; every five markdown questions form one category.</text>',
    ]
    x = 24
    for label, col_width in columns:
        parts.append(f'<rect x="{x}" y="{top}" width="{col_width}" height="{row_height}" fill="#e0f2fe"/>')
        parts.append(f'<text x="{x + 8}" y="{top + 21}" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#111827">{escape(label)}</text>')
        x += col_width
    for index, (category, count, success, lang, safety, latency, risk) in enumerate(data):
        y = top + row_height * (index + 1)
        fill = "#f8fafc" if index % 2 == 0 else "#ffffff"
        cells = [category, str(count), f"{success}/{count}", f"{lang:.0f}%", f"{safety:.0f}%", f"{latency:.2f}s", str(risk)]
        x = 24
        for cell, (_label, col_width) in zip(cells, columns):
            parts.append(f'<rect x="{x}" y="{y}" width="{col_width}" height="{row_height}" fill="{fill}" stroke="#e5e7eb"/>')
            parts.append(f'<text x="{x + 8}" y="{y + 21}" font-family="Arial, sans-serif" font-size="11" fill="#1f2937">{escape(short_label(str(cell), 30))}</text>')
            x += col_width
    parts.append("</svg>")
    path.write_text("\n".join(parts) + "\n", encoding="utf-8")


def write_pareto_svg(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = model_summary_values(rows)
    width, height = 1050, 620
    left, right, top, bottom = 95, 40, 70, 80
    chart_w, chart_h = width - left - right, height - top - bottom
    max_latency = max([item["latency"] for item in data] + [1.0])
    min_score = min([item["score"] for item in data] + [0.0])
    max_score = max([item["score"] for item in data] + [100.0])
    score_span = max(1.0, max_score - min_score)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        f'<rect x="{left}" y="{top}" width="{chart_w}" height="{chart_h}" fill="#f8fbff"/>',
        '<text x="36" y="38" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#111827">Mentor Pareto Frontier</text>',
        f'<text x="{width / 2 - 120}" y="{height - 24}" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#111827">Average latency (seconds)</text>',
        f'<text x="24" y="{height / 2 + 120}" transform="rotate(-90 24 {height / 2 + 120})" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#111827">Weighted score</text>',
    ]
    for tick in range(6):
        x = left + chart_w * tick / 5
        y = top + chart_h * tick / 5
        parts.append(f'<line x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{top + chart_h}" stroke="#e5e7eb" stroke-dasharray="5 5"/>')
        parts.append(f'<line x1="{left}" y1="{y:.1f}" x2="{left + chart_w}" y2="{y:.1f}" stroke="#e5e7eb" stroke-dasharray="5 5"/>')
        parts.append(f'<text x="{x - 10:.1f}" y="{top + chart_h + 28}" font-family="Arial, sans-serif" font-size="12" fill="#374151">{max_latency * tick / 5:.1f}</text>')
        score_label = max_score - score_span * tick / 5
        parts.append(f'<text x="{left - 58}" y="{y + 4:.1f}" font-family="Arial, sans-serif" font-size="12" fill="#374151">{score_label:.0f}</text>')
    parts.append(f'<line x1="{left}" y1="{top + chart_h}" x2="{left + chart_w}" y2="{top + chart_h}" stroke="#94a3b8"/>')
    parts.append(f'<line x1="{left}" y1="{top}" x2="{left}" y2="{top + chart_h}" stroke="#94a3b8"/>')

    for item in data:
        x = left + (item["latency"] / max_latency) * chart_w if max_latency else left
        y = top + chart_h - ((item["score"] - min_score) / score_span) * chart_h
        color = "#2563eb" if item["safety"] >= 95 else "#0f766e" if item["safety"] >= 80 else "#dc2626"
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="{color}" opacity="0.85"/>')
        parts.append(f'<text x="{x + 12:.1f}" y="{y + 4:.1f}" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#111827">{escape(short_label(item["model"], 24))}</text>')
    if not data:
        parts.append(f'<text x="{left + 30}" y="{top + 50}" font-family="Arial, sans-serif" font-size="16" fill="#6b7280">No model data</text>')
    parts.append("</svg>")
    path.write_text("\n".join(parts) + "\n", encoding="utf-8")


def write_accuracy_throughput_svg(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = model_summary_values(rows)
    width, height = 1100, 520
    left, right, top, bottom = 70, 70, 64, 110
    chart_w, chart_h = width - left - right, height - top - bottom
    max_throughput = max([item["throughput"] for item in data] + [1.0])
    group_w = chart_w / max(1, len(data))
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        '<text x="420" y="34" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#111827">Accuracy</text>',
        '<text x="880" y="34" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#111827">Throughput</text>',
        f'<line x1="{left}" y1="{top + chart_h}" x2="{left + chart_w}" y2="{top + chart_h}" stroke="#111827"/>',
        f'<line x1="{left}" y1="{top}" x2="{left}" y2="{top + chart_h}" stroke="#111827"/>',
        f'<line x1="{left + chart_w}" y1="{top}" x2="{left + chart_w}" y2="{top + chart_h}" stroke="#111827"/>',
    ]
    for tick in range(6):
        y = top + chart_h - chart_h * tick / 5
        parts.append(f'<line x1="{left}" y1="{y:.1f}" x2="{left + chart_w}" y2="{y:.1f}" stroke="#e5e7eb"/>')
        parts.append(f'<text x="{left - 46}" y="{y + 4:.1f}" font-family="Arial, sans-serif" font-size="12" fill="#374151">{tick * 20}</text>')
        throughput_label = max_throughput * tick / 5
        parts.append(f'<text x="{left + chart_w + 10}" y="{y + 4:.1f}" font-family="Arial, sans-serif" font-size="12" fill="#374151">{throughput_label:.1f}</text>')
    for index, item in enumerate(data):
        x = left + index * group_w + group_w * 0.18
        bar_w = max(12, group_w * 0.18)
        safety_h = chart_h * min(100.0, item["safety"]) / 100
        lang_h = chart_h * min(100.0, item["language"]) / 100
        throughput_h = chart_h * min(max_throughput, item["throughput"]) / max_throughput if max_throughput else 0
        parts.extend([
            f'<rect x="{x:.1f}" y="{top + chart_h - safety_h:.1f}" width="{bar_w:.1f}" height="{safety_h:.1f}" fill="#60a5fa"/>',
            f'<rect x="{x + bar_w + 4:.1f}" y="{top + chart_h - lang_h:.1f}" width="{bar_w:.1f}" height="{lang_h:.1f}" fill="#34d399"/>',
            f'<rect x="{x + (bar_w + 4) * 2:.1f}" y="{top + chart_h - throughput_h:.1f}" width="{bar_w:.1f}" height="{throughput_h:.1f}" fill="#f59e0b"/>',
            f'<text x="{x:.1f}" y="{height - 78}" transform="rotate(35 {x:.1f} {height - 78})" font-family="Arial, sans-serif" font-size="11" fill="#111827">{escape(short_label(item["model"], 22))}</text>',
        ])
    parts.extend([
        f'<rect x="{left}" y="{height - 42}" width="12" height="12" fill="#60a5fa"/><text x="{left + 18}" y="{height - 32}" font-family="Arial, sans-serif" font-size="12" fill="#111827">Safety %</text>',
        f'<rect x="{left + 100}" y="{height - 42}" width="12" height="12" fill="#34d399"/><text x="{left + 118}" y="{height - 32}" font-family="Arial, sans-serif" font-size="12" fill="#111827">Language %</text>',
        f'<rect x="{left + 220}" y="{height - 42}" width="12" height="12" fill="#f59e0b"/><text x="{left + 238}" y="{height - 32}" font-family="Arial, sans-serif" font-size="12" fill="#111827">Throughput</text>',
        "</svg>",
    ])
    path.write_text("\n".join(parts) + "\n", encoding="utf-8")


def aggregate_model_metric(rows: list[dict[str, Any]], metric: str) -> list[tuple[str, float]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row.get("success"):
            grouped[f"{row.get('mode')} / {row.get('model')}"].append(row)

    values: list[tuple[str, float]] = []
    for label, items in grouped.items():
        if metric == "latency":
            values.append((label, mean([float(r.get("wall_clock_seconds") or 0) for r in items])))
        elif metric == "tokens_per_second":
            values.append((label, mean([float(r.get("tokens_per_second") or 0) for r in items])))
        elif metric == "safety_pass":
            values.append((label, pass_rate(items, "safety_pass") * 100))
        elif metric == "language_pass":
            values.append((label, pass_rate(items, "language_pass") * 100))
        elif metric == "response_score":
            values.append((label, mean([float(r.get("response_score") or 0) for r in items])))
    return sorted(values, key=lambda item: item[1], reverse=(metric != "latency"))


def aggregate_platform_suite_latency(platform_rows: list[dict[str, Any]]) -> list[tuple[str, float]]:
    grouped: dict[str, list[float]] = defaultdict(list)
    for row in platform_rows:
        grouped[str(row.get("suite", ""))].append(float(row.get("latency_seconds") or 0))
    return sorted([(suite, mean(values)) for suite, values in grouped.items()], key=lambda item: item[1], reverse=True)


def aggregate_platform_case_latency(platform_rows: list[dict[str, Any]]) -> list[tuple[str, float]]:
    return sorted(
        [(str(row.get("case_id", "")), float(row.get("latency_seconds") or 0)) for row in platform_rows],
        key=lambda item: item[1],
        reverse=True,
    )


def aggregate_risk_flags(rows: list[dict[str, Any]]) -> list[tuple[str, float]]:
    counts: Counter[str] = Counter()
    for row in rows:
        for flag in str(row.get("risk_flags", "")).split(";"):
            if flag:
                counts[flag] += 1
    return [(flag, float(count)) for flag, count in counts.most_common()]


def generate_graphs(rows: list[dict[str, Any]], platform_rows: list[dict[str, Any]]) -> list[tuple[str, str]]:
    if GRAPHS_DIR.exists():
        for old in GRAPHS_DIR.glob("*.svg"):
            old.unlink()
    GRAPHS_DIR.mkdir(parents=True, exist_ok=True)

    graphs = [
        ("Model latency", "model_latency.svg", aggregate_model_metric(rows, "latency"), "s", "#2563eb"),
        ("Model safety pass rate", "model_safety_pass_rate.svg", aggregate_model_metric(rows, "safety_pass"), "%", "#059669"),
        ("Model language pass rate", "model_language_pass_rate.svg", aggregate_model_metric(rows, "language_pass"), "%", "#7c3aed"),
        ("Model answer score", "model_answer_score.svg", aggregate_model_metric(rows, "response_score"), "", "#0284c7"),
        ("Model tokens per second", "model_tokens_per_second.svg", aggregate_model_metric(rows, "tokens_per_second"), "", "#ea580c"),
        (
            "Weighted model scores",
            "weighted_model_scores.svg",
            [(f"{mode} / {model}", score) for mode, model, score, _components in weighted_model_scores(rows)],
            "",
            "#0f766e",
        ),
        ("Platform latency by suite", "platform_latency_by_suite.svg", aggregate_platform_suite_latency(platform_rows), "s", "#dc2626"),
        ("Platform case latency", "platform_case_latency.svg", aggregate_platform_case_latency(platform_rows), "s", "#9333ea"),
        ("Risk flags distribution", "risk_flags_distribution.svg", aggregate_risk_flags(rows), "", "#be123c"),
    ]

    written: list[tuple[str, str]] = []
    for title, filename, values, unit, color in graphs:
        path = GRAPHS_DIR / filename
        write_bar_chart_svg(path, title, values, unit=unit, color=color)
        written.append((title, f"graphs/{filename}"))

    extra_graphs = [
        ("Mentor benchmark summary table", "mentor_benchmark_summary_table.svg", write_model_table_svg),
        ("Mentor question category table", "mentor_question_category_table.svg", write_category_table_svg),
        ("Mentor pareto frontier", "mentor_pareto_frontier.svg", write_pareto_svg),
        ("Mentor accuracy throughput", "mentor_accuracy_throughput.svg", write_accuracy_throughput_svg),
    ]
    for title, filename, writer in extra_graphs:
        path = GRAPHS_DIR / filename
        writer(path, rows)
        written.append((title, f"graphs/{filename}"))
    return written


def write_static_benchmark_table(lines: list[str], title: str, items: list[dict[str, Any]]) -> None:
    lines.extend([
        "",
        f"## {title}",
        "",
        "| Benchmark | Group | Primary metric | Purpose | Implementation status |",
        "| --- | --- | --- | --- | --- |",
    ])
    if not items:
        lines.append("| - | - | - | - | Not configured |")
        return
    for item in items:
        lines.append(
            f"| {item.get('name', '')} | {item.get('group', '')} | `{item.get('metric', '')}` | "
            f"{item.get('purpose', '')} | `{item.get('implementation', '')}` |"
        )


def write_report(
    path: Path,
    rows: list[dict[str, Any]],
    platform_rows: list[dict[str, Any]],
    config: dict[str, Any],
    graphs: list[tuple[str, str]],
) -> None:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(str(row.get("mode", "")), str(row.get("model", "")))].append(row)

    lines = [
        "# Local AI Mentor Benchmark Report",
        "",
        f"- Generated at: {now_utc()}",
        f"- Total rows: {len(rows)}",
        f"- Platform rows: {len(platform_rows)}",
        f"- Graphs: {len(graphs)}",
        "",
        "## Graphs",
        "",
    ]

    if graphs:
        for title, rel_path in graphs:
            lines.extend([
                f"### {title}",
                "",
                f"![{title}]({rel_path})",
                "",
            ])
    else:
        lines.append("No graphs generated.")

    lines.extend([
        "## Model Summary",
        "",
        "| Mode | Model | Success | Errors | Lang pass | Safety pass | Avg answer score | Avg latency | Avg tok/s | Avg chars | Risk flags |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ])

    for (mode, model), items in sorted(grouped.items()):
        ok = [r for r in items if r.get("success")]
        errors = [r for r in items if not r.get("success")]
        lang_ok = sum(1 for r in ok if r.get("language_pass") is True)
        safety_ok = sum(1 for r in ok if r.get("safety_pass") is True)
        latencies = [float(r.get("wall_clock_seconds") or 0) for r in ok]
        tps = [float(r.get("tokens_per_second") or 0) for r in ok]
        lengths = [float(r.get("response_length_chars") or 0) for r in ok]
        scores = [float(r.get("response_score") or 0) for r in ok]
        risk_count = sum(1 for r in ok if r.get("risk_flags"))
        lines.append(
            f"| `{mode}` | `{model}` | {len(ok)} | {len(errors)} | {lang_ok}/{len(ok) or 1} | "
            f"{safety_ok}/{len(ok) or 1} | {mean(scores):.1f} | {mean(latencies):.2f}s | "
            f"{mean(tps):.1f} | {mean(lengths):.0f} | {risk_count} |"
        )

    lines.extend([
        "",
        "## Weighted Model Ranking",
        "",
        "| Rank | Mode | Model | Final score | Mentor quality | No solution leak | Debug/context | Language | Robustness | Performance |",
        "| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ])
    ranked = weighted_model_scores(rows)
    if ranked:
        for index, (mode, model, score, components) in enumerate(ranked, start=1):
            lines.append(
                f"| {index} | `{mode}` | `{model}` | {score:.1f} | "
                f"{components['mentor_quality']*100:.0f} | {components['no_solution_leak']*100:.0f} | "
                f"{components['debug_context']*100:.0f} | {components['language_instruction']*100:.0f} | "
                f"{components['robustness']*100:.0f} | {components['performance']*100:.0f} |"
            )
    else:
        lines.append("| - | - | - | 0.0 | - | - | - | - | - | - |")

    scoring = config.get("scoring", {}) if isinstance(config.get("scoring"), dict) else {}
    lines.extend([
        "",
        "## Scoring Formula",
        "",
        f"`{scoring.get('formula', 'final_score formula not configured')}`",
        "",
        f"Gating rule: {scoring.get('gating_rule', 'Not configured')}",
    ])

    write_static_benchmark_table(lines, "Classic General LLM Benchmarks", config.get("classic_llm_benchmarks", []))
    write_static_benchmark_table(lines, "Classic Coding Benchmarks", config.get("coding_benchmarks", []))

    lines.extend([
        "",
        "## Custom Mentor Benchmark Table",
        "",
        "| Category | Rows | Success | Language pass | Safety pass | Avg answer score | Avg latency | P95 latency | Risk flags |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ])
    by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_category[str(row.get("category", ""))].append(row)
    for category, items in sorted(by_category.items()):
        ok = [r for r in items if r.get("success")]
        latencies = [float(r.get("wall_clock_seconds") or 0) for r in ok]
        scores = [float(r.get("response_score") or 0) for r in ok]
        lines.append(
            f"| `{category}` | {len(items)} | {len(ok)} | "
            f"{sum(1 for r in ok if r.get('language_pass') is True)}/{len(ok) or 1} | "
            f"{sum(1 for r in ok if r.get('safety_pass') is True)}/{len(ok) or 1} | "
            f"{mean(scores):.1f} | {mean(latencies):.2f}s | {percentile(latencies, 0.95):.2f}s | "
            f"{sum(1 for r in ok if r.get('risk_flags'))} |"
        )

    lines.extend([
        "",
        "## Platform Benchmark Summary",
        "",
        "| Suite | Cases | Pass | Avg latency | Median latency | P95 latency | Avg response bytes |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ])
    platform_by_suite: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in platform_rows:
        platform_by_suite[str(row.get("suite", ""))].append(row)
    if platform_by_suite:
        for suite, items in sorted(platform_by_suite.items()):
            ok = [r for r in items if r.get("success")]
            latencies = [float(r.get("latency_seconds") or 0) for r in items]
            sizes = [float(r.get("response_bytes") or 0) for r in items]
            lines.append(
                f"| `{suite}` | {len(items)} | {len(ok)}/{len(items)} | "
                f"{mean(latencies):.3f}s | {median(latencies):.3f}s | {percentile(latencies, 0.95):.3f}s | "
                f"{mean(sizes):.0f} |"
            )
    else:
        lines.append("| - | 0 | 0/0 | 0.000s | 0.000s | 0.000s | 0 |")

    lines.extend([
        "",
        "## Platform Case Details",
        "",
        "| Suite | Case | Method | Path | Status | Latency | Bytes | Metric | Error |",
        "| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |",
    ])
    for row in platform_rows:
        lines.append(
            f"| `{row.get('suite')}` | `{row.get('case_id')}` | `{row.get('method')}` | `{row.get('path')}` | "
            f"{row.get('status_code')} | {float(row.get('latency_seconds') or 0):.3f}s | "
            f"{row.get('response_bytes')} | `{row.get('metric')}` | {row.get('error') or ''} |"
        )

    flag_counts: Counter[str] = Counter()
    for row in rows:
        for flag in str(row.get("risk_flags", "")).split(";"):
            if flag:
                flag_counts[flag] += 1

    lines.extend(["", "## Risk Flags", ""])
    if flag_counts:
        for flag, count in flag_counts.most_common():
            lines.append(f"- `{flag}`: {count}")
    else:
        lines.append("No heuristic risk flags found.")

    errors = [r for r in rows if not r.get("success")]
    lines.extend(["", "## Errors", ""])
    if errors:
        for row in errors[:50]:
            lines.append(f"- `{row.get('mode')}` `{row.get('model')}` `{row.get('prompt_id')}`: {row.get('error')}")
    else:
        lines.append("No generation errors.")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def benchmark_login(backend_url: str, timeout: float, email: str, password: str) -> str:
    status, body, _size = request_http(
        f"{backend_url.rstrip('/')}/api/auth/login",
        "POST",
        timeout,
        {"email": email, "password": password},
    )
    if status != 200 or not isinstance(body, dict) or not body.get("accessToken"):
        raise RuntimeError(f"login_failed:{email}:status={status}:body={body}")
    return str(body["accessToken"])


def platform_headers(case: dict[str, Any], tokens: dict[str, str]) -> dict[str, str]:
    auth = str(case.get("auth", "none"))
    if auth in tokens and tokens[auth]:
        return {"Authorization": f"Bearer {tokens[auth]}"}
    return {}


def run_platform_case(backend_url: str, default_timeout: float, case: dict[str, Any], tokens: dict[str, str]) -> tuple[dict[str, Any], dict[str, Any]]:
    method = str(case.get("method", "GET")).upper()
    path = str(case.get("path", "/"))
    timeout = float(case.get("timeout_seconds", default_timeout))
    payload = case.get("body") if isinstance(case.get("body"), dict) else None
    expected = case.get("expected_status", [200])
    expected_statuses = set(expected if isinstance(expected, list) else [expected])
    started = time.perf_counter()
    try:
        status, body, size = request_http(
            f"{backend_url.rstrip('/')}{path}",
            method,
            timeout,
            payload,
            platform_headers(case, tokens),
        )
        elapsed = time.perf_counter() - started
        success = status in expected_statuses
        row = {
            "timestamp_utc": now_utc(),
            "suite": case.get("suite", "Platform"),
            "case_id": case.get("id", ""),
            "method": method,
            "path": path,
            "auth": case.get("auth", "none"),
            "success": success,
            "status_code": status,
            "latency_seconds": round(elapsed, 6),
            "response_bytes": size,
            "metric": case.get("metric", ""),
            "error": "" if success else f"unexpected_status_expected_{sorted(expected_statuses)}",
        }
        return row, {**row, "request": payload, "response": body}
    except Exception as exc:
        elapsed = time.perf_counter() - started
        row = {
            "timestamp_utc": now_utc(),
            "suite": case.get("suite", "Platform"),
            "case_id": case.get("id", ""),
            "method": method,
            "path": path,
            "auth": case.get("auth", "none"),
            "success": False,
            "status_code": "",
            "latency_seconds": round(elapsed, 6),
            "response_bytes": 0,
            "metric": case.get("metric", ""),
            "error": str(exc),
        }
        return row, {**row, "request": payload, "response": None}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run local AI mentor and platform benchmarks.")
    parser.add_argument(
        "--frontend-mentor",
        action="store_true",
        help="Open Chromium and benchmark the frontend AI Mentor with docs/mentor-question-examples.md. This is the default mode.",
    )
    parser.add_argument(
        "--classic",
        action="store_true",
        help="Run the legacy Ollama/backend/platform benchmark instead of opening Chromium first.",
    )
    parser.add_argument("--url", default="http://localhost:5173", help="Frontend URL.")
    parser.add_argument("--questions", type=Path, default=MENTOR_QUESTIONS_PATH, help="Markdown mentor question file.")
    parser.add_argument("--output", type=Path, default=None, help="Frontend mentor transcript path.")
    parser.add_argument("--start", type=int, default=1, help="1-based first mentor question.")
    parser.add_argument("--end", type=int, default=None, help="1-based last mentor question.")
    parser.add_argument("--delay", type=float, default=0.5, help="Seconds to wait after each mentor answer.")
    parser.add_argument("--timeout", type=int, default=180_000, help="Per-question frontend timeout in milliseconds.")
    parser.add_argument(
        "--max-consecutive-errors",
        type=int,
        default=5,
        help="Stop the frontend mentor benchmark after this many consecutive frontend/API errors.",
    )
    parser.add_argument("--headless", action="store_true", help="Run Chromium headless.")
    parser.add_argument(
        "--profile",
        type=Path,
        default=ROOT.parent / ".playwright-mentor-benchmark-profile",
        help="Persistent Chromium profile directory for --frontend-mentor.",
    )
    parser.add_argument(
        "--frontend-model-label",
        default=os.environ.get("BENCHMARK_FRONTEND_MODEL_LABEL", "frontend-ai-mentor"),
        help="Model label to write into CSV/report for frontend benchmark rows.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = read_json(CONFIG_PATH)
    if args.frontend_mentor or not args.classic:
        return run_frontend_mentor_benchmark(args, config)

    cases = read_json(PROMPTS_PATH)
    base_url = str(os.environ.get("OLLAMA_BASE_URL", config.get("ollama_base_url", "http://localhost:11434"))).rstrip("/")
    backend_url = str(os.environ.get("BENCHMARK_BACKEND_URL", "http://localhost:5000")).rstrip("/")
    backend_token = os.environ.get("BENCHMARK_AUTH_TOKEN", "")
    student_email = os.environ.get("BENCHMARK_STUDENT_EMAIL", "student1@demo.com")
    student_password = os.environ.get("BENCHMARK_STUDENT_PASSWORD", "123456")
    teacher_email = os.environ.get("BENCHMARK_TEACHER_EMAIL", "teacher1@demo.com")
    teacher_password = os.environ.get("BENCHMARK_TEACHER_PASSWORD", "123456")
    timeout = float(config.get("timeout_seconds", 300))
    models = [str(model) for model in config.get("models", [])]
    options = dict(config.get("generation_options", {}))
    modes = [str(mode) for mode in config.get("modes", ["raw_ollama", "backend_mentor"])]

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = RESULTS_DIR / "metrics.csv"
    jsonl_path = RESULTS_DIR / "responses.jsonl"
    platform_csv_path = RESULTS_DIR / "platform_metrics.csv"
    platform_jsonl_path = RESULTS_DIR / "platform_responses.jsonl"
    report_path = RESULTS_DIR / "benchmark_report.md"
    for path in [csv_path, jsonl_path, platform_csv_path, platform_jsonl_path, report_path]:
        if path.exists():
            path.unlink()

    print(f"Ollama base URL: {base_url}")
    print(f"Backend URL: {backend_url}")
    print(f"Modes: {', '.join(modes)}")
    print(f"Models: {', '.join(models)}")
    print(f"Cases: {len(cases)}")

    tokens: dict[str, str] = {}
    try:
        tokens["student"] = backend_token or benchmark_login(backend_url, timeout, student_email, student_password)
        if not backend_token:
            backend_token = tokens["student"]
        print(f"Student auth: ok ({student_email})")
    except Exception as exc:
        print(f"Student auth unavailable: {exc}")
    try:
        tokens["teacher"] = benchmark_login(backend_url, timeout, teacher_email, teacher_password)
        print(f"Teacher auth: ok ({teacher_email})")
    except Exception as exc:
        print(f"Teacher auth unavailable: {exc}")

    try:
        installed = available_models(base_url, timeout)
        print(f"Installed models: {', '.join(sorted(installed))}")
    except Exception as exc:
        print(f"Could not query installed models: {exc}")
        installed = set()

    rows: list[dict[str, Any]] = []
    for model in models:
        for case in cases:
            for mode in modes:
                print(f"Running {mode} / {model} / {case.get('id')}")
                started = time.perf_counter()
                if installed and model not in installed:
                    row = error_row(mode, model, case, "model_not_found")
                    full = {**row, "case": case, "response": "", "raw": None}
                elif mode == "backend_mentor" and not backend_token:
                    row = error_row(mode, model, case, "backend_auth_token_missing")
                    full = {**row, "case": case, "response": "", "raw": None}
                else:
                    try:
                        if mode == "raw_ollama":
                            row, full = run_raw(base_url, timeout, model, case, options)
                        elif mode == "backend_mentor":
                            row, full = run_backend(backend_url, backend_token, timeout, model, case)
                        else:
                            row = error_row(mode, model, case, f"unknown_mode:{mode}")
                            full = {**row, "case": case, "response": "", "raw": None}
                    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                        row = error_row(mode, model, case, str(exc), time.perf_counter() - started)
                        full = {**row, "case": case, "response": "", "raw": None}

                append_csv(csv_path, row)
                append_jsonl(jsonl_path, full)
                rows.append(row)

    platform_rows: list[dict[str, Any]] = []
    platform_cases = config.get("platform_benchmarks", [])
    if isinstance(platform_cases, list):
        for case in platform_cases:
            if not isinstance(case, dict):
                continue
            print(f"Running platform / {case.get('suite')} / {case.get('id')}")
            row, full = run_platform_case(backend_url, timeout, case, tokens)
            append_platform_csv(platform_csv_path, row)
            append_jsonl(platform_jsonl_path, full)
            platform_rows.append(row)

    graphs = generate_graphs(rows, platform_rows)
    write_report(report_path, rows, platform_rows, config, graphs)
    print(f"Wrote {csv_path}")
    print(f"Wrote {jsonl_path}")
    print(f"Wrote {platform_csv_path}")
    print(f"Wrote {platform_jsonl_path}")
    print(f"Wrote {GRAPHS_DIR}")
    print(f"Wrote {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
