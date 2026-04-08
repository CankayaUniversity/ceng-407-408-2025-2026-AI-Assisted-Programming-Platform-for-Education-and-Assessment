import {
  Box,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import SectionCard from "../common/SectionCard";

function statusColor(status) {
  const s = (status ?? "").toLowerCase();
  if (s === "accepted" || s === "pass") return "success";
  if (s.includes("error") || s === "fail") return "error";
  return "default";
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SubmissionHistory({ submissions, loading }) {
  return (
    <SectionCard title="Submission History">
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={28} />
        </Box>
      ) : submissions.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
          No submissions yet for this problem.
        </Typography>
      ) : (
        <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "rgba(148, 163, 184, 0.08)" }}>
                <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Language</TableCell>
                <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Time</TableCell>
                <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {submissions.map((sub, idx) => (
                <TableRow key={sub.id} hover>
                  <TableCell>{submissions.length - idx}</TableCell>
                  <TableCell>
                    <Chip
                      label={sub.status}
                      size="small"
                      color={statusColor(sub.status)}
                      variant="outlined"
                      sx={{ fontWeight: 600, textTransform: "capitalize" }}
                    />
                  </TableCell>
                  <TableCell>{sub.language ?? "-"}</TableCell>
                  <TableCell>
                    {sub.executionTime != null ? `${sub.executionTime.toFixed(0)} ms` : "-"}
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: 13 }}>
                    {formatDate(sub.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionCard>
  );
}
