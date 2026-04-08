import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import { Box } from "@mui/material";

import LoginForm from "./components/auth/LoginForm";
import SectionCard from "./components/common/SectionCard";
import StatusMessage from "./components/common/StatusMessage";
import PageShell from "./components/layout/PageShell";
import StudentWorkspace from "./components/student/StudentWorkspace";

import AssignmentsPage from "./pages/student/AssignmentsPage";
import AnalyticsPage from "./pages/student/AnalyticsPage";
import TeacherDashboardPage from "./pages/teacher/TeacherDashboardPage";
import StudentsPage from "./pages/teacher/StudentsPage";
import QuestionsPage from "./pages/teacher/QuestionsPage";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";
const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL ?? "student1@demo.com";
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? "123456";

const STUDENT_NAV = [
  { label: "Dashboard", path: "/" },
  { label: "Assignments", path: "/assignments" },
  { label: "Analytics", path: "/analytics" },
];

const TEACHER_NAV = [
  { label: "Dashboard", path: "/" },
  { label: "Students", path: "/students" },
  { label: "Question Bank", path: "/questions" },
];

const LANGUAGE_OPTIONS = [
  { value: "javascript", label: "JavaScript", id: 63 },
  { value: "python", label: "Python", id: 71 },
  { value: "c", label: "C", id: 50 },
  { value: "cpp", label: "C++", id: 54 },
  { value: "csharp", label: "C#", id: 51 },
];

function languageIdFromSelection(value) {
  const selected = LANGUAGE_OPTIONS.find((opt) => opt.value === value);
  return selected?.id ?? 63;
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  const raw = await res.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = { raw };
  }
  if (!res.ok) {
    throw new Error(body?.error || body?.detail || `HTTP ${res.status}`);
  }
  return body;
}

