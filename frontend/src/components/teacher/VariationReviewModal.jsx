import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon     from "@mui/icons-material/CancelOutlined";
import AutoAwesomeIcon        from "@mui/icons-material/AutoAwesome";
import { api } from "../../lib/api";

const TYPE_LABEL = { harder: "Harder", easier: "Easier", similar: "Similar" };
const TYPE_COLOR = { harder: "error", easier: "success", similar: "info" };

function difficultyColor(d = "") {
  const l = d.toLowerCase();
  if (l.includes("hard"))   return { bg: "#FEE2E2", fg: "#DC2626" };
  if (l.includes("medium")) return { bg: "#FEF3C7", fg: "#D97706" };
  return { bg: "#DCFCE7", fg: "#16A34A" };
}

/**
 * Variation Review Modal
 *
 * Flow:
 *  1. Opens → shows spinner, calls POST /api/variations/generate
 *  2. On success → teacher can read & edit the AI suggestion
 *  3. Approve → PATCH /api/variations/:id/approve  (creates a real Problem)
 *  4. Reject  → DELETE /api/variations/:id         (marks rejected, closes)
 */
export default function VariationReviewModal({
  open,
  onClose,
  sourceProblem,   // { id, title, difficulty, language }
  variationType,   // "harder" | "easier" | "similar"
  token,
  onApproved,      // callback after successful approve
}) {
  const [phase,       setPhase]       = useState("generating"); // generating | review | done | error
  const [variation,   setVariation]   = useState(null);
  const [editTitle,   setEditTitle]   = useState("");
  const [editDesc,    setEditDesc]    = useState("");
  const [editStarter, setEditStarter] = useState("");
  const [actionError, setActionError] = useState("");
  const [actioning,   setActioning]   = useState(false);

  // Called once the Dialog finishes its enter transition
  function handleEntered() {
    if (phase === "generating") generate();
  }

  async function generate() {
    setPhase("generating");
    setActionError("");
    try {
      const body = await api("/api/variations/generate", {
        method:    "POST",
        headers:   { Authorization: `Bearer ${token}` },
        timeoutMs: 130_000,
        body: JSON.stringify({ problemId: sourceProblem.id, type: variationType }),
      });
      const v = body.data;
      setVariation(v);
      setEditTitle(v.title);
      setEditDesc(v.description);
      setEditStarter(v.starterCode ?? "");
      setPhase("review");
    } catch (err) {
      setActionError(err.message);
      setPhase("error");
    }
  }

  async function handleApprove() {
    if (!variation) return;
    setActioning(true);
    setActionError("");
    try {
      await api(`/api/variations/${variation.id}/approve`, {
        method:  "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setPhase("done");
      onApproved?.();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActioning(false);
    }
  }

  async function handleReject() {
    if (!variation) return;
    setActioning(true);
    setActionError("");
    try {
      await api(`/api/variations/${variation.id}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      handleClose();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActioning(false);
    }
  }

  function handleClose() {
    onClose();
    // reset after the close animation finishes
    setTimeout(() => {
      setPhase("generating");
      setVariation(null);
      setEditTitle("");
      setEditDesc("");
      setEditStarter("");
      setActionError("");
      setActioning(false);
    }, 300);
  }

  const dc = difficultyColor(variation?.difficulty ?? "");

  return (
    <Dialog
      open={open}
      onClose={phase === "generating" ? undefined : handleClose}
      TransitionProps={{ onEntered: handleEntered }}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      {/* ── Title ──────────────────────────────────────────────────────── */}
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <AutoAwesomeIcon fontSize="small" color="primary" />
        AI Suggestion —{" "}
        <Chip
          label={TYPE_LABEL[variationType] ?? variationType}
          color={TYPE_COLOR[variationType] ?? "default"}
          size="small"
        />
        <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
          based on <em>{sourceProblem?.title}</em>
        </Typography>
      </DialogTitle>

      <Divider />

      {/* ── Content ────────────────────────────────────────────────────── */}
      <DialogContent sx={{ pt: 2.5 }}>

        {/* Generating… */}
        {phase === "generating" && (
          <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
            <CircularProgress size={48} />
            <Typography color="text.secondary">
              Generating {(TYPE_LABEL[variationType] ?? variationType).toLowerCase()} variation with AI…
            </Typography>
            <Typography variant="caption" color="text.secondary">
              This may take up to 30 seconds
            </Typography>
          </Stack>
        )}

        {/* Error */}
        {phase === "error" && (
          <Stack spacing={2} sx={{ py: 2 }}>
            <Alert severity="error">{actionError || "Generation failed. Please try again."}</Alert>
            <Button variant="outlined" onClick={generate} sx={{ alignSelf: "flex-start" }}>
              Retry
            </Button>
          </Stack>
        )}

        {/* Success / done */}
        {phase === "done" && (
          <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
            <CheckCircleOutlineIcon color="success" sx={{ fontSize: 56 }} />
            <Typography variant="h6">Problem added to Question Bank!</Typography>
            <Typography color="text.secondary" variant="body2" textAlign="center">
              The new problem is now visible in the Question Bank and can be further edited there.
            </Typography>
          </Stack>
        )}

        {/* Review & edit */}
        {phase === "review" && variation && (
          <Stack spacing={2.5}>
            {actionError && <Alert severity="error">{actionError}</Alert>}

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip
                label={variation.difficulty}
                size="small"
                sx={{ bgcolor: dc.bg, color: dc.fg, fontWeight: 700 }}
              />
              <Chip label={variation.language} size="small" variant="outlined" />
              <Typography variant="caption" color="text.secondary">
                You can edit the fields before approving
              </Typography>
            </Stack>

            <TextField
              label="Title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              fullWidth
            />

            <TextField
              label="Description"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              multiline
              minRows={6}
              fullWidth
            />

            <TextField
              label="Starter Code (optional)"
              value={editStarter}
              onChange={(e) => setEditStarter(e.target.value)}
              multiline
              minRows={3}
              fullWidth
              sx={{ "& textarea": { fontFamily: "monospace", fontSize: 13 } }}
            />
          </Stack>
        )}
      </DialogContent>

      <Divider />

      {/* ── Actions ────────────────────────────────────────────────────── */}
      <DialogActions sx={{ px: 3, py: 2 }}>
        {phase === "review" && (
          <>
            <Button
              variant="outlined"
              color="error"
              startIcon={<CancelOutlinedIcon />}
              onClick={handleReject}
              disabled={actioning}
            >
              Reject
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={handleClose} disabled={actioning}>Cancel</Button>
            <Button
              variant="contained"
              color="success"
              startIcon={actioning ? undefined : <CheckCircleOutlineIcon />}
              onClick={handleApprove}
              disabled={actioning || !editTitle.trim() || !editDesc.trim()}
            >
              {actioning ? "Approving…" : "Approve & Add to Bank"}
            </Button>
          </>
        )}

        {phase === "done" && (
          <Button variant="contained" onClick={handleClose}>Close</Button>
        )}

        {(phase === "error" || phase === "generating") && (
          <Button onClick={handleClose} disabled={phase === "generating"}>Cancel</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
