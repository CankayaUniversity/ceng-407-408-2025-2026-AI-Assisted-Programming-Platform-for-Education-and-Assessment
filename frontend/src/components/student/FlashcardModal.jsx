/**
 * FlashcardModal.jsx
 *
 * Shows AI-generated feedback flashcards after a correct submission.
 * Card rendering is delegated to FlashcardCard (shared with FlashcardsPage).
 *
 * Props:
 *   open    boolean        — whether the modal is visible
 *   onClose fn             — close handler
 *   cards   FlashcardItem[] — array of cards to show
 */

import {
  Box,
  Button,
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
import TipsAndUpdatesIcon from "@mui/icons-material/TipsAndUpdates";
import ArrowBackIcon      from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon   from "@mui/icons-material/ArrowForward";
import { useState } from "react";

import FlashcardCard, { TYPE_CONFIG } from "./FlashcardCard";

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
        <FlashcardCard card={card} />

        {/* Navigation */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mt: 2 }}
        >
          <Button startIcon={<ArrowBackIcon />} onClick={prev} disabled={index === 0} size="small">
            Previous
          </Button>

          {/* Dot indicators */}
          <Stack direction="row" spacing={0.5} alignItems="center">
            {cards.map((c, i) => {
              const cfg = TYPE_CONFIG[c.type] ?? TYPE_CONFIG.improvement;
              return (
                <Tooltip key={i} title={`${i + 1}: ${c.title}`}>
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

          <Button endIcon={<ArrowForwardIcon />} onClick={next} disabled={index === total - 1} size="small">
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
