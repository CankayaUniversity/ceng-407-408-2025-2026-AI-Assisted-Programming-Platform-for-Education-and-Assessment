import Editor from "@monaco-editor/react";
import {
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
  terminal,
  chat,
  chatInput,
  setChatInput,
  sendChat,
  chatLoading,
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
                Run Tests
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
          </Box>

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
        </SectionCard>

        <SectionCard title="AI Mentor Chat">
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
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    <strong>{m.role === "assistant" ? "Mentor" : "You"}:</strong> {m.content}
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
        </SectionCard>
      </Box>
    </AppLayout>
  );
}