function StudentProblemRoute({
  currentUser, token, handleLogout, problems, examMode,
}) {
  const { id } = useParams();
  const problemId = Number(id);

  const [code, setCode] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("javascript");
  const [terminal, setTerminal] = useState("Terminal output will appear here.\n");
  const [running, setRunning] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState([
    { role: "assistant", content: "Hi! Ask for hints about your code." },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(problemId);

  const navigate = useNavigate();

  const selectedProblem = useMemo(
    () => problems.find((p) => p.id === selectedId) ?? null,
    [problems, selectedId],
  );

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
        setSelectedLanguage((problem.language || "javascript").toLowerCase());
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
        if (logs.length > 0) {
          const restored = [{ role: "assistant", content: "Hi! Ask for hints about your code." }];
          for (const log of logs.slice().reverse()) {
            if (log.studentQuestion) restored.push({ role: "user", content: log.studentQuestion });
            if (log.responseText) restored.push({ role: "assistant", content: log.responseText });
          }
          setChat(restored);
        }
      } catch (err) {
        setTerminal(`[error] ${err.message}\n`);
      }
    })();
  }, [token, problemId]);

  function selectProblem(pid) {
    navigate(`/problem/${pid}`);
  }

  async function runTests() {
    if (!selectedProblem) return;
    setRunning(true);
    setTerminal("Running tests...\n");
    try {
      const result = await api("/api/execute", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          problemId: selectedProblem.id,
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
        if (r.stdout) lines.push(`stdout:\n${r.stdout}`);
        if (r.stderr) lines.push(`stderr:\n${r.stderr}`);
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
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sourceCode: code,
          languageId: languageIdFromSelection(selectedLanguage),
        }),
      });
      const lines = [
        `mode: ${result.mode}`,
        `status: ${result.status}`,
        `passed: ${result.passed}`,
      ];
      if (result.stdout) lines.push(`\nstdout:\n${result.stdout}`);
      if (result.stderr) lines.push(`\nstderr:\n${result.stderr}`);
      if (result.compileOutput) lines.push(`\ncompileOutput:\n${result.compileOutput}`);
      setTerminal(lines.join("\n"));
    } catch (err) {
      setTerminal(`[error] ${err.message}`);
    } finally {
      setRunning(false);
    }
  }

  async function sendChat() {
    const message = chatInput.trim();
    if (!message || !selectedProblem) return;
    setChat((prev) => [...prev, { role: "user", content: message }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const result = await api("/api/ai/chat", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          problemId: selectedProblem.id,
          assignmentText: selectedProblem.description,
          studentCode: code,
          studentQuestion: message,
          runStatus: "idle",
          language: selectedLanguage,
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

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("accessToken") ?? "");
  const [authError, setAuthError] = useState("");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState("login");

  const [name, setName] = useState("Demo Student");
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [registerRole, setRegisterRole] = useState("student");

  const [currentUser, setCurrentUser] = useState(null);
  const [problems, setProblems] = useState([]);
  const [examMode, setExamMode] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setBootstrapping(true);
      setAuthError("");
      try {
        if (!token) return;
        const me = await api("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCurrentUser(me);
        await loadSession(token, me);
      } catch (err) {
        localStorage.removeItem("accessToken");
        setToken("");
        setCurrentUser(null);
        setAuthError(err.message || "Session initialization failed.");
      } finally {
        setBootstrapping(false);
      }
    })();
  }, []);

  async function loadSession(currentToken, user = currentUser) {
    const list = await api("/api/problems", {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    setProblems(list?.data ?? []);

    if (user?.role !== "teacher") {
      const examRes = await api("/api/admin/exam-mode", {
        headers: { Authorization: `Bearer ${currentToken}` },
      }).catch(() => null);
      setExamMode(Boolean(examRes?.data?.enabled));
    }
  }

  useEffect(() => {
    if (!token || currentUser?.role === "teacher") return;
    const interval = setInterval(async () => {
      try {
        const res = await api("/api/admin/exam-mode", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setExamMode(Boolean(res?.data?.enabled));
      } catch { /* ignore */ }
    }, 10_000);
    return () => clearInterval(interval);
  }, [token, currentUser?.role]);

  async function handleSignIn() {
    setAuthLoading(true);
    setAuthError("");
    try {
      const login = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const nextToken = login.accessToken;
      const user = login.user ?? null;
      localStorage.setItem("accessToken", nextToken);
      setToken(nextToken);
      setCurrentUser(user);
      await loadSession(nextToken, user);
      navigate("/");
    } catch (err) {
      setAuthError(err.message || "Login failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRegister() {
    setAuthLoading(true);
    setAuthError("");
    try {
      const registered = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role: registerRole }),
      });
      const nextToken = registered.accessToken;
      const user = registered.user ?? null;
      localStorage.setItem("accessToken", nextToken);
      setToken(nextToken);
      setCurrentUser(user);
      await loadSession(nextToken, user);
      navigate("/");
    } catch (err) {
      setAuthError(err.message || "Registration failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function refreshProblems() {
    try {
      const list = await api("/api/problems", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProblems(list?.data ?? []);
    } catch { /* ignore */ }
  }

  function handleLogout() {
    localStorage.removeItem("accessToken");
    setToken("");
    setCurrentUser(null);
    setProblems([]);
    setExamMode(false);
    navigate("/");
  }

  if (bootstrapping) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", px: 2 }}>
        <SectionCard title="Initializing platform">
          <StatusMessage loading loadingText="Loading platform..." />
        </SectionCard>
      </Box>
    );
  }

  if (!token) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top left, rgba(99, 102, 241, 0.25) 0%, transparent 40%), radial-gradient(circle at top right, rgba(14, 165, 233, 0.2) 0%, transparent 35%)",
          bgcolor: "background.default",
        }}
      >
        <PageShell title="AI-Assisted Programming Platform" subtitle="Sign in to continue or create a new account." maxWidth="sm">
          <Box sx={{ mt: { xs: 4, md: 8 } }}>
            <LoginForm
              authMode={authMode}
              setAuthMode={setAuthMode}
              authError={authError}
              authLoading={authLoading}
              name={name}
              setName={setName}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              registerRole={registerRole}
              setRegisterRole={setRegisterRole}
              handleSignIn={handleSignIn}
              handleRegister={handleRegister}
              demoEmail={DEMO_EMAIL}
              demoPassword={DEMO_PASSWORD}
            />
          </Box>
        </PageShell>
      </Box>
    );
  }

  const commonProps = { currentUser, token, handleLogout, problems };

  if (currentUser?.role === "teacher") {
    return (
      <Routes>
        <Route path="/" element={<TeacherDashboardPage {...commonProps} navItems={TEACHER_NAV} />} />
        <Route path="/students" element={<StudentsPage {...commonProps} navItems={TEACHER_NAV} />} />
        <Route path="/questions" element={<QuestionsPage {...commonProps} navItems={TEACHER_NAV} onProblemsChanged={refreshProblems} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          problems.length > 0
            ? <Navigate to={`/problem/${problems[0].id}`} replace />
            : <AssignmentsPage {...commonProps} navItems={STUDENT_NAV} />
        }
      />
      <Route
        path="/problem/:id"
        element={
          <StudentProblemRoute
            currentUser={currentUser}
            token={token}
            handleLogout={handleLogout}
            problems={problems}
            examMode={examMode}
          />
        }
      />
      <Route path="/assignments" element={<AssignmentsPage {...commonProps} navItems={STUDENT_NAV} />} />
      <Route path="/analytics" element={<AnalyticsPage {...commonProps} navItems={STUDENT_NAV} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
