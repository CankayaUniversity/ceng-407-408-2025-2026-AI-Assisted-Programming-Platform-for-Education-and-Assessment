import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import StudentWorkspace from "../../components/student/StudentWorkspace";

const STUDENT_NAV = [
  { label: "Dashboard", path: "/" },
  { label: "Assignments", path: "/assignments" },
  { label: "Analytics", path: "/analytics" },
];

const LANGUAGE_OPTIONS = [
  { value: "javascript", label: "JavaScript", id: 63 },
  { value: "python",     label: "Python",     id: 71 },
  { value: "c",          label: "C",          id: 50 },
  { value: "cpp",        label: "C++",        id: 54 },
  { value: "csharp",     label: "C#",         id: 51 },
];

function languageIdFromSelection(value) {
  const selected = LANGUAGE_OPTIONS.find((opt) => opt.value === value);
  return selected?.id ?? 71;
}

export default function ProblemPage() {
  const { token, currentUser, problems, examMode, handleLogout } = useAuth();
  const { id } = useParams();
  const problemId = Number(id);
  const navigate  = useNavigate();

  const [code, setCode]                   = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("python");
  const [programStdin, setProgramStdin]   = useState("");
  const [terminal, setTerminal]           = useState("Terminal output will appear here.\n");
  const [running, setRunning]             = useState(false);
  const [chatInput, setChatInput]         = useState("");
  const [chat, setChat]                   = useState([
    { role: "assistant", content: "Hi! Ask for hints about your code." },
  ]);
  const [chatLoading, setChatLoading]     = useState(false);
  const [submissions, setSubmissions]     = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [selectedId, setSelectedId]       = useState(problemId);

  const selectedProblem = useMemo(
    () => problems.find((p) => p.id === selectedId) ?? null,
    [problems, selectedId],
  );

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
        setCode(problem.starterCode || "");
        setSelectedLanguage((problem.language || "python").toLowerCase());
        const vis = Array.isArray(problem.testCases) ? problem.testCases : [];
        setProgramStdin(vis.length > 0 ? (vis[0].input ?? "") : "");
        setTerminal(`Loaded problem: ${problem.title}\n`);

        setSubmissionsLoading(true);
        const subRes = await api(`/api/student/history?problemId=${problemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: [] }));
        setSubmissions(subRes?.data ?? []);
        setSubmissionsLoading(false);

        const aiRes = await api(`/api/student/history/ai?problemId=${problemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: [] }));
        const logs = aiRes?.data ?? [];
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
        setTerminal(`[error] ${err.message}\n`);
      }
    })();
  }, [token, problemId]);

  // ── Navigation ───────────────────────────────────────────────────────────

  function selectProblem(pid) {
    navigate(`/problem/${pid}`);
  }

  // ── Code execution ───────────────────────────────────────────────────────

  async function runTests() {
    if (!selectedProblem) return;
    setRunning(true);
    setTerminal("Running tests...\n");
    try {
      const result = await api("/api/execute", {
        method:    "POST",
        headers:   { Authorization: `Bearer ${token}` },
        timeoutMs: 300_000,
        body:      JSON.stringify({
          problemId:  selectedProblem.id,
          sourceCode: code,
          languageId: languageIdFromSelection(selectedLanguage),
        }),
      });
      const lines = [];
      lines.push(`mode: ${result.mode}`);
      lines.push(`allPassed: ${result.allPassed}`);
      lines.push(`submissionId: ${result.submissionId ?? "-"}`);
      for (const r of result.results ?? []) {
        lines.push(`\n[Test ${r.index}] ${r.passed ? "PASS" : "FAIL"} - ${r.status}`);
        if (r.stdout)        lines.push(`stdout:\n${r.stdout}`);
        if (r.stderr)        lines.push(`stderr:\n${r.stderr}`);
        if (r.compileOutput) lines.push(`compileOutput:\n${r.compileOutput}`);
      }
      setTerminal(lines.join("\n"));

      const subRes = await api(`/api/student/history?problemId=${selectedProblem.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => ({ data: [] }));
      setSubmissions(subRes?.data ?? []);
    } catch (err) {
      setTerminal(`[error] ${err.message}`);
    } finally {
      setRunning(false);
    }
  }

  async function runRaw() {
    setRunning(true);
    setTerminal("Running program...\n");
    try {
      const result = await api("/api/execute", {
        method:    "POST",
        headers:   { Authorization: `Bearer ${token}` },
        timeoutMs: 300_000,
        body:      JSON.stringify({
          sourceCode: code,
          languageId: languageIdFromSelection(selectedLanguage),
          stdin:      programStdin,
        }),
      });
      const lines = [
        `mode: ${result.mode}`,
        `status: ${result.status}`,
        `passed: ${result.passed}`,
      ];
      if (result.stdout)        lines.push(`\nstdout:\n${result.stdout}`);
      if (result.stderr)        lines.push(`\nstderr:\n${result.stderr}`);
      if (result.compileOutput) lines.push(`\ncompileOutput:\n${result.compileOutput}`);
      setTerminal(lines.join("\n"));
    } catch (err) {
      setTerminal(`[error] ${err.message}`);
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
          studentCode:     code,
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
      code={code}
      setCode={setCode}
      programStdin={programStdin}
      setProgramStdin={setProgramStdin}
      terminal={terminal}
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
