import { useEffect, useMemo, useState } from "react";

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
  const [token, setToken] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(true);

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
    bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    setAuthError("");
    try {
      const login = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      });
      const nextToken = login.accessToken;
      setToken(nextToken);

      const list = await api("/api/problems", {
        headers: { Authorization: `Bearer ${nextToken}` },
      });
      const items = list?.data ?? [];
      setProblems(items);

      if (items.length > 0) {
        const firstId = items[0].id;
        setSelectedId(firstId);
        await loadProblemDetail(nextToken, firstId);
      }
    } catch (err) {
      setAuthError(err.message || "Failed to initialize app.");
    } finally {
      setLoading(false);
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

  if (loading) {
    return <div className="center">Loading platform...</div>;
  }

  if (authError) {
    return (
      <div className="center error">
        Initialization failed: {authError}
        <br />
        Ensure backend+db+seed are running.
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">AI Programming Platform</div>
        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <button key={item} type="button" className="nav-item" disabled>
              {item}
            </button>
          ))}
        </nav>
      </header>

      <main className="layout">
        <aside className="panel assignments">
          <h3>Assignments</h3>
          <div className="assignment-list">
            {problems.map((p) => (
              <button
                key={p.id}
                className={`assignment-item ${p.id === selectedId ? "active" : ""}`}
                onClick={() => selectProblem(p.id)}
                type="button"
              >
                <strong>{p.title}</strong>
                <span>{p.difficulty || "unknown"} · {p.language || "n/a"}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel editor-area">
          <h3>{selectedProblem?.title || "Code Editor"}</h3>
          <div className="editor-toolbar">
            <label htmlFor="language-select">Language:</label>
            <select
              id="language-select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="editor"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
          />
          <div className="editor-actions">
            <button onClick={runRaw} disabled={running} type="button">
              {running ? "Running..." : "Run"}
            </button>
            <button onClick={runTests} disabled={running || !selectedProblem} type="button">
              Run Tests
            </button>
          </div>
          <pre className="terminal">{terminal}</pre>
        </section>

        <aside className="panel chat-area">
          <h3>AI Mentor Chat</h3>
          <div className="chat-log">
            {chat.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <b>{m.role === "assistant" ? "Mentor" : "You"}:</b> {m.content}
              </div>
            ))}
          </div>
          <div className="chat-input-row">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask for a hint..."
              rows={3}
            />
            <button onClick={sendChat} disabled={chatLoading || !selectedProblem} type="button">
              {chatLoading ? "Sending..." : "Send"}
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}
