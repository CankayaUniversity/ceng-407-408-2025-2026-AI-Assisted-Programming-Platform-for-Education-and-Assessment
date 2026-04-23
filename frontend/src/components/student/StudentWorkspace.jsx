import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  Alert,
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
  Typography,
} from "@mui/material";

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
  chatLoading,
  submissions,
  submissionsLoading,
  examMode,
  lateDeduction = 0,
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
                    }}
                  >
                    <ListItemText
                      primary={p.title}
                      secondary={`${p.difficulty || "unknown"} · ${p.language || "n/a"}`}
                      primaryTypographyProps={{ fontWeight: 600 }}
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
              borderRadius: 2,
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
                <Stack spacing={1.5}>
                  {chat.map((m, i) => (
                    <Box
                      key={i}
                      sx={{
                        borderRadius: 2,
                        px: 1.5,
                        py: 1.25,
                        bgcolor:
                          m.role === "assistant"
                            ? "rgba(99, 102, 241, 0.14)"
                            : "rgba(14, 165, 233, 0.14)",
                      }}
                    >
                      <Typography variant="body2" component="div" sx={{ "& p": { mt: 0, mb: 0.5 }, "& pre": { overflowX: "auto" }, "& code": { fontSize: 12 } }}>
                        <strong>{m.role === "assistant" ? "Mentor" : "You"}:</strong>{" "}
                        {m.role === "assistant" ? (
                          m.streaming && !m.content ? (
                            // Empty bubble while waiting for first token
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
                          )
                        ) : (
                          <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
                        )}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Stack spacing={2}>
                <TextField
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!chatLoading && selectedProblem) sendChat();
                    }
                  }}
                  placeholder="Ask for a hint… (Enter to send, Shift+Enter for newline)"
                  multiline
                  minRows={3}
                  fullWidth
                />
                <Button variant="contained" onClick={sendChat} disabled={chatLoading || !selectedProblem}>
                  {chatLoading ? "Sending..." : "Send"}
                </Button>
              </Stack>
            </>
          )}
        </SectionCard>
      </Box>
    </AppLayout>
  );
}
