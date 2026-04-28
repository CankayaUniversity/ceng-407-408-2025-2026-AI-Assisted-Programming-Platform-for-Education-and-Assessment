/**
 * FlashcardModal.jsx
 *
 * Shows AI-generated feedback flashcards after a correct submission.
 * Cards are categorised as: error | shortcoming | improvement
 *
 * Props:
 *   open        boolean   — whether the modal is visible
 *   onClose     fn        — close handler
 *   cards       array     — FlashcardItem[]
 */

import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon          from "@mui/icons-material/Close";
import ErrorOutlineIcon   from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon   from "@mui/icons-material/WarningAmber";
import TipsAndUpdatesIcon from "@mui/icons-material/TipsAndUpdates";
import ArrowBackIcon      from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon   from "@mui/icons-material/ArrowForward";
import { useState } from "react";

// ── Card type config ──────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  error: {
    label: "Error",
    color: "error",
    bg:    "#2d1212",
    border:"#b71c1c",
    icon:  <ErrorOutlineIcon fontSize="small" />,
    desc:  "Something that went wrong in a previous attempt.",
  },
  shortcoming: {
    label: "Shortcoming",
    color: "warning",
    bg:    "#2a1f00",
    border:"#f57f17",
    icon:  <WarningAmberIcon fontSize="small" />,
    desc:  "Works, but could be improved.",
  },
  improvement: {
    label: "Improvement",
    color: "info",
    bg:    "#0d1e2d",
    border:"#0288d1",
    icon:  <TipsAndUpdatesIcon fontSize="small" />,
    desc:  "A better approach compared to the reference.",
  },
};

// ── CodeBlock ─────────────────────────────────────────────────────────────────
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
          m: 0,
          p: 1.5,
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

// ── Single card view ──────────────────────────────────────────────────────────
function SingleCard({ card }) {
  const cfg = TYPE_CONFIG[card.type] ?? TYPE_CONFIG.improvement;

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: cfg.border,
        borderRadius: 2,
        bgcolor: cfg.bg,
        p: 2.5,
        minHeight: 220,
      }}
    >
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

// ── Main modal ────────────────────────────────────────────────────────────────
export default function FlashcardModal({ open, onClose, cards = [] }) {
  const [index, setIndex] = useState(0);

  if (!cards.length) return null;

  const card  = cards[index];
  const total = cards.length;

  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(total - 1, i + 1));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { bgcolor: "#0d1117", color: "text.primary" } }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", pr: 1 }}>
        <TipsAndUpdatesIcon sx={{ mr: 1, color: "primary.light" }} />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" component="span">
            Feedback Cards
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }} component="span">
            — review what you learned
          </Typography>
        </Box>
        <Tooltip title="Close">
          <IconButton onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 2, pb: 3 }}>
        {/* Card */}
        <SingleCard card={card} />

        {/* Navigation */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mt: 2 }}
        >
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={prev}
            disabled={index === 0}
            size="small"
          >
            Previous
          </Button>

          {/* Dot indicators */}
          <Stack direction="row" spacing={0.5} alignItems="center">
            {cards.map((_, i) => {
              const cfg = TYPE_CONFIG[cards[i].type] ?? TYPE_CONFIG.improvement;
              return (
                <Tooltip key={i} title={`${i + 1}: ${cards[i].title}`}>
                  <Box
                    onClick={() => setIndex(i)}
                    sx={{
                      width:  i === index ? 10 : 8,
                      height: i === index ? 10 : 8,
                      borderRadius: "50%",
                      bgcolor: i === index ? cfg.border : "grey.700",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  />
                </Tooltip>
              );
            })}
          </Stack>

          <Button
            endIcon={<ArrowForwardIcon />}
            onClick={next}
            disabled={index === total - 1}
            size="small"
          >
            Next
          </Button>
        </Stack>

        <Typography
          variant="caption"
          color="text.secondary"
          align="center"
          display="block"
          sx={{ mt: 1 }}
        >
          {index + 1} / {total}
        </Typography>
      </DialogContent>
    </Dialog>
  );
}
