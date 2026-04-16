import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

function trendChip(direction) {
  if (direction === "improving") return <Chip label="Improving" size="small" color="success" variant="outlined" />;
  if (direction === "declining") return <Chip label="Declining"  size="small" color="error"   variant="outlined" />;
  return <Chip label="Stable" size="small" variant="outlined" />;
}

function MetricRow({ label, value }) {
  return (
    <Stack direction="row" justifyContent="space-between" sx={{ py: 0.75 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{value ?? "-"}</Typography>
    </Stack>
  );
}

function fmtMs(ms) {
  if (ms == null) return "-";
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

/** Map raw normalizedStatus keys to readable labels */
function labelStatus(key) {
  const map = {
    accepted:             "Accepted",
    wrong_answer:         "Wrong Answer",
    runtime_error:        "Runtime Error",
    compile_error:        "Compile Error",
    syntax_error:         "Syntax Error",
    time_limit_exceeded:  "Time Limit",
    memory_limit_exceeded:"Memory Limit",
    internal_error:       "Internal Error",
    unknown:              "Unknown",
  };
  return map[key] ?? key;
}

function statusChip(status) {
  const color =
    status === "accepted"     ? "success" :
    status === "wrong_answer" ? "warning" :
    ["runtime_error", "compile_error", "syntax_error"].includes(status) ? "error" :
    "default";
  return (
    <Chip
      label={labelStatus(status)}
      size="small"
      color={color}
      variant="outlined"
      sx={{ textTransform: "none" }}
    />
  );
}

export default function StudentDetailModal({ open, onClose, student, metrics, loading }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {student?.name ?? "Student Detail"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {student?.email}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : !metrics ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
            No activity recorded for this student yet.
          </Typography>
        ) : (
          <Stack spacing={3}>

            {/* ── Overview ─────────────────────────────────────────────── */}
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                Overview
              </Typography>
              <Box sx={{ p: 2, borderRadius: 2, bgcolor: "rgba(148,163,184,0.06)" }}>
                <MetricRow label="Total Attempts"      value={metrics.attemptsCount} />
                <Divider sx={{ my: 0.5 }} />
                <MetricRow label="Accepted Attempts"   value={metrics.solutionSuccess?.acceptedAttempts} />
                <Divider sx={{ my: 0.5 }} />
                <MetricRow
                  label="Success Rate"
                  value={
                    metrics.solutionSuccess?.successRate != null
                      ? `${(metrics.solutionSuccess.successRate * 100).toFixed(1)}%`
                      : "-"
                  }
                />
                <Divider sx={{ my: 0.5 }} />
                <MetricRow
                  label="Problems Solved"
                  value={metrics.solutionSuccess?.distinctProblemsSolved ?? "-"}
                />
                <Divider sx={{ my: 0.5 }} />
                <MetricRow
                  label="Time to First Solution"
                  value={fmtMs(metrics.processQuality?.timeToFirstAcceptedMs)}
                />
                <Divider sx={{ my: 0.5 }} />
                <MetricRow label="Hints Used"          value={metrics.hintDependency?.totalHints} />
                <Divider sx={{ my: 0.5 }} />
                <MetricRow
                  label="Hints per Attempt"
                  value={
                    metrics.hintDependency?.hintToAttemptRatio != null
                      ? metrics.hintDependency.hintToAttemptRatio.toFixed(2)
                      : "-"
                  }
                />
                <Divider sx={{ my: 0.5 }} />
                <Stack direction="row" justifyContent="space-between" sx={{ py: 0.75 }}>
                  <Typography variant="body2" color="text.secondary">Latest Status</Typography>
                  {metrics.solutionSuccess?.latestStatus
                    ? statusChip(metrics.solutionSuccess.latestStatus)
                    : <Typography variant="body2" sx={{ fontWeight: 600 }}>-</Typography>
                  }
                </Stack>
              </Box>
            </Box>

            {/* ── Learning Trend ────────────────────────────────────────── */}
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                Learning Trend
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center">
                {trendChip(metrics.learningTrend?.direction)}
                <Typography variant="body2" color="text.secondary">
                  {metrics.attemptsCount < 4
                    ? "Not enough attempts yet to determine a trend."
                    : metrics.learningTrend?.direction === "improving"
                      ? "Acceptance rate is rising over recent attempts."
                      : metrics.learningTrend?.direction === "declining"
                        ? "Acceptance rate has dropped in recent attempts."
                        : "Acceptance rate is consistent across attempts."}
                </Typography>
              </Stack>
            </Box>

            {/* ── Error Profile ─────────────────────────────────────────── */}
            {metrics.errorProfile && Object.keys(metrics.errorProfile).length > 0 && (
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  Submission Breakdown
                </Typography>
                <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                        <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Result</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: "text.secondary" }} align="right">Count</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(metrics.errorProfile)
                        .sort((a, b) => Number(b[1]) - Number(a[1]))
                        .map(([status, count]) => (
                          <TableRow key={status} hover>
                            <TableCell>{labelStatus(status)}</TableCell>
                            <TableCell align="right">{count}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
