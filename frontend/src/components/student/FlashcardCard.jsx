/**
 * FlashcardCard.jsx
 *
 * Shared primitives for rendering a single AI feedback flashcard.
 * Used by both FlashcardModal (transient post-submission popup) and
 * FlashcardsPage (persistent library view).
 *
 * Exports:
 *   TYPE_CONFIG   — style/icon map keyed by card type
 *   FlashcardCard — standalone card component
 */

import {
  Box,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import ErrorOutlineIcon   from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon   from "@mui/icons-material/WarningAmber";
import TipsAndUpdatesIcon from "@mui/icons-material/TipsAndUpdates";

// ── Type config ───────────────────────────────────────────────────────────────

export const TYPE_CONFIG = {
  error: {
    label:  "Error",
    color:  "error",
    bg:     "#2d1212",
    border: "#b71c1c",
    icon:   <ErrorOutlineIcon fontSize="small" />,
    desc:   "Something that went wrong in a previous attempt.",
  },
  shortcoming: {
    label:  "Shortcoming",
    color:  "warning",
    bg:     "#2a1f00",
    border: "#f57f17",
    icon:   <WarningAmberIcon fontSize="small" />,
    desc:   "Works, but could be improved.",
  },
  improvement: {
    label:  "Improvement",
    color:  "info",
    bg:     "#0d1e2d",
    border: "#0288d1",
    icon:   <TipsAndUpdatesIcon fontSize="small" />,
    desc:   "A better approach compared to the reference.",
  },
};

// ── Code snippet block ────────────────────────────────────────────────────────

function CodeBlock({ label, code, bgColor = "#161b22" }) {
  if (!code) return null;
  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="caption" sx={{ color: "text.secondary", mb: 0.5, display: "block" }}>
        {label}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0, p: 1.5,
          borderRadius: 1,
          bgcolor: bgColor,
          fontSize: "0.78rem",
          fontFamily: "monospace",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        {code}
      </Box>
    </Box>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * FlashcardCard
 *
 * Props:
 *   card        FlashcardItem   — { type, title, body, codeSnippet? }
 *   problemBadge string|null    — optional "from: <Problem Title>" label
 *   minHeight   number          — override min card height (default 220)
 */
export default function FlashcardCard({ card, problemBadge = null, minHeight = 220 }) {
  const cfg = TYPE_CONFIG[card.type] ?? TYPE_CONFIG.improvement;

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: cfg.border,
        borderRadius: 2,
        bgcolor: cfg.bg,
        p: 2.5,
        minHeight,
      }}
    >
      {/* Problem badge (library view only) */}
      {problemBadge && (
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", display: "block", mb: 1, fontStyle: "italic" }}
        >
          {problemBadge}
        </Typography>
      )}

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Chip
          icon={cfg.icon}
          label={cfg.label}
          color={cfg.color}
          size="small"
          variant="outlined"
        />
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>
          {card.title}
        </Typography>
      </Stack>

      <Typography variant="body2" sx={{ color: "text.primary", lineHeight: 1.7 }}>
        {card.body}
      </Typography>

      {card.codeSnippet && (
        <Box sx={{ mt: 2 }}>
          <CodeBlock label="Before (problematic)" code={card.codeSnippet.bad}  bgColor="#1a0a0a" />
          <CodeBlock label="After (improved)"     code={card.codeSnippet.good} bgColor="#0a1a0a" />
        </Box>
      )}
    </Box>
  );
}
