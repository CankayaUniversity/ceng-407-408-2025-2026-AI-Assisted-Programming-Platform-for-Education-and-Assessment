/**
 * FlashcardCard.jsx
 *
 * Compact clickable preview card used in the library grid.
 * Shows: problem name → type badge + brief description.
 * Clicking opens FlashcardDetailDialog with full content.
 *
 * Exports:
 *   TYPE_CONFIG      — style/icon map keyed by card type
 *   FlashcardCard    — compact preview card (clickable)
 */

import { Box, Chip, Stack, Typography } from "@mui/material";
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
    hoverBg:"#3a1616",
    icon:   <ErrorOutlineIcon fontSize="small" />,
    desc:   "Something that went wrong in a previous attempt.",
  },
  shortcoming: {
    label:  "Shortcoming",
    color:  "warning",
    bg:     "#2a1f00",
    border: "#f57f17",
    hoverBg:"#342600",
    icon:   <WarningAmberIcon fontSize="small" />,
    desc:   "Works, but could be improved.",
  },
  improvement: {
    label:  "Improvement",
    color:  "info",
    bg:     "#0d1e2d",
    border: "#0288d1",
    hoverBg:"#102435",
    icon:   <TipsAndUpdatesIcon fontSize="small" />,
    desc:   "A better approach compared to the reference.",
  },
};

// ── Compact preview card ──────────────────────────────────────────────────────

/**
 * FlashcardCard — compact library preview.
 *
 * Props:
 *   card          FlashcardItem   — { type, title, concept, body, rootCause, codeSnippet? }
 *   problemTitle  string          — the problem this card belongs to
 *   onClick       () => void      — called when the card is clicked
 */
export default function FlashcardCard({ card, problemTitle, onClick }) {
  const cfg = TYPE_CONFIG[card.type] ?? TYPE_CONFIG.improvement;

  // Brief preview: use concept if available, else first ~100 chars of body
  const preview = card.concept
    ? card.concept
    : (card.body ?? "").slice(0, 100) + ((card.body ?? "").length > 100 ? "…" : "");

  return (
    <Box
      onClick={onClick}
      sx={{
        border: "1px solid",
        borderColor: cfg.border,
        borderRadius: 2,
        bgcolor: cfg.bg,
        p: 2,
        cursor: "pointer",
        transition: "background-color 0.15s, transform 0.1s, box-shadow 0.15s",
        "&:hover": {
          bgcolor: cfg.hoverBg,
          transform: "translateY(-2px)",
          boxShadow: `0 4px 16px ${cfg.border}44`,
        },
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {/* Problem name */}
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          color: "text.secondary",
          fontSize: "0.72rem",
          letterSpacing: 0.3,
          textTransform: "uppercase",
          display: "block",
        }}
      >
        {problemTitle}
      </Typography>

      {/* Type badge */}
      <Stack direction="row" alignItems="center" spacing={1}>
        <Chip
          icon={cfg.icon}
          label={cfg.label}
          color={cfg.color}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 600 }}
        />
      </Stack>

      {/* Title */}
      <Typography
        variant="body2"
        sx={{ fontWeight: 700, color: "text.primary", lineHeight: 1.4 }}
      >
        {card.title}
      </Typography>

      {/* Brief description — concept or first line of body */}
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", lineHeight: 1.5, flexGrow: 1 }}
      >
        {preview}
      </Typography>

      {/* "Click to read more" hint */}
      <Typography
        variant="caption"
        sx={{ color: cfg.border, opacity: 0.7, fontSize: "0.68rem", mt: 0.5 }}
      >
        Click to see full details →
      </Typography>
    </Box>
  );
}
