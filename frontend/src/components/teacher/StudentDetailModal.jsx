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
  if (direction === "declining") return <Chip label="Declining" size="small" color="error" variant="outlined" />;
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

export default function StudentDetailModal({ open, onClose, student, metrics, loading }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
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
            No data available for this student.
          </Typography>
        ) : (
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                Overview
              </Typography>
              <Box sx={{ p: 2, borderRadius: 2, bgcolor: "rgba(148,163,184,0.06)" }}>
                <MetricRow label="Total Attempts" value={metrics.attemptsCount} />
                <Divider sx={{ my: 0.5 }} />
                <MetricRow
                  label="Accepted Attempts"
                  value={metrics.solutionSuccess?.acceptedAttempts}
                />
                <Divider sx={{ my: 0.5 }} />
                <MetricRow
                  label="Public Pass Rate"
                  value={
                    metrics.solutionSuccess?.publicPassRate != null
                      ? `${(metrics.solutionSuccess.publicPassRate * 100).toFixed(1)}%`
                      : "-"
                  }
                />
                <Divider sx={{ my: 0.5 }} />
                <MetricRow
                  label="Hidden Pass Rate"
                  value={
                    metrics.solutionSuccess?.hiddenPassRate != null
                      ? `${(metrics.solutionSuccess.hiddenPassRate * 100).toFixed(1)}%`
                      : "-"
                  }
                />
                <Divider sx={{ my: 0.5 }} />
                <MetricRow label="Latest Status" value={metrics.solutionSuccess?.latestStatus} />
                <Divider sx={{ my: 0.5 }} />
                <MetricRow label="Total Hints Used" value={metrics.hintDependency?.totalHints} />
                <Divider sx={{ my: 0.5 }} />
                <MetricRow
                  label="Hint / Attempt Ratio"
                  value={
                    metrics.hintDependency?.hintToAttemptRatio != null
                      ? metrics.hintDependency.hintToAttemptRatio.toFixed(2)
                      : "-"
                  }
                />
              </Box>
            </Box>

            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                Learning Trend
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                {trendChip(metrics.learningTrend?.direction)}
                <Typography variant="body2" color="text.secondary">
                  Public improvement: {metrics.processQuality?.publicImprovement ?? 0} |
                  Hidden improvement: {metrics.processQuality?.hiddenImprovement ?? 0}
                </Typography>
              </Stack>
            </Box>

            {metrics.errorProfile && Object.keys(metrics.errorProfile).length > 0 && (
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  Error Profile
                </Typography>
                <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                        <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: "text.secondary" }} align="right">Count</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(metrics.errorProfile).map(([status, count]) => (
                        <TableRow key={status} hover>
                          <TableCell sx={{ textTransform: "capitalize" }}>{status}</TableCell>
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
