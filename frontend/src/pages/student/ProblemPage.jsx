import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { API_BASE } from "../../apiBase";
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

const STARTER_CODE = {
  python:     "# Write your solution here\n",
  javascript: "// Write your solution here\n",
  c: `#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n`,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n`,
  csharp: `using System;\n\nclass Program {\n    static void Main(string[] args) {\n        \n    }\n}\n`,
};

let _nextFileId = 2; // file id counter (1 is reserved for the initial file)

// ── Code cache: module-level so it survives component unmount/remount ────────
// When a student navigates away (e.g. /assignments) and back, the component
// unmounts and remounts. A useRef() would be destroyed; a module-level Map is not.
const _codeCache = new Map(); // Map<problemId, { files, activeFileId, language }>

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

    // Reset files to empty BEFORE updating selectedId.
    // This ensures the cache-save effect (which watches files + selectedId) writes
    // an empty entry — not the previous problem's content — into the new problem's slot.
    setFiles([{ id: 1, name: "main.py", content: "" }]);
    setSelectedId(problemId);

    (async () => {
      try {
        const detail = await api(`/api/problems/${problemId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const problem = detail?.data;
        if (!problem) return;

        const lang = (problem.language || "python").toLowerCase();

        // Restore from cache only if the student has actually written something
        const cached = _codeCache.get(problemId);
        const cacheHasContent = cached?.files?.some((f) => f.content.trim() !== "");
        if (cached && cacheHasContent) {
          setSelectedLanguage(cached.language);
          setFiles(cached.files);
          setActiveFileId(cached.activeFileId);
        } else {
          // Use teacher's starter code if provided, otherwise fall back to language default
          setSelectedLanguage(lang);
          const ext  = extForLanguage(lang);
          setFiles([{ id: 1, name: `main.${ext}`, content: problem.starterCode || STARTER_CODE[lang] || "" }]);
          setActiveFileId(1);
        }

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

  // ── Persist current editor state to cache whenever it changes ───────────
  useEffect(() => {
    if (!selectedId) return;
    _codeCache.set(selectedId, { files, activeFileId, language: selectedLanguage });
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

  function runRaw() {
    const writer = termWriterRef.current;
    if (!writer) return;
    setRunning(true);
    writer.run(selectedLanguage, allCode, token, () => setRunning(false));
  }

  // ── AI chat (SSE streaming) ───────────────────────────────────────────────
  async function sendChat() {
    const message = chatInput.trim();
    if (!message || !selectedProblem) return;

    setChat((prev) => [
      ...prev,
      { role: "user",      content: message },
      { role: "assistant", content: "", streaming: true },
    ]);
    setChatInput("");
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
          runStatus:       "idle",
          language:        selectedLanguage,
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
