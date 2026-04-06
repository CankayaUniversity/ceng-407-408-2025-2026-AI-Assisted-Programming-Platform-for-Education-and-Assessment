import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";

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

const LANGUAGE_ID_MAP = {
  javascript: 63,
  js: 63,
  python: 71,
  py: 71,
  java: 62,
  cpp: 54,
  "c++": 54,
  c: 50,
  csharp: 51,
  "c#": 51,
};

function resolveLanguageId(lang) {
  if (!lang) return 63;
  return LANGUAGE_ID_MAP[lang.toLowerCase()] ?? 63;
}

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
    // If a token exists in localStorage, bootstrap the session from it.
    // Otherwise show the login screen.
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
        // Token might be expired/invalid; clear it and show login.
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

  if (bootstrapping) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-200">
        Loading platform...
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 bg-[radial-gradient(circle_at_top_left,_#3730a3_0%,_transparent_40%),radial-gradient(circle_at_top_right,_#0ea5e9_0%,_transparent_35%)] p-4">
        <div className="w-full max-w-md rounded-2xl border border-indigo-300/20 bg-slate-900/75 p-5 text-slate-100 shadow-2xl backdrop-blur">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                authMode === "login"
                  ? "border-transparent bg-gradient-to-r from-indigo-500 to-cyan-500 text-white"
                  : "border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800"
              }`}
              onClick={() => setAuthMode("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                authMode === "register"
                  ? "border-transparent bg-gradient-to-r from-indigo-500 to-cyan-500 text-white"
                  : "border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800"
              }`}
              onClick={() => setAuthMode("register")}
            >
              Register
            </button>
          </div>
          <h2 className="mb-2 text-lg font-semibold tracking-wide">
            {authMode === "login" ? "Sign in" : "Create account"}
          </h2>
          {authError ? (
            <div className="my-2 rounded-lg border border-rose-400/40 bg-rose-500/10 p-2 text-sm text-rose-200">
              {authError}
            </div>
          ) : null}
          {authMode === "register" ? (
            <label className="mt-2 block text-sm text-indigo-200">
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/80 p-2 text-slate-100 outline-none ring-0 focus:border-indigo-400"
              />
            </label>
          ) : null}
          <label className="mt-2 block text-sm text-indigo-200">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/80 p-2 text-slate-100 outline-none ring-0 focus:border-indigo-400"
            />
          </label>
          <label className="mt-2 block text-sm text-indigo-200">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/80 p-2 text-slate-100 outline-none ring-0 focus:border-indigo-400"
            />
          </label>
          {authMode === "register" ? (
            <label className="mt-2 block text-sm text-indigo-200">
              Role
              <select
                value={registerRole}
                onChange={(e) => setRegisterRole(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/80 p-2 text-slate-100 outline-none focus:border-indigo-400"
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </label>
          ) : null}
          {authMode === "login" ? (
            <>
              <button
                onClick={handleSignIn}
                disabled={authLoading}
                type="button"
                className="mt-3 w-full rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-2 font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
              >
                {authLoading ? "Signing in..." : "Sign in"}
              </button>
              <div className="mt-3 text-xs text-slate-400">
                Demo user: <b>{DEMO_EMAIL}</b> / <b>{DEMO_PASSWORD}</b>
              </div>
            </>
          ) : (
            <button
              onClick={handleRegister}
              disabled={authLoading}
              type="button"
              className="mt-3 w-full rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-2 font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
            >
              {authLoading ? "Creating..." : "Register"}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (currentUser?.role === "teacher") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-indigo-300/20 bg-slate-900/80 px-4 py-3 backdrop-blur">
          <div className="text-sm font-semibold md:text-base">AI Programming Platform - Teacher</div>
          <div className="flex items-center gap-2 text-sm">
            <span>{currentUser?.name || currentUser?.email}</span>
            <button
              type="button"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-sm hover:bg-slate-800"
              onClick={() => {
                localStorage.removeItem("accessToken");
                setToken("");
                setCurrentUser(null);
                setProblems([]);
              }}
            >
              Logout
            </button>
          </div>
        </header>
        <main className="mx-auto grid max-w-7xl gap-3 p-3">
          <section className="rounded-xl border border-indigo-300/20 bg-slate-900/70 p-4 shadow-xl shadow-black/20">
            <h3 className="mb-2 text-lg font-semibold">Teacher Dashboard</h3>
            <p className="text-sm text-slate-300">
              Welcome back, <b>{currentUser?.name || currentUser?.email}</b>. You can track assignments
              and prepare new class activities from here.
            </p>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <article className="rounded-xl border border-indigo-300/20 bg-slate-900/70 p-4 shadow-lg shadow-black/20">
              <h4 className="text-sm text-slate-300">Total Assignments</h4>
              <strong className="text-3xl">{problems.length}</strong>
            </article>
            <article className="rounded-xl border border-indigo-300/20 bg-slate-900/70 p-4 shadow-lg shadow-black/20">
              <h4 className="text-sm text-slate-300">Visible Difficulties</h4>
              <strong className="text-3xl">{new Set(problems.map((p) => p.difficulty || "unknown")).size}</strong>
            </article>
            <article className="rounded-xl border border-indigo-300/20 bg-slate-900/70 p-4 shadow-lg shadow-black/20">
              <h4 className="text-sm text-slate-300">Languages Used</h4>
              <strong className="text-3xl">{new Set(problems.map((p) => p.language || "n/a")).size}</strong>
            </article>
          </section>

          <section className="rounded-xl border border-indigo-300/20 bg-slate-900/70 p-4 shadow-xl shadow-black/20">
            <h4 className="mb-3 text-lg font-semibold">Assignments Overview</h4>
            <div className="overflow-hidden rounded-xl border border-slate-700">
              <div className="grid grid-cols-3 gap-2 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-300">
                <span>Title</span>
                <span>Difficulty</span>
                <span>Language</span>
              </div>
              {problems.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-3 gap-2 border-t border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
                >
                  <span>{p.title}</span>
                  <span>{p.difficulty || "unknown"}</span>
                  <span>{p.language || "n/a"}</span>
                </div>
              ))}
              {problems.length === 0 ? (
                <div className="px-3 py-3 text-sm text-slate-400">No assignments found yet.</div>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-indigo-300/20 bg-slate-900/70 p-4 shadow-xl shadow-black/20">
            <h4 className="mb-3 text-lg font-semibold">Planned Teacher Tools</h4>
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
              <li>Student analytics by assignment</li>
              <li>Common error categories and trend view</li>
              <li>AI-generated similar problem suggestions</li>
              <li>Rubric suggestion and grading support</li>
            </ul>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-indigo-300/20 bg-slate-900/80 px-4 py-3 backdrop-blur">
        <div className="text-sm font-semibold md:text-base">AI Programming Platform</div>
        <nav className="flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              type="button"
              className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1 text-sm text-slate-300"
              disabled
            >
              {item}
            </button>
          ))}
          <button
            type="button"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-sm hover:bg-slate-800"
            onClick={() => {
              localStorage.removeItem("accessToken");
              setToken("");
              setCurrentUser(null);
              setProblems([]);
            }}
          >
            Logout
          </button>
        </nav>
      </header>

      <main className="mx-auto grid max-w-[1800px] gap-3 p-3 md:grid-cols-12">
        <aside className="rounded-xl border border-indigo-300/20 bg-slate-900/70 p-3 shadow-xl shadow-black/20 md:col-span-3">
          <h3 className="mb-2 font-semibold">Assignments</h3>
          <div className="max-h-[70vh] space-y-2 overflow-auto">
            {problems.map((p) => (
              <button
                key={p.id}
                className={`w-full rounded-lg border p-2 text-left transition ${
                  p.id === selectedId
                    ? "border-indigo-400 bg-indigo-500/20"
                    : "border-slate-700 bg-slate-950/60 hover:bg-slate-900"
                }`}
                onClick={() => selectProblem(p.id)}
                type="button"
              >
                <strong className="block text-slate-100">{p.title}</strong>
                <span className="text-xs text-slate-400">
                  {p.difficulty || "unknown"} · {p.language || "n/a"}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-xl border border-indigo-300/20 bg-slate-900/70 p-3 shadow-xl shadow-black/20 md:col-span-6">
          <h3 className="mb-2 font-semibold">{selectedProblem?.title || "Code Editor"}</h3>
          <div className="mb-2 flex items-center gap-2">
            <label htmlFor="language-select" className="text-sm text-slate-300">
              Language:
            </label>
            <select
              id="language-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="h-[420px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
            <Editor
              height="100%"
              defaultLanguage="javascript"
              language={selectedLanguage === "csharp" ? "csharp" : selectedLanguage}
              value={code}
              onChange={(value) => setCode(value ?? "")}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={runRaw}
              disabled={running}
              type="button"
              className="rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {running ? "Running..." : "Run"}
            </button>
            <button
              onClick={runTests}
              disabled={running || !selectedProblem}
              type="button"
              className="rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Run Tests
            </button>
          </div>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950/80 p-3 font-mono text-xs leading-relaxed text-sky-200">
            {terminal}
          </pre>
        </section>

        <aside className="rounded-xl border border-indigo-300/20 bg-slate-900/70 p-3 shadow-xl shadow-black/20 md:col-span-3">
          <h3 className="mb-2 font-semibold">AI Mentor Chat</h3>
          <div className="max-h-[520px] min-h-[420px] space-y-2 overflow-auto rounded-lg border border-slate-700 bg-slate-950/80 p-3">
            {chat.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg p-2 text-sm leading-relaxed ${
                  m.role === "assistant" ? "bg-indigo-500/15 text-slate-100" : "bg-cyan-500/15 text-slate-100"
                }`}
              >
                <b>{m.role === "assistant" ? "Mentor" : "You"}:</b> {m.content}
              </div>
            ))}
          </div>
          <div className="mt-2 grid gap-2">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask for a hint..."
              rows={3}
              className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
            />
            <button
              onClick={sendChat}
              disabled={chatLoading || !selectedProblem}
              type="button"
              className="rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {chatLoading ? "Sending..." : "Send"}
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}
