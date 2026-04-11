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

import SectionCard from "../common/SectionCard";
import AppLayout from "../layout/AppLayout";
import SubmissionHistory from "./SubmissionHistory";

function monacoLanguage(value) {
  if (value === "csharp") return "csharp";
  if (value === "cpp") return "cpp";
  return value || "python";
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
  code,
  setCode,
  programStdin,
  setProgramStdin,
  terminal,
  chat,
  chatInput,
  setChatInput,
  sendChat,
  chatLoading,
  submissions,
  submissionsLoading,
  examMode,
}) {
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
          <Box sx={{ mb: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
            {selectedProblem?.difficulty ? <Chip label={selectedProblem.difficulty} size="small" /> : null}
            {selectedProblem?.language ? (
              <Chip label={selectedProblem.language} size="small" variant="outlined" />
            ) : null}
          </Box>

          <Box sx={{ height: 420, overflow: "hidden", border: 1, borderColor: "divider", borderRadius: 3 }}>
            <Editor
              key={monacoLanguage(selectedLanguage)}
              height="100%"
              defaultLanguage={monacoLanguage(selectedLanguage)}
              language={monacoLanguage(selectedLanguage)}
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
          </Box>

          <TextField
            label="Program input (stdin)"
            value={programStdin}
            onChange={(e) => setProgramStdin(e.target.value)}
            placeholder="Standard input for Run (all languages)"
            multiline
            minRows={3}
            maxRows={8}
            fullWidth
            sx={{
              mt: 2,
              "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: 13 },
            }}
            helperText="A trailing newline is added if missing (avoids blocking on input/scanf). For multiple reads, put one line per input() call."
          />

          <Box
            component="pre"
            sx={{
              mt: 2,
              mb: 0,
              maxHeight: 240,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              bgcolor: "background.default",
              p: 2,
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            {terminal}
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
                          <span
                            dangerouslySetInnerHTML={{
                              __html: DOMPurify.sanitize(marked.parse(m.content || "")),
                            }}
                          />
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
                  placeholder="Ask for a hint..."
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
