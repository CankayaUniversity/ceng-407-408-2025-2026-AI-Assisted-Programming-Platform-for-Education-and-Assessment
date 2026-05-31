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
const MAX_MENTOR_HISTORY_MESSAGES = 20;
const INITIAL_RUN_CONTEXT = {
  runStatus: "idle",
  stdout: "",
  stderr: "",
  errorMessage: "",
};

// ── Code cache: survives navigation (module-level) AND page refresh (localStorage) ──
// Reads always check the in-memory Map first (fast), then fall back to localStorage.
// Writes update both so either path works.
const _codeCache = new Map(); // Map<problemId, { files, activeFileId, language }>

function _cacheKey(problemId) { return `code_cache_${problemId}`; }

function _cacheGet(problemId) {
  if (_codeCache.has(problemId)) return _codeCache.get(problemId);
  try {
    const raw = localStorage.getItem(_cacheKey(problemId));
    if (raw) {
      const parsed = JSON.parse(raw);
      _codeCache.set(problemId, parsed); // warm the in-memory cache
      return parsed;
    }
  } catch { /* ignore corrupt entries */ }
  return undefined;
}

function _cacheSet(problemId, value) {
  _codeCache.set(problemId, value);
  try { localStorage.setItem(_cacheKey(problemId), JSON.stringify(value)); } catch { /* quota */ }
}

