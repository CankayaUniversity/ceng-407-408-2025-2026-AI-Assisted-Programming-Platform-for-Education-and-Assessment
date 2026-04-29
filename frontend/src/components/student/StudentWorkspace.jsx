import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import LightbulbIcon from "@mui/icons-material/Lightbulb";

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
}) {
  const chatBottomRef = useChatScroll(chat);

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
        <SectionCard title="Assignments">
          {problems.length === 0 ? (
            <Typography color="text.secondary">No assignments available.</Typography>
          ) : (
            <List disablePadding>
              {problems.map((p) => {
                const isSelected = p.id === selectedId;
                const diffColor =
                  p.difficulty === "Easy"   ? "#22c55e" :
                  p.difficulty === "Medium" ? "#f59e0b" :
                  p.difficulty === "Hard"   ? "#ef4444" : "#64748b";
                return (
                  <ListItemButton
                    key={p.id}
                    selected={isSelected}
                    onClick={() => selectProblem(p.id)}
                    sx={{
                      mb: 1,
                      border: 1,
                      borderColor: isSelected ? "primary.main" : "divider",
                      borderRadius: 2,
                      alignItems: "flex-start",
                      bgcolor: isSelected ? "rgba(99,102,241,0.08)" : "transparent",
                    }}
                  >
                    <ListItemText
                      primary={p.title}
                      secondary={`${p.language || "n/a"}`}
                      primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}
                    />
                    <Box
                      sx={{
                        width: 8, height: 8, borderRadius: "50%",
                        bgcolor: diffColor, flexShrink: 0,
                        mt: 1.2, ml: 1,
                      }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </SectionCard>

        <SectionCard
          title={selectedProblem?.title || "Code Editor"}
          action={
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
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

          {/* Difficulty / language chips */}
          <Box sx={{ mb: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
            {selectedProblem?.difficulty && <Chip label={selectedProblem.difficulty} size="small" />}
            {selectedProblem?.language   && <Chip label={selectedProblem.language}   size="small" variant="outlined" />}
          </Box>

          {/* Problem description */}
          {selectedProblem?.description && (
            <Box
              sx={{
                mb: 2,
                p: 2,
                bgcolor: "rgba(148,163,184,0.06)",
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                whiteSpace: "pre-wrap",
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
                Problem Description
              </Typography>
              <Typography variant="body2">{selectedProblem.description}</Typography>
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
            {flashcards.length > 0 && (
              <Box sx={{ mt: 1.5, display: "flex", justifyContent: "flex-end" }}>
                <Chip
                  label={`View Feedback Cards (${flashcards.length})`}
                  color="primary"
                  variant="outlined"
                  onClick={onViewFlashcards}
                  sx={{ cursor: "pointer", fontWeight: 600 }}
                />
              </Box>
            )}
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
    </AppLayout>
  );
}
