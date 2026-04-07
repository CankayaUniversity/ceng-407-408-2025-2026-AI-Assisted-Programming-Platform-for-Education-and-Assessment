import { useEffect, useMemo, useState } from "react";
import { Box } from "@mui/material";

import LoginForm from "./components/auth/LoginForm";
import SectionCard from "./components/common/SectionCard";
import StatusMessage from "./components/common/StatusMessage";
import PageShell from "./components/layout/PageShell";
import StudentWorkspace from "./components/student/StudentWorkspace";
import TeacherDashboard from "./components/teacher/TeacherDashboard";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";
const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL ?? "student1@demo.com";
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? "123456";

const NAV_ITEMS = ["Dashboard", "Assignments", "Exams", "Analytics", "Settings"];
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
  const [selectedId, setSelectedId] = useState(null);
  const selectedProblem = useMemo(
    () => problems.find((p) => p.id === selectedId) ?? null,
    [problems, selectedId],
  );

  const [code, setCode] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("javascript");
  const [terminal, setTerminal] = useState("Terminal output will appear here.\n");
  const [running, setRunning] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState([
    { role: "assistant", content: "Hi! Ask for hints about your code." },
  ]);
  const [chatLoading, setChatLoading] = useState(false);

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
    if (user?.role === "teacher") {
      const list = await api("/api/problems", {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      setProblems(list?.data ?? []);
      setSelectedId(null);
      setCode("");
      setTerminal("Teacher dashboard ready.\n");
      return;
    }

    const list = await api("/api/problems", {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    const items = list?.data ?? [];
    setProblems(items);

    if (items.length > 0) {
      const firstId = items[0].id;
      setSelectedId(firstId);
      await loadProblemDetail(currentToken, firstId);
    }
  }

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
    } catch (err) {
      setAuthError(err.message || "Registration failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadProblemDetail(currentToken, problemId) {
    const detail = await api(`/api/problems/${problemId}`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    const problem = detail?.data;
    if (!problem) return;
    setProblems((prev) => prev.map((p) => (p.id === problemId ? { ...p, ...problem } : p)));
    setCode(problem.starterCode || "");
    setSelectedLanguage((problem.language || "javascript").toLowerCase());
    setTerminal(`Loaded problem: ${problem.title}\n`);
  }

  async function selectProblem(problemId) {
    setSelectedId(problemId);
    try {
      await loadProblemDetail(token, problemId);
    } catch (err) {
      setTerminal((prev) => `${prev}\n[error] ${err.message}\n`);
    }
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
    if (currentUser?.role === "teacher") return;
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

  function handleLogout() {
    localStorage.removeItem("accessToken");
    setToken("");
    setCurrentUser(null);
    setProblems([]);
    setSelectedId(null);
    setCode("");
    setTerminal("Terminal output will appear here.\n");
    setChat([{ role: "assistant", content: "Hi! Ask for hints about your code." }]);
    setChatInput("");
  }

  if (bootstrapping) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          bgcolor: "background.default",
          px: 2,
        }}
      >
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
        <PageShell
          title="AI-Assisted Programming Platform"
          subtitle="Sign in to continue or create a new account."
          maxWidth="sm"
        >
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

  if (currentUser?.role === "teacher") {
    return (
      <TeacherDashboard
        currentUser={currentUser}
        problems={problems}
        handleLogout={handleLogout}
      />
    );
  }

  return (
    <StudentWorkspace
      currentUser={currentUser}
      selectedProblem={selectedProblem}
      navItems={NAV_ITEMS}
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
    />
  );
}
