import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon       from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon      from "@mui/icons-material/Cancel";
import Editor          from "@monaco-editor/react";
import { API_BASE }    from "../../apiBase";

export default function TutorialModal({ open, onClose, tag, language, token }) {
  const [status,    setStatus]    = useState("loading"); // "loading" | "ready" | "unavailable" | "error"
  const [content,   setContent]   = useState(null);
  const [selected,  setSelected]  = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open || !tag || !language || !token) return;
    setStatus("loading");
    setContent(null);
    setSelected("");
    setSubmitted(false);

    fetch(
      `${API_BASE}/api/tutorials/${encodeURIComponent(tag)}/${encodeURIComponent(language)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then((r) => {
        if (r.status === 404) { setStatus("unavailable"); return null; }
        if (!r.ok) throw new Error("Failed to load tutorial");
        return r.json();
      })
      .then((body) => {
        if (!body) return;
        setContent(body.data?.content ?? null);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [open, tag, language, token]);

  const isCorrect = submitted && selected === content?.quiz?.answer;

  // Monaco language mapping
  const monacoLang = { cpp: "cpp", csharp: "csharp", javascript: "javascript", python: "python", c: "c" }[language] ?? language;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      scroll="paper"
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Typography variant="h6" fontWeight={700}>{tag}</Typography>
          <Chip
            label={language.toUpperCase()}
            size="small"
            variant="outlined"
            sx={{ fontSize: 11 }}
          />
        </Stack>
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* ── Loading ───────────────────────────────────────────────────── */}
        {status === "loading" && (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 8 }}>
            <Stack alignItems="center" spacing={2}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary">Loading tutorial…</Typography>
            </Stack>
          </Box>
        )}

        {/* ── Not yet generated ─────────────────────────────────────────── */}
        {status === "unavailable" && (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography color="text.secondary" gutterBottom>
              This tutorial is still being prepared.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Check back in a moment — it's generated automatically when the assignment is published.
            </Typography>
          </Box>
        )}

        {/* ── Error ────────────────────────────────────────────────────── */}
        {status === "error" && (
          <Alert severity="error">Failed to load tutorial. Please try again.</Alert>
        )}

        {/* ── Content ──────────────────────────────────────────────────── */}
        {status === "ready" && content && (
          <Stack spacing={3} sx={{ pt: 0.5 }}>
            {/* Intro */}
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75 }}>
              {content.intro}
            </Typography>

            {/* Sections */}
            {(content.sections ?? []).map((section, idx) => (
              <Box key={idx}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.75 }}>
                  {section.heading}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: section.code ? 1.5 : 0, lineHeight: 1.75 }}
                >
                  {section.text}
                </Typography>
                {section.code && (
                  <Box sx={{ borderRadius: 2, overflow: "hidden", border: 1, borderColor: "divider" }}>
                    <Editor
                      height="110px"
                      language={monacoLang}
                      value={section.code}
                      theme="vs-dark"
                      options={{
                        readOnly:             true,
                        minimap:              { enabled: false },
                        fontSize:             13,
                        lineNumbers:          "off",
                        scrollBeyondLastLine: false,
                        padding:              { top: 10, bottom: 10 },
                        automaticLayout:      true,
                      }}
                    />
                  </Box>
                )}
              </Box>
            ))}

            <Divider />

            {/* Try It */}
            <Box>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                Try It Yourself
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Study this example, then open the problem to run and modify your own code.
              </Typography>
              <Box
                sx={{
                  borderRadius: 2,
                  overflow: "hidden",
                  border: 1,
                  borderColor: "primary.main",
                  boxShadow: (theme) => `0 0 0 1px ${theme.palette.primary.main}22`,
                }}
              >
                <Editor
                  height="190px"
                  language={monacoLang}
                  value={content.tryIt}
                  theme="vs-dark"
                  options={{
                    readOnly:             true,
                    minimap:              { enabled: false },
                    fontSize:             13,
                    scrollBeyondLastLine: false,
                    padding:              { top: 12, bottom: 12 },
                    automaticLayout:      true,
                  }}
                />
              </Box>
            </Box>

            <Divider />

            {/* Quiz */}
            {content.quiz && (
              <Box>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
                  Quick Check
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {content.quiz.question}
                </Typography>

                <FormControl component="fieldset">
                  <RadioGroup
                    value={selected}
                    onChange={(e) => { if (!submitted) setSelected(e.target.value); }}
                  >
                    {(content.quiz.options ?? []).map((opt) => {
                      const isAnswer  = opt === content.quiz.answer;
                      const isPicked  = opt === selected;
                      let color = "text.primary";
                      if (submitted && isAnswer)             color = "success.main";
                      else if (submitted && isPicked)        color = "error.main";

                      return (
                        <FormControlLabel
                          key={opt}
                          value={opt}
                          control={<Radio size="small" disabled={submitted} />}
                          label={
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="body2" color={color}>{opt}</Typography>
                              {submitted && isAnswer && (
                                <CheckCircleIcon color="success" fontSize="small" />
                              )}
                              {submitted && isPicked && !isAnswer && (
                                <CancelIcon color="error" fontSize="small" />
                              )}
                            </Stack>
                          }
                        />
                      );
                    })}
                  </RadioGroup>
                </FormControl>

                {!submitted ? (
                  <Button
                    variant="contained"
                    size="small"
                    disabled={!selected}
                    onClick={() => setSubmitted(true)}
                    sx={{ mt: 1.5 }}
                  >
                    Submit Answer
                  </Button>
                ) : (
                  <Alert severity={isCorrect ? "success" : "warning"} sx={{ mt: 1.5, borderRadius: 2 }}>
                    {isCorrect
                      ? "Correct! You got it."
                      : `Not quite — the correct answer is: "${content.quiz.answer}"`}
                  </Alert>
                )}
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
