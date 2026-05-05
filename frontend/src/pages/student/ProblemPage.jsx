import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { API_BASE } from "../../apiBase";
import StudentWorkspace from "../../components/student/StudentWorkspace";

const STUDENT_NAV = [
  { label: "Dashboard",   path: "/", matchPaths: ["/problem/"] },
  { label: "Assignments", path: "/assignments" },
  { label: "Analytics",   path: "/analytics" },
  { label: "Flashcards",  path: "/flashcards" },
];

const LANGUAGE_OPTIONS = [
  { value: "javascript", label: "JavaScript", id: 63 },
  { value: "python",     label: "Python",     id: 71 },
  { value: "c",          label: "C",          id: 50 },
  { value: "cpp",        label: "C++",        id: 54 },
  { value: "csharp",     label: "C#",         id: 51 },
  { value: "java",       label: "Java",       id: 62 },
];

function languageIdFromSelection(value) {
  return LANGUAGE_OPTIONS.find((o) => o.value === value)?.id ?? 71;
}

function extForLanguage(lang) {
  const map = { python: "py", javascript: "js", c: "c", cpp: "cpp", csharp: "cs", java: "java" };
  return map[lang] ?? "txt";
}

const STARTER_CODE = {
  python:     "# Write your solution here\n",
  javascript: "// Write your solution here\n",
  c: `#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n`,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n`,
  csharp: `using System;\n\nclass Program {\n    static void Main(string[] args) {\n        \n    }\n}\n`,
  java: `public class Main {\n    public static void main(String[] args) {\n        \n    }\n}\n`,
};

let _nextFileId = 2; // file id counter (1 is reserved for the initial file)

// ── Code cache: survives navigation (module-level) AND page refresh (localStorage) ──
// Solution-visibility fix: keys are now scoped by userId so that Student A's code
// stored on a shared browser cannot bleed into Student B's editor session.
// Map key format: `${userId}_${problemId}`, localStorage key: `code_cache_u${userId}_p${problemId}`
const _codeCache = new Map(); // Map<`${userId}_${problemId}`, { files, activeFileId, language }>

function _cacheKey(userId, problemId) { return `code_cache_u${userId}_p${problemId}`; }

function _cacheGet(userId, problemId) {
  const mapKey = `${userId}_${problemId}`;
  if (_codeCache.has(mapKey)) return _codeCache.get(mapKey);
  try {
    const raw = localStorage.getItem(_cacheKey(userId, problemId));
    if (raw) {
      const parsed = JSON.parse(raw);
      _codeCache.set(mapKey, parsed); // warm the in-memory cache
      return parsed;
    }
  } catch { /* ignore corrupt entries */ }
  return undefined;
}

function _cacheSet(userId, problemId, value) {
  _codeCache.set(`${userId}_${problemId}`, value);
  try { localStorage.setItem(_cacheKey(userId, problemId), JSON.stringify(value)); } catch { /* quota */ }
}

export default function ProblemPage() {
  const { token, currentUser, problems, examMode, handleLogout } = useAuth();
  const { id } = useParams();
  const problemId = Number(id);
  const navigate  = useNavigate();
  const location  = useLocation();

  // Assignment context passed via navigation state from student AssignmentsPage
  const assignmentAllowedLanguages = location.state?.allowedLanguages ?? [];   // [] = all
  const assignmentLateDeduction    = location.state?.lateDeduction    ?? 0;

  // Filter available languages to those the assignment allows (empty = all allowed)
  const availableLanguages = useMemo(
    () =>
      assignmentAllowedLanguages.length === 0
        ? LANGUAGE_OPTIONS
        : LANGUAGE_OPTIONS.filter((o) => assignmentAllowedLanguages.includes(o.value)),
    [assignmentAllowedLanguages],
  );

  // ── Phase 7: Multi-file state ────────────────────────────────────────────
  const [files,          setFiles]          = useState([{ id: 1, name: "main.py", content: "" }]);
  const [activeFileId,   setActiveFileId]   = useState(1);

  // ── Other editor state ───────────────────────────────────────────────────
  const [selectedLanguage, setSelectedLanguage] = useState("python");
  const [running,          setRunning]          = useState(false);
  const [chatInput,        setChatInput]        = useState("");
  const [chat,             setChat]             = useState([
    { role: "assistant", content: "Hi! Ask for hints about your code." },
  ]);
  const [chatLoading,      setChatLoading]      = useState(false);
  const [hintCount,        setHintCount]        = useState(0);
  const [submissions,      setSubmissions]      = useState([]);
  // Bug #1 fix: track real run result so the AI gets accurate execution context
  // null = code not yet run; set after each runTests() call
  const [lastRunResult,    setLastRunResult]    = useState(null);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // ── Flashcard state ──────────────────────────────────────────────────────
  const [hasSolvedProblem,    setHasSolvedProblem]    = useState(false);  // true after allPassed in this session
  const [flashcardExists,     setFlashcardExists]     = useState(false);  // true if already generated
  const [flashcardGenerating, setFlashcardGenerating] = useState(false);  // true while polling after button click
  const [flashcardToastOpen,  setFlashcardToastOpen]  = useState(false);  // "ready" snackbar
  const flashcardPollRef = useRef(null);
  const [selectedId,       setSelectedId]       = useState(problemId);

  // ── Phase 6: xterm.js terminal writer ref ───────────────────────────────
  const termWriterRef = useRef(null); // { write(text), clear() }

  // When navigating to a new problem we momentarily call setFiles([empty]) +
  // setSelectedId(newId) to avoid poisoning the new problem's cache slot with
  // the previous problem's content.  Without this guard the cache-save effect
  // would fire during that reset and overwrite the student's real saved code
  // for the problem they are returning to with an empty placeholder.
  const skipCacheSave = useRef(false);

  const selectedProblem = useMemo(
    () => problems.find((p) => p.id === selectedId) ?? null,
    [problems, selectedId],
  );

  // ── Active file helpers ──────────────────────────────────────────────────
  const activeFile  = files.find((f) => f.id === activeFileId) ?? files[0];
  const code        = activeFile?.content ?? "";
  const setCode     = (content) => {
    setFiles((prev) => prev.map((f) => (f.id === activeFileId ? { ...f, content } : f)));
  };

  // For test submission, only the active file is sent to Judge0.
  // Concatenating all files breaks JavaScript (duplicate declarations, conflicting
  // module systems) and other languages.  Extra files are for local organisation only.
  const allCode = activeFile?.content ?? "";

  // ── File tab actions (Phase 7) ───────────────────────────────────────────
  function addFile() {
    const ext  = extForLanguage(selectedLanguage);
    const id   = _nextFileId++;
    const name = `file${id}.${ext}`;
    setFiles((prev) => [...prev, { id, name, content: "" }]);
    setActiveFileId(id);
  }

  function closeFile(fid) {
    setFiles((prev) => {
      const next = prev.filter((f) => f.id !== fid);
      if (activeFileId === fid) setActiveFileId(next[0]?.id ?? null);
      return next;
    });
  }

  function renameFile(fid, newName) {
    setFiles((prev) => prev.map((f) => (f.id === fid ? { ...f, name: newName } : f)));
  }

  // ── Load problem on mount / URL change ───────────────────────────────────
  useEffect(() => {
    if (!token || !problemId) return;
    let cancelled = false;

    // Reset run result and flashcard state for the new problem
    setLastRunResult(null);
    setHasSolvedProblem(false);
    setFlashcardExists(false);
    setFlashcardGenerating(false);
    if (flashcardPollRef.current) { clearInterval(flashcardPollRef.current); flashcardPollRef.current = null; }

    // Check whether flashcards already exist for this problem
    api(`/api/flashcards/status?problemId=${problemId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((s) => {
      if (!cancelled) setFlashcardExists(s?.ready === true);
    }).catch(() => {});

    // Block the cache-save effect so the temporary empty-files reset below
    // does NOT overwrite the student's real saved code for this problem.
    skipCacheSave.current = true;
    setFiles([{ id: 1, name: "main.py", content: "" }]);
    setSelectedId(problemId);
    setHintCount(0);

    (async () => {
      try {
        const detail = await api(`/api/problems/${problemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;

        const problem = detail?.data;
        if (!problem) return;

        const lang = (problem.language || "python").toLowerCase();

        // Restore from cache only if the student has actually written something.
        // Cache is scoped by userId so different students on the same browser
        // never see each other's code (solution-visibility fix).
        const uid = currentUser?.id ?? 0;
        const cached = _cacheGet(uid, problemId);
        const cacheHasContent = cached?.files?.some((f) => f.content.trim() !== "");

        // Re-enable cache saving BEFORE the setState calls so the upcoming
        // render immediately starts persisting the correct content.
        skipCacheSave.current = false;

        if (cached && cacheHasContent) {
          setSelectedLanguage(cached.language);
          setFiles(cached.files);
          setActiveFileId(cached.activeFileId);
        } else {
          // Use teacher's starter code if provided, otherwise fall back to
          // the language default, or the generic placeholder as last resort.
          setSelectedLanguage(lang);
          const ext = extForLanguage(lang);
          setFiles([{ id: 1, name: `main.${ext}`, content: problem.starterCode || STARTER_CODE[lang] || "# Write your solution here\n" }]);
          setActiveFileId(1);
        }

        termWriterRef.current?.clear();
        termWriterRef.current?.write(`\x1b[36mLoaded: ${problem.title}\x1b[0m\r\n`);

        setSubmissionsLoading(true);
        const subRes = await api(`/api/student/history?problemId=${problemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: [] }));
        if (!cancelled) {
          setSubmissions(subRes?.data ?? []);
          setSubmissionsLoading(false);
        }

        const aiRes = await api(`/api/student/history/ai?problemId=${problemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: [] }));
        if (cancelled) return;

        const logs    = aiRes?.data ?? [];
        const greeting = { role: "assistant", content: "Hi! Ask for hints about your code." };
        if (logs.length > 0) {
          const restored = [greeting];
          for (const log of logs.slice().reverse()) {
            if (log.studentQuestion) restored.push({ role: "user",      content: log.studentQuestion });
            if (log.responseText)    restored.push({ role: "assistant", content: log.responseText });
          }
          setChat(restored);
        } else {
          setChat([greeting]);
        }
      } catch (err) {
        if (!cancelled) {
          skipCacheSave.current = false; // re-enable even on error
          termWriterRef.current?.write(`\x1b[31m[error] ${err.message}\x1b[0m\r\n`);
        }
      }
    })();

    // If the user navigates away before this load finishes, cancel the
    // in-flight requests so stale state is never written into the editor.
    return () => { cancelled = true; };
  }, [token, problemId]);

  // ── Language change: update extension + inject starter if file is empty ──
  function handleLanguageChange(newLang) {
    setSelectedLanguage(newLang);
    const newExt = extForLanguage(newLang);
    setFiles((prev) =>
      prev.map((f) => {
        // Update extension of files that still have a default extension
        const dotIdx = f.name.lastIndexOf(".");
        const baseName = dotIdx >= 0 ? f.name.slice(0, dotIdx) : f.name;
        const newName = `${baseName}.${newExt}`;
        // Inject starter code only if the file is empty
        // Replace content if empty OR if it still contains a known starter snippet
        const isStarter = Object.values(STARTER_CODE).some((s) => s.trim() === f.content.trim());
        const newContent = f.content.trim() === "" || isStarter ? (STARTER_CODE[newLang] ?? "") : f.content;
        return { ...f, name: newName, content: newContent };
      }),
    );
  }

  // ── Persist current editor state to cache + localStorage whenever it changes ─
  useEffect(() => {
    if (!selectedId || skipCacheSave.current) return;
    const uid = currentUser?.id ?? 0;
    _cacheSet(uid, selectedId, { files, activeFileId, language: selectedLanguage });
  }, [files, activeFileId, selectedLanguage, selectedId, currentUser?.id]);

  // ── Navigation ───────────────────────────────────────────────────────────
  function selectProblem(pid) { navigate(`/problem/${pid}`); }

  // ── Terminal helpers ─────────────────────────────────────────────────────
  function termWrite(text) { termWriterRef.current?.write(text); }
  function termClear()     { termWriterRef.current?.clear(); }

  // ── Code execution ───────────────────────────────────────────────────────
  async function runTests() {
    if (!selectedProblem) return;
    setRunning(true);
    termClear();
    termWrite("\x1b[33mRunning tests…\x1b[0m\r\n");
    try {
      const result = await api("/api/execute", {
        method:    "POST",
        headers:   { Authorization: `Bearer ${token}` },
        timeoutMs: 300_000,
        body:      JSON.stringify({
          problemId:  selectedProblem.id,
          sourceCode: allCode,
          languageId: languageIdFromSelection(selectedLanguage),
        }),
      });
      termWrite(`mode: ${result.mode}\r\nallPassed: ${result.allPassed}\r\n`);
      for (const r of result.results ?? []) {
        const icon = r.passed ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
        termWrite(`\r\n${icon} Test ${r.index} — ${r.status}\r\n`);
        if (r.stdout)        termWrite(`stdout:\r\n${r.stdout.replace(/\n/g, "\r\n")}\r\n`);
        if (r.stderr)        termWrite(`\x1b[31mstderr:\r\n${r.stderr.replace(/\n/g, "\r\n")}\x1b[0m\r\n`);
        if (r.compileOutput) termWrite(`\x1b[33mcompile:\r\n${r.compileOutput.replace(/\n/g, "\r\n")}\x1b[0m\r\n`);
      }
      const subRes = await api(`/api/student/history?problemId=${selectedProblem.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => ({ data: [] }));
      setSubmissions(subRes?.data ?? []);

      // Bug #1 fix: compute real runStatus from the result so the AI mentor
      // receives accurate execution context instead of the hardcoded "idle".
      const testResults = result.results ?? [];
      let computedStatus = "wrong_answer";
      if (result.allPassed) {
        computedStatus = "accepted";
      } else {
        const firstFail = testResults.find((r) => !r.passed);
        if (firstFail) {
          const s = (firstFail.status ?? "").toLowerCase();
          if      (s.includes("compile"))  computedStatus = "compile_error";
          else if (s.includes("runtime") || s.includes("signal")) computedStatus = "runtime_error";
          else if (s.includes("time"))     computedStatus = "time_limit_exceeded";
          else if (s.includes("memory"))   computedStatus = "memory_limit_exceeded";
          else                             computedStatus = "wrong_answer";
        }
      }
      const combinedStdout = testResults.map((r) => r.stdout).filter(Boolean).join("\n").slice(0, 1_000);
      const combinedStderr = testResults.map((r) => r.stderr).filter(Boolean).join("\n").slice(0, 500);
      const combinedCompile = testResults.map((r) => r.compileOutput).filter(Boolean).join("\n").slice(0, 500);
      setLastRunResult({
        status:  computedStatus,
        stdout:  combinedStdout,
        stderr:  combinedStderr || combinedCompile, // stderr field in AI schema covers both
      });

      // If all tests passed, mark problem as solved so "Create Flashcards" button appears
      if (result.allPassed) {
        setHasSolvedProblem(true);
      }
    } catch (err) {
      termWrite(`\x1b[31m[error] ${err.message}\x1b[0m\r\n`);
    } finally {
      setRunning(false);
    }
  }

  // ── Flashcard creation (manual trigger) ──────────────────────────────────
  // Called when the student clicks "Create Flashcards".
  // Posts to /generate (returns 202 immediately), then polls status every 4s.
  async function createFlashcards() {
    if (!selectedProblem || flashcardGenerating || flashcardExists) return;
    const pid = selectedProblem.id;
    setFlashcardGenerating(true);

    try {
      await api("/api/flashcards/generate", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ problemId: pid }),
      });
    } catch { /* 202 or error — either way start polling */ }

    // Poll every 4 s, up to 5 minutes (75 attempts)
    if (flashcardPollRef.current) clearInterval(flashcardPollRef.current);
    let attempts = 0;
    const MAX_ATTEMPTS = 75;

    function stopPolling() {
      clearInterval(flashcardPollRef.current);
      flashcardPollRef.current = null;
      setFlashcardGenerating(false);
    }

    flashcardPollRef.current = setInterval(async () => {
      attempts++;
      try {
        const status = await api(`/api/flashcards/status?problemId=${pid}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);

        if (status?.ready) {
          stopPolling();
          setFlashcardExists(true);
          setFlashcardToastOpen(true);
          return;
        }

        // If the server returned { ready: false, generating: false } after we
        // already started generation it means the background job was lost
        // (e.g. server restart).  Stop polling so the button reappears
        // immediately and the student can try again.
        if (status && !status.ready && !status.generating && attempts > 1) {
          stopPolling();
          return;
        }
      } catch { /* ignore transient poll errors */ }

      if (attempts >= MAX_ATTEMPTS) {
        stopPolling();
      }
    }, 4_000);
  }

  function runRaw() {
    const writer = termWriterRef.current;
    if (!writer) return;
    setRunning(true);
    writer.run(selectedLanguage, allCode, token, () => setRunning(false));
  }

  // ── AI chat (SSE streaming) ───────────────────────────────────────────────
  // overrideMessage:   pre-set message text (used by hint button)
  // overrideMode:      "hint" | "practice" etc.
  // overrideHintLevel: explicit hint level (Bug #8 fix — avoids closure stale value)
  async function sendChat(overrideMessage, overrideMode, overrideHintLevel) {
    const message = overrideMessage ?? chatInput.trim();
    const mode    = overrideMode    ?? "practice";

    // Bug #2 fix: give visible feedback when the student tries to send an empty message
    if (!message) {
      if (!overrideMessage) {
        setChat((prev) => [
          ...prev,
          { role: "assistant", content: "Please type a question before sending." },
        ]);
      }
      return;
    }
    if (!selectedProblem) return;

    setChat((prev) => [
      ...prev,
      { role: "user",      content: message },
      { role: "assistant", content: "", streaming: true },
    ]);
    if (!overrideMessage) setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/ai/chat/stream`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId:       selectedProblem.id,
          assignmentText:  selectedProblem.description,
          studentCode:     allCode,
          studentQuestion: message,
          // Bug #1 fix: send real run status and execution output instead of hardcoded "idle"
          runStatus:       lastRunResult?.status ?? "idle",
          stdout:          lastRunResult?.stdout  ?? null,
          stderr:          lastRunResult?.stderr  ?? null,
          language:        selectedLanguage,
          mode,
          // Bug #8 fix: use explicitly passed hintLevel to avoid closure stale-value bug
          hintLevel:       mode === "hint" ? (overrideHintLevel ?? hintCount) : undefined,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              setChat((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, content: last.content + data.token };
                }
                return next;
              });
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }
    } catch (err) {
      setChat((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        // Replace the empty streaming bubble with the error
        if (last?.role === "assistant" && last.streaming) {
          next[next.length - 1] = { role: "assistant", content: `[error] ${err.message}` };
        } else {
          next.push({ role: "assistant", content: `[error] ${err.message}` });
        }
        return next;
      });
    } finally {
      // Remove streaming flag from last message
      setChat((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && last.streaming) {
          next[next.length - 1] = { ...last, streaming: false };
        }
        return next;
      });
      setChatLoading(false);
    }
  }

  // ── Hint button handler ───────────────────────────────────────────────────
  async function sendHint() {
    if (!selectedProblem || chatLoading) return;
    // Capture current hintCount BEFORE the async setState so sendChat receives
    // the correct level (Bug #8 fix: setState is async, closure captures stale value).
    const currentLevel = hintCount;
    // Progressive phrasing so the AI knows this is a follow-up hint
    const hintMessages = [
      "Give me a hint",
      "Give me another hint",
      "Give me one more hint",
    ];
    const msg = hintMessages[Math.min(currentLevel, hintMessages.length - 1)];
    setHintCount((c) => c + 1);
    await sendChat(msg, "hint", currentLevel);
  }

  return (
    <StudentWorkspace
      currentUser={currentUser}
      selectedProblem={selectedProblem}
      navItems={STUDENT_NAV}
      handleLogout={handleLogout}
      problems={problems}
      selectedId={selectedId}
      selectProblem={selectProblem}
      selectedLanguage={selectedLanguage}
      setSelectedLanguage={handleLanguageChange}
      languageOptions={availableLanguages}
      lateDeduction={assignmentLateDeduction}
      runRaw={runRaw}
      running={running}
      runTests={runTests}
      // Phase 7 — multi-file
      files={files}
      activeFileId={activeFileId}
      onFileSelect={setActiveFileId}
      onFileAdd={addFile}
      onFileClose={closeFile}
      onFileRename={renameFile}
      code={code}
      setCode={setCode}
      // Phase 6 — terminal ref
      termWriterRef={termWriterRef}
      chat={chat}
      chatInput={chatInput}
      setChatInput={setChatInput}
      sendChat={sendChat}
      sendHint={sendHint}
      hintCount={hintCount}
      chatLoading={chatLoading}
      submissions={submissions}
      submissionsLoading={submissionsLoading}
      examMode={examMode}
      // Flashcard props (manual trigger flow)
      hasSolvedProblem={hasSolvedProblem}
      flashcardExists={flashcardExists}
      flashcardGenerating={flashcardGenerating}
      flashcardToastOpen={flashcardToastOpen}
      onCreateFlashcards={createFlashcards}
      onFlashcardToastClose={() => setFlashcardToastOpen(false)}
      token={token}
      tutorialLanguage="c"
    />
  );
}
