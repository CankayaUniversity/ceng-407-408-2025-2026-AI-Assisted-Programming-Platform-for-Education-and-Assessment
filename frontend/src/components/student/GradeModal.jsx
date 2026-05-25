/**
 * Student-facing grade detail dialog.
 *
 * Shown when a student clicks the "View grade" chip on a graded assignment.
 * Displays:
 *   • Total score (X / maxScore) prominently
 *   • Per-criterion breakdown joined against the rubric, so the student sees
 *     "Correctness: 32/40 — Off-by-one in the loop" rather than just "32"
 *   • Teacher feedback (free-text)
 *   • A small "AI-assisted" indicator if the teacher accepted an AI suggestion
 *
 * The data shape is whatever GET /api/grades/me/assignment/:id returned:
 *   {
 *     grade:    { score, maxScore, breakdown, feedback, aiSuggested, gradedAt },
 *     rubric:   { criteria: [{ name, maxScore, ... }] } | null,
 *     assignment: { id, title, problem: {...} } | null,
 *   }
 */

import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import CloseIcon       from "@mui/icons-material/Close";
import GradeIcon       from "@mui/icons-material/Grade";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

function colorForRatio(ratio) {
  if (ratio >= 0.85) return "success";
  if (ratio >= 0.6)  return "primary";
  if (ratio >= 0.4)  return "warning";
  return "error";
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function GradeModal({ open, onClose, data }) {
  const grade      = data?.grade      ?? null;
  const rubric     = data?.rubric     ?? null;
  const assignment = data?.assignment ?? null;

  // Normalize breakdown — it may be an array, an object {items: [...]}, or null
  let breakdown = [];
  if (Array.isArray(grade?.breakdown)) {
    breakdown = grade.breakdown;
  } else if (grade?.breakdown && typeof grade.breakdown === "object" && Array.isArray(grade.breakdown.items)) {
    breakdown = grade.breakdown.items;
  }

  // Normalize rubric criteria for the same reason (see RubricModal normalizer)
  let rubricCriteria = [];
  if (Array.isArray(rubric?.criteria)) {
    rubricCriteria = rubric.criteria;
  } else if (rubric?.criteria && typeof rubric.criteria === "object" && Array.isArray(rubric.criteria.items)) {
    rubricCriteria = rubric.criteria.items;
  }

  // Join breakdown rows to the rubric so we can show maxScore + criterion
  // description even when the breakdown only has {name, suggested}.
  const rows = breakdown.map((b) => {
    const matchingCriterion = rubricCriteria.find(
      (c) => c.name?.toLowerCase()?.trim() === b.name?.toLowerCase()?.trim(),
    );
    return {
      name:      b.name ?? matchingCriterion?.name ?? "Criterion",
      score:     typeof b.suggested === "number" ? b.suggested
                 : typeof b.score    === "number" ? b.score
                 : 0,
      maxScore:  b.maxScore ?? matchingCriterion?.maxScore ?? 0,
      comment:   b.comment ?? "",
    };
  });

  const totalScore = grade?.score    ?? 0;
  const maxTotal   = grade?.maxScore ?? 100;
  const ratio      = maxTotal > 0 ? totalScore / maxTotal : 0;
  const pctLabel   = `${Math.round(ratio * 100)}%`;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <GradeIcon color="primary" />
        <Box flex={1}>
          <Typography variant="h6" fontWeight={700}>Your Grade</Typography>
          {assignment?.title && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {assignment.title}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {!grade ? (
          <Alert severity="info">This assignment has not been graded yet.</Alert>
        ) : (
          <Stack spacing={3}>
            {/* ── Total score (headline) ─────────────────────────────────── */}
            <Box>
              <Stack direction="row" alignItems="baseline" spacing={1.5}>
                <Typography variant="h3" fontWeight={800} color={`${colorForRatio(ratio)}.main`}>
                  {totalScore}
                </Typography>
                <Typography variant="h5" color="text.secondary">
                  / {maxTotal}
                </Typography>
                <Chip
                  label={pctLabel}
                  color={colorForRatio(ratio)}
                  size="small"
                  sx={{ fontWeight: 700, ml: 1 }}
                />
                {grade.aiSuggested && (
                  <Chip
                    icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
                    label="AI-assisted"
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: 11 }}
                  />
                )}
              </Stack>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, ratio * 100)}
                color={colorForRatio(ratio)}
                sx={{ height: 8, borderRadius: 4, mt: 1.5 }}
              />
              {grade.gradedAt && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                  Graded on {formatDate(grade.gradedAt)}
                </Typography>
              )}
            </Box>

            {/* ── Per-criterion breakdown ────────────────────────────────── */}
            {rows.length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                  Breakdown
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                      <TableCell sx={{ fontWeight: 700 }}>Criterion</TableCell>
                      <TableCell sx={{ fontWeight: 700, width: 110 }} align="center">Score</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Comment</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row, idx) => {
                      const rowRatio = row.maxScore > 0 ? row.score / row.maxScore : 0;
                      return (
                        <TableRow key={idx}>
                          <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                          <TableCell align="center">
                            <Chip
                              label={`${row.score} / ${row.maxScore}`}
                              size="small"
                              color={colorForRatio(rowRatio)}
                              variant="outlined"
                              sx={{ fontWeight: 600, minWidth: 70 }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontSize: 13, color: "text.secondary", whiteSpace: "pre-wrap" }}>
                            {row.comment || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            )}

            {/* ── Teacher feedback ──────────────────────────────────────── */}
            {grade.feedback && (
              <Box>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                  Teacher Feedback
                </Typography>
                <Alert severity="info" icon={false} sx={{ whiteSpace: "pre-wrap" }}>
                  {grade.feedback}
                </Alert>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
