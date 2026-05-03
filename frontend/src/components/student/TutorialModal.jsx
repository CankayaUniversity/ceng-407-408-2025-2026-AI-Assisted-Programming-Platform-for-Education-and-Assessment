import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import Editor    from "@monaco-editor/react";
import { API_BASE } from "../../apiBase";

export default function TutorialModal({ open, onClose, tag, language, token }) {
  const [status,  setStatus]  = useState("loading"); // "loading" | "ready" | "unavailable" | "error"
  const [content, setContent] = useState(null);

  useEffect(() => {
    if (!open || !tag || !language || !token) return;
    setStatus("loading");
    setContent(null);

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

  // Monaco language mapping
  const monacoLang = { cpp: "cpp", csharp: "csharp", javascript: "javascript", python: "python", c: "c" }[language] ?? language ?? "c";

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
          <Typography variant="h6" fontWeight={700} sx={{ textTransform: "capitalize" }}>
            {(tag ?? "").replace(/-/g, " ")}
          </Typography>
          <Chip
            label={(language ?? "").toUpperCase()}
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

        {/* ── Not available ─────────────────────────────────────────────── */}
        {status === "unavailable" && (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography color="text.secondary" gutterBottom>
              No tutorial available for this topic yet.
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Ask your instructor to add a tutorial for "{tag}".
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
            {(content.sections ?? []).map((section, idx) => (
              <Box key={idx}>
                {section.heading && (
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.75 }}>
                    {section.heading}
                  </Typography>
                )}
                {section.body && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: section.code ? 1.5 : 0, lineHeight: 1.8, whiteSpace: "pre-wrap" }}
                  >
                    {section.body}
                  </Typography>
                )}
                {section.code && (
                  <Box sx={{ borderRadius: 2, overflow: "hidden", border: 1, borderColor: "divider" }}>
                    <Editor
                      height={`${Math.min(Math.max(section.code.split("\n").length * 20 + 20, 80), 300)}px`}
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
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