export default function ProblemPage() {
  const { token, currentUser, problems, examMode, handleLogout } = useAuth();
  const { id } = useParams();
  const problemId = Number(id);
  const navigate  = useNavigate();
  const location  = useLocation();

  // Assignment context passed via navigation state from student AssignmentsPage
  const assignmentId               = location.state?.assignmentId     ?? null;
  const assignmentAllowedLanguages = location.state?.allowedLanguages ?? [];   // [] = all
  const assignmentLateDeduction    = location.state?.lateDeduction    ?? 0;
  const examDeadline               = location.state?.examDeadline     ?? null; // ISO string for scheduled exam end
  // isExamSession is true when either the platform-wide exam mode flag is on,
  // OR the student navigated here from an exam assignment row.
  const isExamSession              = examMode || Boolean(location.state?.examMode);

  // ── Student assignments (for the left-panel grouped list) ────────────────
  // Populates the Homework / Practice / Exams toggle next to the editor.
  const [studentAssignments,        setStudentAssignments]        = useState([]);
  const [studentAssignmentsLoading, setStudentAssignmentsLoading] = useState(true);
  useEffect(() => {
    if (!token) return;
    setStudentAssignmentsLoading(true);
    fetch(`${API_BASE}/api/assignments`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then((r) => r.json())
      .then((body) => setStudentAssignments(body?.data ?? []))
      .catch(() => {})
      .finally(() => setStudentAssignmentsLoading(false));
  }, [token]);

  // ── Exam-mode tab guards ──────────────────────────────────────────────────
  // 1. beforeunload — warns the student if they try to close the tab / refresh
  //    while inside an exam. (Browsers show their own generic prompt.)
  // 2. contextmenu  — disables right-click within the exam page.
  useEffect(() => {
    if (!isExamSession) return;
    function onBeforeUnload(e) { e.preventDefault(); e.returnValue = ""; return ""; }
    function onContextMenu(e) { e.preventDefault(); }
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [isExamSession]);

  // ── Exam countdown timer ──────────────────────────────────────────────────
  const [examTimeLeft, setExamTimeLeft] = useState(null);
  useEffect(() => {
    if (!examDeadline) return;
    function tick() {
      const ms = new Date(examDeadline).getTime() - Date.now();
      setExamTimeLeft(ms > 0 ? ms : 0);
    }
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [examDeadline]);

  function fmtExamTime(ms) {
    if (ms <= 0) return "Time's up!";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return [h > 0 && `${h}h`, `${m}m`, `${s}s`].filter(Boolean).join(" ");
  }

  // ── Exam security: lock + violation tracking ─────────────────────────────
  // Zero-tolerance policy: any single tab-switch, window-blur, or fullscreen-exit
  // triggers immediate auto-submit and a permanent lockout. The server is the
  // source of truth (see the GET /api/exam/status check below); localStorage is
  // only a same-session cache for instant UI feedback.
  const EXAM_MAX_VIOLATIONS = 1;
  const examLockKey = isExamSession && currentUser?.id && assignmentId
    ? `exam_lock_u${currentUser.id}_a${assignmentId}` : null;
  const examViolKey = isExamSession && currentUser?.id && assignmentId
    ? `exam_viol_u${currentUser.id}_a${assignmentId}` : null;

  const [examLocked, setExamLocked] = useState(() => {
    if (!isExamSession) return false;
    try { return localStorage.getItem(`exam_lock_u${currentUser?.id}_a${assignmentId}`) === "1"; }
    catch { return false; }
  });

  const [examViolations, setExamViolations] = useState(() => {
    if (!isExamSession) return 0;
    try { return parseInt(localStorage.getItem(`exam_viol_u${currentUser?.id}_a${assignmentId}`) ?? "0", 10); }
    catch { return 0; }
  });

  const [violationSnackbarOpen, setViolationSnackbarOpen] = useState(false);
  const [violationSnackbarMsg,  setViolationSnackbarMsg]  = useState("");
  const [finishExamDialogOpen,  setFinishExamDialogOpen]  = useState(false);

  // Stable refs so event listeners always read the latest values.
  const examLockedRef    = useRef(examLocked);
  const examViolCountRef = useRef(examViolations);
  const violDebounceRef  = useRef(null);

  useEffect(() => { examLockedRef.current = examLocked; },        [examLocked]);
  useEffect(() => { examViolCountRef.current = examViolations; }, [examViolations]);

  // Clear lock state when the student navigates away from an exam problem.
  useEffect(() => {
    if (!isExamSession) {
      setExamLocked(false);
      examLockedRef.current = false;
      setExamViolations(0);
      examViolCountRef.current = 0;
    }
  }, [isExamSession]);

  // Server-side lockout check — the database is the source of truth, so
  // logout/login, clearing localStorage, switching browsers, or incognito
  // mode CANNOT bypass a lockout. Runs every time the exam session or
  // assignment changes.
  useEffect(() => {
    if (!isExamSession || !assignmentId || !token) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/exam/status/${assignmentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        if (data.locked) {
          examLockedRef.current = true;
          setExamLocked(true);
          if (examLockKey) {
            try { localStorage.setItem(examLockKey, "1"); } catch {}
          }
        }
        if (typeof data.violationCount === "number") {
          examViolCountRef.current = data.violationCount;
          setExamViolations(data.violationCount);
          if (examViolKey) {
            try { localStorage.setItem(examViolKey, String(data.violationCount)); } catch {}
          }
        }
      })
      .catch(() => { /* network failure — keep localStorage cache */ });
    return () => { cancelled = true; };
  }, [isExamSession, assignmentId, token, examLockKey, examViolKey]);

  // Enter fullscreen when exam session starts (Safari gracefully ignores).
  useEffect(() => {
    if (!isExamSession || examLockedRef.current) return;
    if (document.fullscreenElement) return;
    document.documentElement.requestFullscreen().catch((e) =>
      console.warn("[exam] Fullscreen request denied:", e.message),
    );
  }, [isExamSession]);

  // Called when teacher clicks "Yes" in the Finish Exam confirmation dialog.
  // Defined as a ref so the violation handler (above) and the auto-submit
  // effect (below) can reference it before runTests is declared.
  const lockAndFinishRef = useRef(null);
  async function lockAndFinish() {
    // Close dialog immediately so the UI feels responsive.
    setFinishExamDialogOpen(false);

    // 1) Submit the student's current code via the normal test-run path.
    //    Wrapped in try/catch so a network failure still locks the exam.
    try {
      await runTestsRef.current?.();
    } catch { /* swallow — local lock still applies */ }

    // 2) Persist the "finished" marker server-side so re-login cannot
    //    re-open this exam. Uses the existing autoSubmitted=true lockout
    //    path; GET /api/exam/status will return locked:true on next load.
    if (assignmentId && token) {
      try {
        await fetch(`${API_BASE}/api/exam/finish`, {
          method:  "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            assignmentId,
            problemId: selectedProblem?.id,
          }),
        });
      } catch { /* network failure — local lock still applies */ }
    }

    // 3) Apply the local lock + exit fullscreen (original behavior).
    examLockedRef.current = true;
    setExamLocked(true);
    if (examLockKey) { try { localStorage.setItem(examLockKey, "1"); } catch {} }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  // Core violation handler — called by all event listeners
  const recordViolation = useRef(null);
  recordViolation.current = (type) => {
    if (!isExamSession || examLockedRef.current) return;
    if (violDebounceRef.current) return;
    violDebounceRef.current = setTimeout(() => { violDebounceRef.current = null; }, 1000);

    const newCount = examViolCountRef.current + 1;
    examViolCountRef.current = newCount;
    setExamViolations(newCount);
    if (examViolKey) { try { localStorage.setItem(examViolKey, String(newCount)); } catch {} }

    const isAutoSubmit = newCount >= EXAM_MAX_VIOLATIONS;
    const remaining    = EXAM_MAX_VIOLATIONS - newCount;
    setViolationSnackbarMsg(
      isAutoSubmit
        ? "Security violation detected. Your exam has been automatically submitted and locked. You cannot resume this exam."
        : `Warning: ${remaining} more violation(s) will auto-submit your exam.`,
    );
    setViolationSnackbarOpen(true);

    fetch(`${API_BASE}/api/exam/violation`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        assignmentId: assignmentId ?? undefined,
        problemId:    selectedProblem?.id,
        count:        newCount,
        autoSubmitted: isAutoSubmit,
      }),
    }).catch(() => {});

    if (isAutoSubmit) {
      examLockedRef.current = true;
      setExamLocked(true);
      if (examLockKey) { try { localStorage.setItem(examLockKey, "1"); } catch {} }
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      // Auto-submit current code via the normal test-run path. runTests is
      // defined later in this component; runTestsRef bridges the order.
      runTestsRef.current?.().catch(() => {});
    }
  };

  // Attach / detach event listeners for the three violation types
  useEffect(() => {
    if (!isExamSession) return;
    function onVisibilityChange() { if (document.hidden) recordViolation.current("tab_switch"); }
    function onBlur()              { recordViolation.current("window_blur"); }
    function onFullscreenChange()  {
      if (!document.fullscreenElement && !examLockedRef.current) {
        recordViolation.current("fullscreen_exit");
        setTimeout(() => {
          if (!examLockedRef.current && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        }, 600);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur",                onBlur);
    document.addEventListener("fullscreenchange",  onFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur",                onBlur);
      document.removeEventListener("fullscreenchange",  onFullscreenChange);
      if (violDebounceRef.current) clearTimeout(violDebounceRef.current);
    };
  }, [isExamSession]);

  // Auto-submit when countdown reaches zero
  const runTestsRef = useRef(null);
  useEffect(() => {
    if (!isExamSession || examLockedRef.current || examTimeLeft !== 0) return;
    examLockedRef.current = true;
    setExamLocked(true);
    if (examLockKey) { try { localStorage.setItem(examLockKey, "1"); } catch {} }
    setViolationSnackbarMsg("Time's up! Your exam has been automatically submitted.");
    setViolationSnackbarOpen(true);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    runTestsRef.current?.().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examTimeLeft]);

  // Terminal Run callback — stores stdout/stderr for the mentor's run-context block.
  function handleTerminalRunResult({ exitCode, stdout, stderr, killed }) {
    if (killed) return;
    setLastRunContext({
      runStatus: exitCode === 0 ? "run_success" : "runtime_error",
      stdout: (stdout ?? "").slice(0, 1_000),
      stderr: stderr ?? "",
      errorMessage: "",
    });
  }

  // Navigate to a problem with its assignment context (exam mode, allowed
  // languages, etc.) when the student clicks a row in the left-panel list.
  function selectAssignment(a) {
    const problem = a.problem ?? {};
    if (!problem.id) return;
    navigate(`/problem/${problem.id}`, {
      state: {
        assignmentId:     a.id,
        allowedLanguages: a.allowedLanguages ?? [],
        lateDeduction:    0,
        examMode:         a.mode === "exam",
        examDeadline:     a.dueDate ?? null,
      },
    });
  }

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

  // Auto-lock language when the assignment allows exactly one language.
  // (When languageOptions has multiple entries the student can still pick
  // freely; only the single-language case forces a hard lock.)
  useEffect(() => {
    if (availableLanguages.length === 1) {
      setSelectedLanguage(availableLanguages[0].value);
    }
  }, [availableLanguages]);

  const [running,          setRunning]          = useState(false);
  const [chatInput,        setChatInput]        = useState("");
  const [mentorLocale,     setMentorLocale]     = useState("en");
  const [chat,             setChat]             = useState([]);
  const [chatLoading,      setChatLoading]      = useState(false);
  const [activeLineNumber, setActiveLineNumber] = useState(1);
  const [hintCount,        setHintCount]        = useState(0);
  const [submissions,      setSubmissions]      = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [lastRunContext,   setLastRunContext]   = useState(INITIAL_RUN_CONTEXT);

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

  // Concatenate all files for submission (Judge0 is single-file; files are for organisation)
  const allCode = files.map((f) => f.content).join("\n\n");

  function buildFocusedCodeContext(content, lineNumber, radius = 4) {
    const lines = (content || "").split(/\r?\n/);
    const safeLine = Math.min(Math.max(lineNumber || 1, 1), Math.max(lines.length, 1));
    const start = Math.max(1, safeLine - radius);
    const end = Math.min(lines.length, safeLine + radius);

    return lines
      .slice(start - 1, end)
      .map((line, index) => {
        const currentLine = start + index;
        const marker = currentLine === safeLine ? ">" : " ";
        return `${marker} ${currentLine}: ${line}`;
      })
      .join("\n");
  }

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

    // Reset flashcard state for the new problem
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

        // Restore from cache only if the student has actually written something
        const cached = _cacheGet(problemId);
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
        setLastRunContext(INITIAL_RUN_CONTEXT);

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

        const logs = aiRes?.data ?? [];
        if (logs.length > 0) {
          const restored = [];
          for (const log of logs.slice().reverse()) {
            if (log.studentQuestion) restored.push({ role: "user",      content: log.studentQuestion });
            if (log.responseText)    restored.push({ role: "assistant", content: log.responseText });
          }
          setChat(restored);
        } else {
          setChat([]);
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
    _cacheSet(selectedId, { files, activeFileId, language: selectedLanguage });
  }, [files, activeFileId, selectedLanguage, selectedId]);

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
    setLastRunContext({
      runStatus: "running",
      stdout: "",
      stderr: "",
      errorMessage: "",
    });
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
      const stdoutParts = [];
      const stderrParts = [];
      const compileParts = [];
      let firstFailingStatus = "";

      for (const r of result.results ?? []) {
        const icon = r.passed ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
        termWrite(`\r\n${icon} Test ${r.index} — ${r.status}\r\n`);
        if (!r.passed && !firstFailingStatus) firstFailingStatus = r.status ?? "";
        if (r.stdout) {
          stdoutParts.push(`Test ${r.index} stdout:\n${r.stdout}`);
          termWrite(`stdout:\r\n${r.stdout.replace(/\n/g, "\r\n")}\r\n`);
        }
        if (r.stderr) {
          stderrParts.push(`Test ${r.index} stderr:\n${r.stderr}`);
          termWrite(`\x1b[31mstderr:\r\n${r.stderr.replace(/\n/g, "\r\n")}\x1b[0m\r\n`);
        }
        if (r.compileOutput) {
          compileParts.push(`Test ${r.index} compile:\n${r.compileOutput}`);
          termWrite(`\x1b[33mcompile:\r\n${r.compileOutput.replace(/\n/g, "\r\n")}\x1b[0m\r\n`);
        }
      }

      const normalizedStatus = result.allPassed
        ? "accepted"
        : compileParts.length > 0
          ? "compile_error"
          : stderrParts.length > 0
            ? "runtime_error"
            : firstFailingStatus.toLowerCase().includes("time")
              ? "time_limit_exceeded"
              : "wrong_answer";

      setLastRunContext({
        runStatus: normalizedStatus,
        stdout: stdoutParts.join("\n---\n"),
        stderr: stderrParts.join("\n---\n"),
        errorMessage: compileParts.join("\n---\n"),
      });

      const subRes = await api(`/api/student/history?problemId=${selectedProblem.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => ({ data: [] }));
      setSubmissions(subRes?.data ?? []);

      // If all tests passed, mark problem as solved so "Create Flashcards" button appears
      if (result.allPassed) {
        setHasSolvedProblem(true);
      }
    } catch (err) {
      termWrite(`\x1b[31m[error] ${err.message}\x1b[0m\r\n`);
      setLastRunContext({
        runStatus: "execution_error",
        stdout: "",
        stderr: "",
        errorMessage: err.message,
      });
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

    flashcardPollRef.current = setInterval(async () => {
      attempts++;
      try {
        const status = await api(`/api/flashcards/status?problemId=${pid}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null);

        if (status?.ready) {
          clearInterval(flashcardPollRef.current);
          flashcardPollRef.current = null;
          setFlashcardGenerating(false);
          setFlashcardExists(true);
          setFlashcardToastOpen(true);
          return;
        }
      } catch { /* ignore poll errors */ }

      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(flashcardPollRef.current);
        flashcardPollRef.current = null;
        setFlashcardGenerating(false);
      }
    }, 4_000);
  }

  // Bridge: exam-mode auto-submit (timer/violation) needs to call runTests
  // but runTests is declared after the exam-mode effects. The ref lets the
  // effects find the latest runTests implementation without re-registering.
  useEffect(() => { runTestsRef.current = runTests; });

  function runRaw() {
    const writer = termWriterRef.current;
    if (!writer) return;
    setRunning(true);
    writer.run(selectedLanguage, allCode, token, () => setRunning(false));
  }

  // ── AI chat (SSE streaming) ───────────────────────────────────────────────
  // overrideMessage: pre-set message text (used by hint button)
  // overrideMode:    "hint" | "practice" etc.
  async function sendChat(overrideMessage, overrideMode) {
    const message = overrideMessage ?? chatInput.trim();
    const mode    = overrideMode    ?? "practice";
    if (!message || !selectedProblem) return;
    const conversationHistory = chat
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content?.trim() && !m.error)
      .slice(-MAX_MENTOR_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content }));

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
          runStatus:       lastRunContext.runStatus,
          stdout:          lastRunContext.stdout,
          stderr:          lastRunContext.stderr,
          errorMessage:    lastRunContext.errorMessage,
          language:        selectedLanguage,
          mentorLocale,
          activeFileName:  activeFile?.name,
          activeLineNumber,
          selectedCodeContext: buildFocusedCodeContext(code, activeLineNumber),
          conversationHistory,
          mode,
          hintLevel:       overrideMode === "hint" ? hintCount : undefined,
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
            if (data.error) {
              setChat((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                const details = data.details ? ` (${data.details})` : "";
                const content = `[error] ${data.error}${details}`;
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, content, error: true };
                } else {
                  next.push({ role: "assistant", content, error: true });
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
          next[next.length - 1] = { role: "assistant", content: `[error] ${err.message}`, error: true };
        } else {
          next.push({ role: "assistant", content: `[error] ${err.message}`, error: true });
        }
        return next;
      });
    } finally {
      // Remove streaming flag from last message
      setChat((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && last.streaming) {
          next[next.length - 1] = {
            ...last,
            content: last.content || "[error] Mentor did not return a visible response.",
            error: last.error || !last.content,
            streaming: false,
          };
        }
        return next;
      });
      setChatLoading(false);
    }
  }

  // ── New Chat — clears local messages AND backend AI history ─────────────
  async function handleNewChat() {
    if (!selectedProblem) return;
    // Reset UI immediately
    setChat([{ role: "assistant", content: "Hi! Ask for hints about your code." }]);
    setHintCount(0);
    setChatInput("");
    // Delete backend history so the model has no memory of previous messages
    try {
      await fetch(`${API_BASE}/api/student/history/ai?problemId=${selectedProblem.id}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.warn("[newChat] Failed to clear AI history on server:", err.message);
    }
  }

  // ── Hint button handler ───────────────────────────────────────────────────
  async function sendHint() {
    if (!selectedProblem || chatLoading) return;
    // Progressive phrasing so the AI knows this is a follow-up hint
    const hintMessages = [
      "Give me a hint",
      "Give me another hint",
      "Give me one more hint",
    ];
    const msg = hintMessages[Math.min(hintCount, hintMessages.length - 1)];
    setHintCount((c) => c + 1);
    await sendChat(msg, "hint");
  }

  // ── Lockout screen ─────────────────────────────────────────────────────────
  // When the user has been server-side locked out of this exam (violation row
  // with autoSubmitted=true), the entire problem page is replaced with a
  // dead-end screen. The editor, terminal, AI panel, and run/submit are NOT
  // rendered — there is nothing to interact with except a button back to the
  // dashboard. This cannot be bypassed by logout/login because the server
  // confirms `locked: true` on every load.
  if (isExamSession && examLocked) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
          color: "#e0e0e0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: "100%",
            background: "#0f1226",
            border: "1px solid #f04747",
            borderRadius: 12,
            padding: "32px 28px",
            boxShadow: "0 8px 32px rgba(240,71,71,0.25)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h2 style={{ marginTop: 0, marginBottom: 12, color: "#f04747" }}>
            Exam Locked
          </h2>
          <p style={{ lineHeight: 1.5, marginBottom: 12 }}>
            Your exam was automatically submitted because a security violation
            (tab switch, window blur, or fullscreen exit) was detected.
          </p>
          <p style={{ lineHeight: 1.5, marginBottom: 24, color: "#bbb" }}>
            You cannot resume or re-enter this exam. The submitted result has
            been recorded for grading.
          </p>
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{
              background: "#5865f2",
              color: "white",
              border: "none",
              padding: "10px 24px",
              fontSize: 15,
              fontWeight: 600,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Return to Dashboard
          </button>
          <div style={{ marginTop: 16, fontSize: 13, color: "#888" }}>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                background: "transparent",
                color: "#888",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: 13,
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <StudentWorkspace
      currentUser={currentUser}
      selectedProblem={selectedProblem}
      navItems={STUDENT_NAV}
      handleLogout={handleLogout}
      problems={problems}
      assignments={studentAssignments}
      assignmentsLoading={studentAssignmentsLoading}
      onAssignmentSelect={selectAssignment}
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
      onCursorLineChange={setActiveLineNumber}
      // Phase 6 — terminal ref + run-result callback
      termWriterRef={termWriterRef}
      onTerminalRunResult={handleTerminalRunResult}
      chat={chat}
      chatInput={chatInput}
      setChatInput={setChatInput}
      mentorLocale={mentorLocale}
      setMentorLocale={setMentorLocale}
      sendChat={sendChat}
      sendHint={sendHint}
      onNewChat={handleNewChat}
      hintCount={hintCount}
      chatLoading={chatLoading}
      submissions={submissions}
      submissionsLoading={submissionsLoading}
      examMode={isExamSession}
      examTimeLeft={examTimeLeft}
      fmtExamTime={fmtExamTime}
      // Exam security
      examLocked={examLocked}
      examViolations={examViolations}
      violationSnackbarOpen={violationSnackbarOpen}
      violationSnackbarMsg={violationSnackbarMsg}
      onViolationSnackbarClose={() => setViolationSnackbarOpen(false)}
      finishExamDialogOpen={finishExamDialogOpen}
      onFinishExamRequest={() => setFinishExamDialogOpen(true)}
      onFinishExamConfirm={lockAndFinish}
      onFinishExamCancel={() => setFinishExamDialogOpen(false)}
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
