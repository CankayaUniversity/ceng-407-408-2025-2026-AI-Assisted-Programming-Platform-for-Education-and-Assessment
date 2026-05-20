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
  python:     "# Write your solution here\n# Read input with: input() or int(input())\n# Example: n = int(input()); arr = list(map(int, input().split()))\n",
  javascript: `const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });

const lines = [];
rl.on('line', (line) => {
  lines.push(line);
  // Change this number to match how many input lines your solution reads.
  // When you have enough lines, run your logic and call rl.close() — the
  // program will exit on its own without needing the EOF button.
  if (lines.length === 2) {
    // Write your solution here
    // Example: const n = parseInt(lines[0], 10);
    //          const arr = lines[1].split(' ').map(Number);

    rl.close();
  }
});
`,
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

  // ── Student assignments (for the left-panel grouped list) ────────────────
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

  // Navigate to a problem with its assignment context (exam mode, allowed languages, etc.)
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

  // Assignment context passed via navigation state from student AssignmentsPage
  const assignmentId               = location.state?.assignmentId     ?? null;
  const assignmentAllowedLanguages = location.state?.allowedLanguages ?? [];   // [] = all
  const assignmentLateDeduction    = location.state?.lateDeduction    ?? 0;
  const examDeadline               = location.state?.examDeadline     ?? null; // ISO string for scheduled exam end
  // isExamSession is true when either the platform-wide exam mode flag is on,
  // OR the student navigated here from an exam assignment row (location.state.examMode).
  const isExamSession              = examMode || Boolean(location.state?.examMode);

  // ── Exam-mode tab guards ──────────────────────────────────────────────────
  // 1. beforeunload — warns the student if they try to close the tab / refresh
  //    / navigate away while inside an exam. (Browsers show their own generic
  //    "Leave site?" prompt; we can't customize the text in modern browsers.)
  // 2. contextmenu  — disables right-click within the exam page so students
  //    can't easily "View page source" / "Inspect" / open a new tab.
  // Both are removed automatically when the student leaves the page or the
  // exam mode flag flips off.
  useEffect(() => {
    if (!isExamSession) return;

    function onBeforeUnload(e) {
      e.preventDefault();
      // Required for older browsers; modern ones ignore the return value
      // and show their own generic confirmation message.
      e.returnValue = "";
      return "";
    }
    function onContextMenu(e) {
      e.preventDefault();
    }

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
  // Persisted in localStorage so a page-refresh inside an exam restores the
  // correct state without losing context.
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

  // Stable refs so event listeners always read the latest values without
  // needing to be re-registered every render.
  const examLockedRef    = useRef(examLocked);
  const examViolCountRef = useRef(examViolations);
  const violDebounceRef  = useRef(null);  // 1 s debounce prevents double-fire

  useEffect(() => { examLockedRef.current = examLocked; },        [examLocked]);
  useEffect(() => { examViolCountRef.current = examViolations; }, [examViolations]);

  // When the student navigates away from the exam problem (isExamSession flips to false),
  // clear the lock so Run/Submit work normally on non-exam problems.
  // The localStorage keys are scoped to the assignment so the lock is still there
  // if the student comes back to the same exam problem.
  useEffect(() => {
    if (!isExamSession) {
      setExamLocked(false);
      examLockedRef.current = false;
      setExamViolations(0);
      examViolCountRef.current = 0;
    }
  }, [isExamSession]);

  // Enter fullscreen when exam session starts (gracefully ignored by Safari)
  useEffect(() => {
    if (!isExamSession || examLockedRef.current) return;
    if (document.fullscreenElement) return; // already fullscreen
    document.documentElement.requestFullscreen().catch((e) =>
      console.warn("[exam] Fullscreen request denied:", e.message),
    );
  }, [isExamSession]); // run once on exam entry

  // Core violation handler — called by all three event listeners
  const recordViolation = useRef(null);
  recordViolation.current = (type) => {
    if (!isExamSession || examLockedRef.current) return;
    if (violDebounceRef.current) return; // skip double-fire within 1 s

    // Arm debounce so the sibling event (blur after visibilitychange) is ignored
    violDebounceRef.current = setTimeout(() => { violDebounceRef.current = null; }, 1000);

    const newCount = examViolCountRef.current + 1;
    examViolCountRef.current = newCount;
    setExamViolations(newCount);
    if (examViolKey) { try { localStorage.setItem(examViolKey, String(newCount)); } catch {} }

    const isAutoSubmit = newCount >= 3;
    const remaining    = 3 - newCount;
    setViolationSnackbarMsg(
      isAutoSubmit
        ? "3rd violation detected. Your exam has been automatically submitted and locked."
        : `Warning: Violation ${newCount}/3 — ${remaining} more will auto-submit your exam.`,
    );
    setViolationSnackbarOpen(true);

    // POST to audit log (fire-and-forget)
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
      // Auto-submit current code via the normal test-run path
      runTests().catch(() => {});
    }
  };

  // Attach / detach event listeners for the three violation types
  useEffect(() => {
    if (!isExamSession) return;

    function onVisibilityChange() {
      if (document.hidden) recordViolation.current("tab_switch");
    }
    function onBlur() {
      recordViolation.current("window_blur");
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement && !examLockedRef.current) {
        recordViolation.current("fullscreen_exit");
        // Re-request fullscreen after a short delay so the browser has settled
        setTimeout(() => {
          if (!examLockedRef.current && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        }, 600);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur",               onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur",               onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (violDebounceRef.current) clearTimeout(violDebounceRef.current);
    };
  }, [isExamSession]); // stable: listeners never need re-registration

  // Auto-submit when countdown reaches zero
  useEffect(() => {
    if (!isExamSession || examLockedRef.current || examTimeLeft !== 0) return;
    examLockedRef.current = true;
    setExamLocked(true);
    if (examLockKey) { try { localStorage.setItem(examLockKey, "1"); } catch {} }
    setViolationSnackbarMsg("Time's up! Your exam has been automatically submitted.");
    setViolationSnackbarOpen(true);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    runTests().catch(() => {});
  }, [examTimeLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Called when teacher clicks "Yes" in the Finish Exam confirmation dialog
  function lockAndFinish() {
    examLockedRef.current = true;
    setExamLocked(true);
    if (examLockKey) { try { localStorage.setItem(examLockKey, "1"); } catch {} }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setFinishExamDialogOpen(false);
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

  // Auto-lock language when assignment allows exactly one language
  useEffect(() => {
    if (availableLanguages.length === 1) {
      setSelectedLanguage(availableLanguages[0].value);
    }
  }, [availableLanguages]);
  const [running,          setRunning]          = useState(false);
  const runningRef = useRef(false); // mirrors `running` for synchronous checks in event handlers
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

  // Stop flashcard polling on component unmount to prevent state-update-on-dead-component warnings
  useEffect(() => {
    return () => {
      if (flashcardPollRef.current) {
        clearInterval(flashcardPollRef.current);
        flashcardPollRef.current = null;
      }
    };
  }, []);
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
    if (runningRef.current) return; // prevent concurrent runs (e.g. auto-submit during a run)
    runningRef.current = true;
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
      runningRef.current = false;
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
    // Clear stale run result so mentor knows a fresh run is starting
    setLastRunResult(null);
    writer.run(selectedLanguage, allCode, token, () => setRunning(false));
  }

  /**
   * Called by InteractiveTerminal when a process finishes (exit / error / kill).
   * Stores the collected stdout so the AI mentor receives accurate execution context
   * on the next chat message — the same way Submit already does via Judge0.
   */
  function handleTerminalRunResult({ exitCode, stdout, stderr, killed }) {
    if (killed) return; // user stopped it — don't claim a meaningful result
    setLastRunResult({
      status: exitCode === 0 ? "run_success" : "runtime_error",
      stdout: (stdout ?? "").slice(0, 1_000),
      stderr: stderr ?? null,
    });
  }

  // ── AI chat (SSE streaming) ───────────────────────────────────────────────
  // overrideMessage:   pre-set message text (used by hint button)
  // overrideMode:      "hint" | "practice" etc.
  // overrideHintLevel: explicit hint level (Bug #8 fix — avoids closure stale value)
  async function sendChat(overrideMessage, overrideMode, overrideHintLevel, editorContext) {
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
      // Build conversation history from the current chat state (captured before
      // we pushed the new user message + streaming bubble, so it contains only
      // the previous completed exchanges).  We exclude the greeting message and
      // any still-streaming bubbles, then cap at 10 turns (20 entries).
      const historySnapshot = chat
        .filter(
          (m) =>
            (m.role === "user" || m.role === "assistant") &&
            !m.streaming &&
            m.content?.trim() &&
            m.content !== "Hi! Ask for hints about your code." &&
            !m.content.startsWith("[error]"),  // exclude failed-request error bubbles
        )
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`${API_BASE}/api/ai/chat/stream`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId:           selectedProblem.id,
          assignmentText:      selectedProblem.description,
          studentCode:         allCode,
          studentQuestion:     message,
          // Bug #1 fix: send real run status and execution output instead of hardcoded "idle"
          runStatus:           lastRunResult?.status ?? "idle",
          stdout:              lastRunResult?.stdout  ?? null,
          stderr:              lastRunResult?.stderr  ?? null,
          language:            selectedLanguage,
          mode,
          // Bug #8 fix: use explicitly passed hintLevel to avoid closure stale-value bug
          hintLevel:           mode === "hint" ? (overrideHintLevel ?? hintCount) : undefined,
          // Conversation history so the mentor can build on previous exchanges
          conversationHistory: historySnapshot.length > 0 ? historySnapshot : undefined,
          // Phase 2 (Editor context) — let the mentor reference the exact
          // cursor line the student is looking at. Backend already accepts
          // these fields (mentor.ts buildMentorPrompt renders a
          // [FOCUSED CODE NEAR CURSOR] section when they're present).
          activeLineNumber:    editorContext?.activeLineNumber,
          selectedCodeContext: editorContext?.selectedCodeContext,
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
            // The backend streams real tokens from the model first, then runs
            // the validator/policy/quality pipeline on the complete reply.
            // If the pipeline overrides the streamed text, it sends a
            // {replace} event so we overwrite what was already painted.
            if (typeof data.replace === "string") {
              setChat((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, content: data.replace };
                }
                return next;
              });
            }
            if (data.done) break;
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

  // ── "Add debug prints" button handler (Phase 6c — debug improvements) ─────
  // Asks the mentor to insert temporary trace prints around the cursor line.
  // The editor context (line number + window of surrounding code) is provided
  // by StudentWorkspace via getCursorContext() and passed to sendChat which
  // forwards it to the mentor as activeLineNumber + selectedCodeContext.
  async function sendDebugPrints(editorContext) {
    if (!selectedProblem || chatLoading) return;
    if (!editorContext?.activeLineNumber) {
      // Editor not ready or no cursor — surface a non-fatal hint in the chat.
      setChat((prev) => [
        ...prev,
        { role: "assistant",
          content: "Place your cursor on a line in the editor first, then click Debug prints." },
      ]);
      return;
    }
    const printerByLang = {
      python:     "print(...)",
      javascript: "console.log(...)",
      c:          "printf(...)",
      cpp:        "std::cout << ...",
      java:       "System.out.println(...)",
      csharp:     "Console.WriteLine(...)",
    };
    const printer = printerByLang[selectedLanguage] ?? "print(...)";
    const msg =
      `Add a few temporary ${printer} debug statements around line ${editorContext.activeLineNumber} ` +
      `to help me see the values of the relevant variables when I run the code. ` +
      `Do not change the program logic — only add prints. ` +
      `Show me the small snippet of modified code I can paste in.`;
    await sendChat(msg, "practice", undefined, editorContext);
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
      // Phase 6 — terminal ref
      termWriterRef={termWriterRef}
      onTerminalRunResult={handleTerminalRunResult}
      chat={chat}
      chatInput={chatInput}
      setChatInput={setChatInput}
      sendChat={sendChat}
      sendHint={sendHint}
      sendDebugPrints={sendDebugPrints}
      hintCount={hintCount}
      chatLoading={chatLoading}
      onNewChat={handleNewChat}
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
