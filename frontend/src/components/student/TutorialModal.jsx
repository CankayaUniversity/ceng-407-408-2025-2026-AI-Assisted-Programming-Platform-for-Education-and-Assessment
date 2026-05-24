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
import CloseIcon            from "@mui/icons-material/Close";
import InfoOutlinedIcon     from "@mui/icons-material/InfoOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import Editor               from "@monaco-editor/react";
import DOMPurify            from "dompurify";
import { marked }           from "marked";
import { API_BASE }         from "../../apiBase";

/**
 * TutorialModal — renders a tutorial page.
 *
 * Supports two schemas for `content.sections[i]`:
 *
 *   OLD schema (legacy, monolithic):
 *     { heading, body: string, code: string }
 *
 *   NEW schema (block-based, mirrors w3schools structure):
 *     { heading, blocks: [
 *         { type: "text",       content: "..." },         // markdown
 *         { type: "code",       content: "..." },         // syntax-highlighted box
 *         { type: "syntax",     content: "..." },         // labeled "Syntax" box
 *         { type: "note",       content: "..." },         // yellow callout
 *         { type: "goodtoknow", content: "..." },         // blue callout
 *         { type: "list",       items:   [ "...", ... ] } // bullet list (markdown items)
 *     ] }
 *
 * Files migrate incrementally — sections with `blocks` use the new path,
 * sections with `body`/`code` fall back to the legacy path.
 */
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
  const monacoLang =
    { cpp: "cpp", csharp: "csharp", javascript: "javascript", python: "python", c: "c" }[language]
    ?? language ?? "c";

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
                  <Typography variant="h6" fontWeight={700} sx={{ mb: 1.25, fontSize: "1.05rem" }}>
                    {section.heading}
                  </Typography>
                )}

                {/* NEW schema: render the section's block list in order */}
                {Array.isArray(section.blocks) && section.blocks.length > 0 ? (
                  <Stack spacing={1.5}>
                    {section.blocks.map((block, bIdx) => (
                      <Block
                        key={bIdx}
                        block={block}
                        monacoLang={monacoLang}
                      />
                    ))}
                  </Stack>
                ) : (
                  // LEGACY schema fallback: body + trailing code
                  <>
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
                      <CodeBlock
                        code={section.code}
                        monacoLang={monacoLang}
                      />
                    )}
                  </>
                )}
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Block renderer ─────────────────────────────────────────────────────────

function Block({ block, monacoLang }) {
  switch (block?.type) {
    case "text":
      return <TextBlock content={block.content} />;
    case "code":
      return <CodeBlock code={block.content} monacoLang={monacoLang} />;
    case "syntax":
      return <CodeBlock code={block.content} monacoLang={monacoLang} syntaxLabel />;
    case "note":
      return <CalloutBlock content={block.content} variant="note" />;
    case "goodtoknow":
      return <CalloutBlock content={block.content} variant="goodtoknow" />;
    case "list":
      return <ListBlock items={block.items ?? []} />;
    default:
      // Unknown block type — render as plain text so the page doesn't break.
      return block?.content
        ? <TextBlock content={String(block.content)} />
        : null;
  }
}

// ── Text block (markdown — bold/italic/inline-code/links) ──────────────────
//
// We use `marked` + `DOMPurify` which are already shipped with the app
// (they're used by ProblemPage to render problem descriptions).

const inlineMarkdownToHtml = (text) => {
  if (!text) return "";
  const html = marked.parse(text, { breaks: true, gfm: true });
  return DOMPurify.sanitize(html);
};

function TextBlock({ content }) {
  return (
    <Box
      sx={{
        color: "text.secondary",
        lineHeight: 1.7,
        fontSize: "0.9rem",
        "& p":       { my: 0.5 },
        "& strong":  { color: "text.primary", fontWeight: 700 },
        "& em":      { fontStyle: "italic" },
        "& code":    {
          fontFamily: '"Fira Mono", "Cascadia Code", monospace',
          fontSize:   "0.85em",
          px:         0.5,
          py:         0.1,
          borderRadius: 0.5,
          bgcolor:    "action.hover",
          color:      "text.primary",
        },
        "& a": { color: "primary.main", textDecoration: "none" },
        "& a:hover": { textDecoration: "underline" },
      }}
      dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtml(content) }}
    />
  );
}

// ── Code block (Monaco read-only) ──────────────────────────────────────────

function CodeBlock({ code, monacoLang, syntaxLabel = false }) {
  const lineCount = (code ?? "").split("\n").length;
  const height    = `${Math.min(Math.max(lineCount * 20 + 20, 80), 360)}px`;

  return (
    <Box>
      {syntaxLabel && (
        <Typography
          variant="caption"
          sx={{
            display: "inline-block",
            mb: 0.5, px: 1, py: 0.25,
            borderRadius: 1,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          Syntax
        </Typography>
      )}
      <Box sx={{ borderRadius: 2, overflow: "hidden", border: 1, borderColor: "divider" }}>
        <Editor
          height={height}
          language={monacoLang}
          value={code ?? ""}
          theme="vs-dark"
          options={{
            readOnly:             true,
            minimap:              { enabled: false },
            fontSize:             13,
            lineNumbers:          "off",
            scrollBeyondLastLine: false,
            padding:              { top: 10, bottom: 10 },
            automaticLayout:      true,
            scrollbar:            { vertical: "hidden", horizontal: "auto" },
          }}
        />
      </Box>
    </Box>
  );
}

// ── Callout block (note / good-to-know) ────────────────────────────────────

function CalloutBlock({ content, variant }) {
  const isNote = variant === "note";
  return (
    <Alert
      severity={isNote ? "warning" : "info"}
      icon={isNote ? <InfoOutlinedIcon /> : <LightbulbOutlinedIcon />}
      sx={{
        borderRadius: 2,
        "& .MuiAlert-message": { width: "100%", py: 0.25 },
      }}
    >
      <Box
        sx={{
          lineHeight: 1.6,
          fontSize: "0.9rem",
          "& p":      { my: 0.25 },
          "& strong": { fontWeight: 700 },
          "& code":   {
            fontFamily: '"Fira Mono", "Cascadia Code", monospace',
            fontSize:   "0.85em",
            px:         0.5, py: 0.1,
            borderRadius: 0.5,
            bgcolor:    "rgba(0,0,0,0.08)",
          },
        }}
        dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtml(content) }}
      />
    </Alert>
  );
}

// ── List block (bullet list) ───────────────────────────────────────────────

function ListBlock({ items }) {
  return (
    <Box
      component="ul"
      sx={{
        my: 0.5,
        pl: 3,
        color: "text.secondary",
        lineHeight: 1.7,
        fontSize: "0.9rem",
        "& li":     { mb: 0.4 },
        "& strong": { color: "text.primary", fontWeight: 700 },
        "& code":   {
          fontFamily: '"Fira Mono", "Cascadia Code", monospace',
          fontSize:   "0.85em",
          px:         0.5, py: 0.1,
          borderRadius: 0.5,
          bgcolor:    "action.hover",
          color:      "text.primary",
        },
      }}
    >
      {items.map((item, i) => (
        <li
          key={i}
          dangerouslySetInnerHTML={{ __html: inlineMarkdownToHtml(item) }}
        />
      ))}
    </Box>
  );
}
