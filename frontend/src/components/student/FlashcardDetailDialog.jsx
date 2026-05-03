/**
 * FlashcardDetailDialog.jsx
 *
 * Full-detail modal that opens when a student clicks a flashcard in the library.
 *
 * Shows:
 *   - Problem name + card type badge
 *   - Title (large)
 *   - Concept tag
 *   - Full body text
 *   - Root cause explanation
 *   - Before / After code snippets (if present)
 */

import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon          from "@mui/icons-material/Close";
import LightbulbIcon      from "@mui/icons-material/Lightbulb";
import PsychologyIcon     from "@mui/icons-material/Psychology";
import { TYPE_CONFIG }    from "./FlashcardCard";

// ── Code block ────────────────────────────────────────────────────────────────

function CodeBlock({ label, code, bgColor }) {
  if (!code) return null;
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", fontWeight: 600, display: "block", mb: 0.5 }}
      >
        {label}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0, p: 1.5,
          borderRadius: 1.5,
          bgcolor: bgColor,
          fontSize: "0.82rem",
          fontFamily: "monospace",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          border: "1px solid",
          borderColor: "divider",
          lineHeight: 1.6,
        }}
      >
        {code}
      </Box>
    </Box>
  );
}

// ── Info row ──────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, children }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Box sx={{ color: "text.disabled", mt: 0.2, flexShrink: 0 }}>{icon}</Box>
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 600, display: "block" }}>
          {label}
        </Typography>
        {children}
      </Box>
    </Stack>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * FlashcardDetailDialog
 *
 * Props:
 *   open         boolean
 *   onClose      () => void
 *   card         FlashcardItem | null  — { type, title, concept, body, rootCause, codeSnippet? }
 *   problemTitle string | null
 */
export default function FlashcardDetailDialog({ open, onClose, card, problemTitle }) {
  if (!card) return null;

  const cfg = TYPE_CONFIG[card.type] ?? TYPE_CONFIG.improvement;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: cfg.border,
          borderRadius: 3,
        },
      }}
    >
      {/* ── Title bar ──────────────────────────────────────────────────────── */}
      <DialogTitle
        sx={{
          bgcolor: cfg.bg,
          borderBottom: "1px solid",
          borderColor: cfg.border + "66",
          pb: 1.5,
        }}
      >
        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
          {/* Type badge + problem name */}
          <Box sx={{ flexGrow: 1 }}>
            {problemTitle && (
              <Typography
                variant="caption"
                sx={{
                  color: "text.disabled",
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  fontSize: "0.7rem",
                  display: "block",
                  mb: 0.75,
                }}
              >
                {problemTitle}
              </Typography>
            )}
            <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
              <Chip
                icon={cfg.icon}
                label={cfg.label}
                color={cfg.color}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
              {card.concept && (
                <Chip
                  label={card.concept}
                  size="small"
                  variant="outlined"
                  sx={{ color: "text.secondary", borderColor: "divider", fontSize: "0.72rem" }}
                />
              )}
            </Stack>
          </Box>

          <IconButton onClick={onClose} size="small" sx={{ color: "text.secondary", mt: -0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <DialogContent sx={{ pt: 3, pb: 3 }}>
        <Stack spacing={2.5}>

          {/* Card title */}
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
            {card.title}
          </Typography>

          <Divider />

          {/* Full body */}
          <Typography
            variant="body1"
            sx={{ color: "text.primary", lineHeight: 1.8, whiteSpace: "pre-wrap" }}
          >
            {card.body}
          </Typography>

          {/* Root cause */}
          {card.rootCause && (
            <InfoRow icon={<PsychologyIcon fontSize="small" />} label="Why this happens">
              <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.7 }}>
                {card.rootCause}
              </Typography>
            </InfoRow>
          )}

          {/* Code snippets */}
          {card.codeSnippet && (card.codeSnippet.bad || card.codeSnippet.good) && (
            <>
              <Divider />
              <InfoRow icon={<LightbulbIcon fontSize="small" />} label="Code comparison">
                <Box>
                  <CodeBlock
                    label="Problematic code"
                    code={card.codeSnippet.bad}
                    bgColor="#1a0a0a"
                  />
                  <CodeBlock
                    label="Improved version"
                    code={card.codeSnippet.good}
                    bgColor="#0a1a0a"
                  />
                </Box>
              </InfoRow>
            </>
          )}

        </Stack>
      </DialogContent>
    </Dialog>
  );
}
