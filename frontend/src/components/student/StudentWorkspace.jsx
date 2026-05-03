import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import LightbulbIcon    from "@mui/icons-material/Lightbulb";
import ArrowBackIcon      from "@mui/icons-material/ArrowBack";
import MenuBookIcon       from "@mui/icons-material/MenuBook";
import OpenInFullIcon     from "@mui/icons-material/OpenInFull";
import CloseFullscreenIcon from "@mui/icons-material/CloseFullscreen";
import ExpandMoreIcon     from "@mui/icons-material/ExpandMore";
import ExpandLessIcon     from "@mui/icons-material/ExpandLess";
import { API_BASE }       from "../../apiBase";

import SectionCard         from "../common/SectionCard";
import AppLayout           from "../layout/AppLayout";
import SubmissionHistory   from "./SubmissionHistory";
import EditorTabBar        from "./EditorTabBar";
import InteractiveTerminal from "./InteractiveTerminal";
import { wsUrl }           from "../../wsBase";

function monacoLanguage(value) {
  if (value === "csharp") return "csharp";
  if (value === "cpp") return "cpp";
  return value || "python";
}

function useChatScroll(chat) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);
  return ref;
}

export default function StudentWorkspace({
  currentUser,
  selectedProblem,
  navItems,
  handleLogout,
  problems,
  selectedId,
  selectProblem,
  selectedLanguage,
  setSelectedLanguage,
  languageOptions,
  runRaw,
  running,
  runTests,
  // Phase 7 — multi-file
  files,
  activeFileId,
  onFileSelect,
  onFileAdd,
  onFileClose,
  onFileRename,
  code,
  setCode,
  // Phase 6 — xterm writer ref (owned by ProblemPage)
  termWriterRef,
  chat,
  chatInput,
  setChatInput,
  sendChat,
  sendHint,
  hintCount = 0,
  chatLoading,
  submissions,
  submissionsLoading,
  examMode,
  lateDeduction = 0,
  flashcards = [],
  onViewFlashcards,
  token,
  tutorialLanguage = "c",
}) {
  const chatBottomRef = useChatScroll(chat);

  // ── Left panel tabs ───────────────────────────────────────────────────────
  const [leftTab,          setLeftTab]          = useState(0); // 0=assignments 1=tutorials
  const [tutorialList,     setTutorialList]     = useState(null);
  const [selectedTutorial, setSelectedTutorial] = useState(null);
  const [tutorialContent,  setTutorialContent]  = useState(null);
  const [tutorialStatus,   setTutorialStatus]   = useState("idle");
  const [tutorialExpanded, setTutorialExpanded] = useState(false); // fullscreen overlay
  const [descOpen,         setDescOpen]         = useState(true);  // problem description toggle

  // Load tutorial index when Tutorials tab is first opened
  useEffect(() => {
    if (leftTab !== 1 || tutorialList !== null) return;
    fetch(`${API_BASE}/api/tutorials/index/${tutorialLanguage}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((body) => setTutorialList(body?.data ?? []))
      .catch(() => setTutorialList([]));
  }, [leftTab, tutorialList, token, tutorialLanguage]);

  function openTutorial(tag, title) {
    setSelectedTutorial({ tag, title });
    setTutorialContent(null);
    setTutorialStatus("loading");
    fetch(`${API_BASE}/api/tutorials/${encodeURIComponent(tag)}/${encodeURIComponent(tutorialLanguage)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((body) => { setTutorialContent(body?.data?.content ?? null); setTutorialStatus("ready"); })
      .catch(() => setTutorialStatus("error"));
  }

  function backToList() {
    setSelectedTutorial(null);
    setTutorialContent(null);
    setTutorialStatus("idle");
  }

  return (
    <AppLayout
      title="AI Mentor" 
      roleLabel="Student"
      userLabel={currentUser?.name || currentUser?.email}
      onLogout={handleLogout}
      navItems={navItems}
      maxWidth="xl" 
      showPageTitle={false}
    >
      <Box
        sx={{
          display: "grid",
          gap: 3,
          gridTemplateColumns: { xs: "1fr", md: "minmax(260px, 320px) minmax(0, 1fr) minmax(280px, 360px)" },
          alignItems: "start",
        }}
      >
        {/* ── Left panel: Assignments / Tutorials tabs ────────────────── */}
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 3, overflow: "hidden", bgcolor: "background.paper" }}>
          {/* Tab bar */}
          <Tabs value={leftTab} onChange={(_, v) => setLeftTab(v)} variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: "divider", minHeight: 40 }}>
            <Tab label="Assignments" sx={{ fontSize: 12, minHeight: 40, py: 0 }} />
            <Tab label="C Tutorials" sx={{ fontSize: 12, minHeight: 40, py: 0 }}
              icon={<MenuBookIcon sx={{ fontSize: 14 }} />} iconPosition="start" />
          </Tabs>

          <Box sx={{ p: 1.5 }}>
            {/* ── Assignments ── */}
            {leftTab === 0 && (
              problems.length === 0
                ? <Typography color="text.secondary" sx={{ p: 1 }}>No assignments available.</Typography>
                : <List disablePadding>
                    {problems.map((p) => {
                      const isSelected = p.id === selectedId;
                      const diffColor = p.difficulty === "Easy" ? "#22c55e" : p.difficulty === "Medium" ? "#f59e0b" : p.difficulty === "Hard" ? "#ef4444" : "#64748b";
                      return (
                        <ListItemButton key={p.id} selected={isSelected} onClick={() => selectProblem(p.id)}
                          sx={{ mb: 1, border: 1, borderColor: isSelected ? "primary.main" : "divider", borderRadius: 2, alignItems: "flex-start", bgcolor: isSelected ? "rgba(99,102,241,0.08)" : "transparent" }}>
                          <ListItemText primary={p.title} secondary={p.language || "n/a"} primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
                          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: diffColor, flexShrink: 0, mt: 1.2, ml: 1 }} />
                        </ListItemButton>
                      );
                    })}
                  </List>
            )}

            {/* ── Tutorials ── */}
            {leftTab === 1 && (
              <Box>
                {/* Topic list */}
                {!selectedTutorial && (
                  <>
                    {tutorialList === null && <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress size={24} /></Box>}
                    {tutorialList !== null && tutorialList.length === 0 && <Typography color="text.secondary" sx={{ p: 1 }}>No tutorials available.</Typography>}
                    {tutorialList !== null && tutorialList.length > 0 && (
                      <List disablePadding>
                        {tutorialList.map((t) => (
                          <ListItemButton key={t.tag} onClick={() => openTutorial(t.tag, t.title)}
                            sx={{ mb: 0.5, borderRadius: 2, border: 1, borderColor: "divider" }}>
                            <ListItemText primary={t.title} primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }} />
                          </ListItemButton>
                        ))}
                      </List>
                    )}
                  </>
                )}

                {/* Tutorial content */}
                {selectedTutorial && (
                  <Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                      <Button startIcon={<ArrowBackIcon />} size="small" onClick={backToList} sx={{ fontSize: 12 }}>
                        Topics
                      </Button>
                      <Tooltip title={tutorialExpanded ? "Collapse" : "Expand tutorial"}>
                        <IconButton size="small" onClick={() => setTutorialExpanded((v) => !v)}>
                          {tutorialExpanded ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </Stack>

                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                      {selectedTutorial.title}
                    </Typography>

                    {tutorialStatus === "loading" && <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress size={24} /></Box>}
                    {tutorialStatus === "error"   && <Alert severity="error" sx={{ borderRadius: 2 }}>Failed to load tutorial.</Alert>}
                    {tutorialStatus === "ready" && tutorialContent && (
                      <Stack spacing={2} sx={{ maxHeight: tutorialExpanded ? "none" : 520, overflowY: tutorialExpanded ? "visible" : "auto", pr: 0.5 }}>
                        {(tutorialContent.sections ?? []).map((section, idx) => (
                          <Box key={idx}>
                            {section.heading && (
                              <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>{section.heading}</Typography>
                            )}
                            {section.body && (
                              <Typography variant="caption" color="text.secondary"
                                sx={{ display: "block", mb: section.code ? 1 : 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                                {section.body}
                              </Typography>
                            )}
                            {section.code && (
                              <Box sx={{ borderRadius: 1.5, overflow: "hidden", border: 1, borderColor: "divider" }}>
                                <Editor
                                  height={`${Math.min(Math.max(section.code.split("\n").length * 19 + 16, 60), 240)}px`}
                                  language="c"
                                  value={section.code}
                                  theme="vs-dark"
                                  options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, lineNumbers: "off", scrollBeyondLastLine: false, padding: { top: 8, bottom: 8 }, automaticLayout: true }}
                                />
                              </Box>
                            )}
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Box>

        <SectionCard
          title={selectedProblem?.title || "Code Editor"}
          action={
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              {flashcards.length > 0 && (
                <Chip
                  label={`💡 Feedback Cards (${flashcards.length})`}
                  color="primary"
                  variant="outlined"
                  onClick={onViewFlashcards}
                  sx={{ cursor: "pointer", fontWeight: 600 }}
                />
              )}
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="language-select-label">Language</InputLabel>
                <Select
                  labelId="language-select-label"
                  value={selectedLanguage}
                  label="Language"
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                >
                  {languageOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button variant="contained" onClick={runRaw} disabled={running}>
                {running ? "Running..." : "Run"}
              </Button>
              <Button variant="contained" onClick={runTests} disabled={running || !selectedProblem}>
                Submit
              </Button>
            </Stack>
          }
        >
          {/* Late submission warning */}
          {lateDeduction > 0 && (
            <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2 }}>
              You are submitting late. A <strong>{lateDeduction}%</strong> point deduction will be applied to your score.
            </Alert>
          )}

          {/* Difficulty / language chips + description toggle */}
          <Box sx={{ mb: 1, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            {selectedProblem?.difficulty && <Chip label={selectedProblem.difficulty} size="small" />}
            {selectedProblem?.language   && <Chip label={selectedProblem.language}   size="small" variant="outlined" />}
            {selectedProblem?.description && (
              <Chip
                label={descOpen ? "Hide Description" : "Show Description"}
                size="small"
                variant="outlined"
                icon={descOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                onClick={() => setDescOpen((v) => !v)}
                sx={{ cursor: "pointer", ml: "auto" }}
              />
            )}
          </Box>

          {/* Problem description — collapsible */}
          {selectedProblem?.description && descOpen && (
            <Box sx={{ mb: 2, p: 2, bgcolor: "rgba(99,102,241,0.06)", border: 1, borderColor: "rgba(99,102,241,0.2)", borderRadius: 2 }}>
              <Typography variant="body2" sx={{ lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                {selectedProblem.description}
              </Typography>
            </Box>
          )}

          {/* Phase 7 — multi-file tab bar */}
          <EditorTabBar
            files={files}
            activeId={activeFileId}
            onSelect={onFileSelect}
            onAdd={onFileAdd}
            onClose={onFileClose}
            onRename={onFileRename}
          />

          {/* Monaco editor — rounded bottom corners only */}
          <Box sx={{ height: 380, overflow: "hidden", border: 1, borderTop: 0, borderColor: "divider", borderRadius: "0 0 12px 12px" }}>
            <Editor
              key={`${monacoLanguage(selectedLanguage)}-${activeFileId}`}
              height="100%"
              language={monacoLanguage(selectedLanguage)}
              value={code}
              onChange={(v) => setCode(v ?? "")}
              theme="vs-dark"
              options={{
                minimap:              { enabled: false },
                fontSize:             13,
                automaticLayout:      true,
                scrollBeyondLastLine: false,
              }}
            />
          </Box>

          {/* Phase 6 — xterm.js interactive terminal */}
          <Box
            sx={{
              mt: 2,
              height: 200,
              border: 1,
              borderColor: "divider",
              borderRadius: 0,
              overflow: "hidden",
              bgcolor: "#0f172a",
            }}
          >
            <InteractiveTerminal
              wsUrl={wsUrl("/ws/terminal")}
              onReady={(writer) => { termWriterRef.current = writer; }}
            />
          </Box>

          <Box sx={{ mt: 2 }}>
            <SubmissionHistory submissions={submissions} loading={submissionsLoading} />
          </Box>
        </SectionCard>

        <SectionCard title="AI Mentor Chat">
          {examMode ? (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              Exam mode is active. AI Mentor is currently disabled.
            </Alert>
          ) : (
            <>
              <Box
                ref={chatBottomRef}
                sx={{
                  minHeight: 420,
                  maxHeight: 520,
                  overflow: "auto",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 2,
                  p: 2,
                  bgcolor: "background.default",
                }}
              >
                <Stack spacing={1}>
                  {chat.map((m, i) => {
                    const isUser = m.role === "user";
                    return (
                      <Box
                        key={i}
                        sx={{
                          display: "flex",
                          justifyContent: isUser ? "flex-end" : "flex-start",
                        }}
                      >
                        <Box
                          sx={{
                            maxWidth: "88%",
                            px: 1.5,
                            py: 1,
                            borderRadius: isUser
                              ? "14px 14px 4px 14px"
                              : "14px 14px 14px 4px",
                            bgcolor: isUser
                              ? "rgba(14,165,233,0.16)"
                              : "rgba(99,102,241,0.14)",
                            border: "1px solid",
                            borderColor: isUser
                              ? "rgba(14,165,233,0.28)"
                              : "rgba(99,102,241,0.22)",
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              display: "block",
                              fontWeight: 700,
                              mb: 0.25,
                              color: isUser ? "#38bdf8" : "#a5b4fc",
                            }}
                          >
                            {isUser ? "You" : "AI Mentor"}
                          </Typography>
                          <Typography
                            variant="body2"
                            component="div"
                            sx={{
                              "& p": { mt: 0, mb: 0.5 },
                              "& pre": { overflowX: "auto" },
                              "& code": { fontSize: 12 },
                            }}
                          >
                            {isUser ? (
                              <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
                            ) : m.streaming && !m.content ? (
                              <span style={{ opacity: 0.5 }}>
                                Thinking
                                <span style={{ display: "inline-block", animation: "blink 1s step-start infinite" }}>▋</span>
                              </span>
                            ) : (
                              <span>
                                <span
                                  dangerouslySetInnerHTML={{
                                    __html: DOMPurify.sanitize(marked.parse(m.content || "")),
                                  }}
                                />
                                {m.streaming && (
                                  <span style={{ display: "inline-block", animation: "blink 1s step-start infinite", marginLeft: 1 }}>▋</span>
                                )}
                              </span>
                            )}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Stack spacing={1.5}>
                <TextField
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!chatLoading && selectedProblem) sendChat();
                    }
                  }}
                  placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
                  multiline
                  minRows={3}
                  fullWidth
                />
                <Stack direction="row" spacing={1}>
                  {/* Hint button */}
                  <Tooltip title={
                    hintCount === 0
                      ? "Get a Socratic hint for your next step"
                      : `Get another hint (${hintCount} used this session)`
                  }>
                    <span>
                      <Button
                        variant="outlined"
                        color="warning"
                        startIcon={
                          <Badge
                            badgeContent={hintCount > 0 ? hintCount : null}
                            color="warning"
                            sx={{ "& .MuiBadge-badge": { fontSize: 10, minWidth: 16, height: 16 } }}
                          >
                            <LightbulbIcon fontSize="small" />
                          </Badge>
                        }
                        onClick={sendHint}
                        disabled={chatLoading || !selectedProblem}
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        {hintCount === 0 ? "Hint" : "Another Hint"}
                      </Button>
                    </span>
                  </Tooltip>

                  {/* Send button */}
                  <Button
                    variant="contained"
                    onClick={() => sendChat()}
                    disabled={chatLoading || !selectedProblem}
                    sx={{ flex: 1 }}
                  >
                    {chatLoading ? "Sending…" : "Send"}
                  </Button>
                </Stack>
              </Stack>
            </>
          )}
        </SectionCard>
      </Box>

      {/* ── Expanded tutorial overlay ────────────────────────────────────────── */}
      {tutorialExpanded && selectedTutorial && (
        <Box sx={{
          position: "fixed", inset: 0, zIndex: 1300,
          bgcolor: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          p: 3,
        }}
          onClick={() => setTutorialExpanded(false)}
        >
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{
              bgcolor: "background.paper",
              borderRadius: 3,
              border: 1,
              borderColor: "divider",
              width: "100%",
              maxWidth: 860,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <Stack direction="row" alignItems="center" justifyContent="space-between"
              sx={{ px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <MenuBookIcon color="primary" />
                <Typography variant="h6" fontWeight={700}>{selectedTutorial.title}</Typography>
                <Chip label="C" size="small" variant="outlined" sx={{ fontSize: 11 }} />
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button startIcon={<ArrowBackIcon />} size="small" onClick={() => { backToList(); setTutorialExpanded(false); }}>
                  Topics
                </Button>
                <Tooltip title="Collapse">
                  <IconButton size="small" onClick={() => setTutorialExpanded(false)}>
                    <CloseFullscreenIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>

            {/* Content */}
            <Box sx={{ overflowY: "auto", p: 3 }}>
              <Stack spacing={2.5}>
                {(tutorialContent?.sections ?? []).map((section, idx) => (
                  <Box key={idx}>
                    {section.heading && (
                      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.75 }}>{section.heading}</Typography>
                    )}
                    {section.body && (
                      <Typography variant="body2" color="text.secondary"
                        sx={{ mb: section.code ? 1.5 : 0, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                        {section.body}
                      </Typography>
                    )}
                    {section.code && (
                      <Box sx={{ borderRadius: 2, overflow: "hidden", border: 1, borderColor: "divider" }}>
                        <Editor
                          height={`${Math.min(Math.max(section.code.split("\n").length * 20 + 20, 70), 320)}px`}
                          language="c"
                          value={section.code}
                          theme="vs-dark"
                          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, lineNumbers: "off", scrollBeyondLastLine: false, padding: { top: 10, bottom: 10 }, automaticLayout: true }}
                        />
                      </Box>
                    )}
                  </Box>
                ))}
              </Stack>
            </Box>
          </Box>
        </Box>
      )}
    </AppLayout>
  );
}
