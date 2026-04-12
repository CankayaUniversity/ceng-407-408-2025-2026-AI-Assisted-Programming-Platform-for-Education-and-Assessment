import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import StudentWorkspace from "../../components/student/StudentWorkspace";

const STUDENT_NAV = [
  { label: "Dashboard",   path: "/" },
  { label: "Assignments", path: "/assignments" },
  { label: "Analytics",   path: "/analytics" },
];

const LANGUAGE_OPTIONS = [
  { value: "javascript", label: "JavaScript", id: 63 },
  { value: "python",     label: "Python",     id: 71 },
  { value: "c",          label: "C",          id: 50 },
  { value: "cpp",        label: "C++",        id: 54 },
  { value: "csharp",     label: "C#",         id: 51 },
];

function languageIdFromSelection(value) {
  return LANGUAGE_OPTIONS.find((o) => o.value === value)?.id ?? 71;
}

function extForLanguage(lang) {
  const map = { python: "py", javascript: "js", c: "c", cpp: "cpp", csharp: "cs" };
  return map[lang] ?? "txt";
}

let _nextFileId = 2; // file id counter (1 is reserved for the initial file)

export default function ProblemPage() {
  const { token, currentUser, problems, examMode, handleLogout } = useAuth();
  const { id } = useParams();
  const problemId = Number(id);
  const navigate  = useNavigate();

  // ── Phase 7: Multi-file state ────────────────────────────────────────────
  const [files,          setFiles]          = useState([{ id: 1, name: "main.py", content: "" }]);
  const [activeFileId,   setActiveFileId]   = useState(1);

  // ── Other editor state ───────────────────────────────────────────────────
  const [selectedLanguage, setSelectedLanguage] = useState("python");
  const [programStdin,     setProgramStdin]     = useState("");
  const [running,          setRunning]          = useState(false);
  const [chatInput,        setChatInput]        = useState("");
  const [chat,             setChat]             = useState([
    { role: "assistant", content: "Hi! Ask for hints about your code." },
  ]);
  const [chatLoading,      setChatLoading]      = useState(false);
  const [submissions,      setSubmissions]      = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [selectedId,       setSelectedId]       = useState(problemId);

  // ── Phase 6: xterm.js terminal writer ref ───────────────────────────────
  const termWriterRef = useRef(null); // { write(text), clear() }

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
    setSelectedId(problemId);

    (async () => {
      try {
        const detail = await api(`/api/problems/${problemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const problem = detail?.data;
        if (!problem) return;

        const lang = (problem.language || "python").toLowerCase();
        setSelectedLanguage(lang);
        const ext  = extForLanguage(lang);
        setFiles([{ id: 1, name: `main.${ext}`, content: problem.starterCode || "" }]);
        setActiveFileId(1);

        const vis = Array.isArray(problem.testCases) ? problem.testCases : [];
        setProgramStdin(vis.length > 0 ? (vis[0].input ?? "") : "");
        termWriterRef.current?.clear();
        termWriterRef.current?.write(`\x1b[36mLoaded: ${problem.title}\x1b[0m\r\n`);

        setSubmissionsLoading(true);
        const subRes = await api(`/api/student/history?problemId=${problemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: [] }));
        setSubmissions(subRes?.data ?? []);
        setSubmissionsLoading(false);

        const aiRes = await api(`/api/student/history/ai?problemId=${problemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: [] }));
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
        termWriterRef.current?.write(`\x1b[31m[error] ${err.message}\x1b[0m\r\n`);
      }
    })();
  }, [token, problemId]);

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
    } catch (err) {
      termWrite(`\x1b[31m[error] ${err.message}\x1b[0m\r\n`);
    } finally {
      setRunning(false);
    }
  }

  async function runRaw() {
    setRunning(true);
    termClear();
    termWrite("\x1b[33mRunning…\x1b[0m\r\n");
    try {
      const result = await api("/api/execute", {
        method:    "POST",
        headers:   { Authorization: `Bearer ${token}` },
        timeoutMs: 300_000,
        body:      JSON.stringify({
          sourceCode: allCode,
          languageId: languageIdFromSelection(selectedLanguage),
          stdin:      programStdin,
        }),
      });
      const st = result.status;
      const statusColor = st === "Accepted" ? "\x1b[32m" : "\x1b[31m";
      termWrite(`${statusColor}${st}\x1b[0m\r\n`);
      if (result.stdout)        termWrite(`\r\n${result.stdout.replace(/\n/g, "\r\n")}`);
      if (result.stderr)        termWrite(`\r\n\x1b[31m${result.stderr.replace(/\n/g, "\r\n")}\x1b[0m`);
      if (result.compileOutput) termWrite(`\r\n\x1b[33m${result.compileOutput.replace(/\n/g, "\r\n")}\x1b[0m`);
    } catch (err) {
      termWrite(`\x1b[31m[error] ${err.message}\x1b[0m\r\n`);
    } finally {
      setRunning(false);
    }
  }

  // ── AI chat ───────────────────────────────────────────────────────────────
  async function sendChat() {
    const message = chatInput.trim();
    if (!message || !selectedProblem) return;
    setChat((prev) => [...prev, { role: "user", content: message }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const result = await api("/api/ai/chat", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          problemId:       selectedProblem.id,
          assignmentText:  selectedProblem.description,
          studentCode:     allCode,
          studentQuestion: message,
          runStatus:       "idle",
          language:        selectedLanguage,
        }),
      });
      setChat((prev) => [...prev, { role: "assistant", content: result.mentorReply }]);
    } catch (err) {
      setChat((prev) => [...prev, { role: "assistant", content: `[error] ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
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
      setSelectedLanguage={setSelectedLanguage}
      languageOptions={LANGUAGE_OPTIONS}
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
      // Other
      programStdin={programStdin}
      setProgramStdin={setProgramStdin}
      // Phase 6 — terminal ref
      termWriterRef={termWriterRef}
      chat={chat}
      chatInput={chatInput}
      setChatInput={setChatInput}
      sendChat={sendChat}
      chatLoading={chatLoading}
      submissions={submissions}
      submissionsLoading={submissionsLoading}
      examMode={examMode}
    />
  );
}
