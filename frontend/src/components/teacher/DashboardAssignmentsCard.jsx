import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
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
import AddIcon        from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import SectionCard from "../common/SectionCard";
import { API_BASE } from "../../apiBase";

const MODE_COLORS = { homework: "#6366f1", practice: "#22c55e", exam: "#ef4444" };

function ModeChip({ mode }) {
  const m     = (mode ?? "homework").toLowerCase();
  const color = MODE_COLORS[m] ?? MODE_COLORS.homework;
  const label = m.charAt(0).toUpperCase() + m.slice(1);
  return (
    <Chip
      label={label}
      size="small"
      sx={{ fontSize: 10, height: 16, bgcolor: color, color: "#fff", fontWeight: 700, px: 0.25 }}
    />
  );
}

function DueLabel({ dateStr }) {
  if (!dateStr) return <Typography variant="caption" color="text.secondary">—</Typography>;
  const d   = new Date(dateStr);
  const now = new Date();
  const diffMs   = d - now;
  const diffDays = Math.ceil(diffMs / 86_400_000);
  const overdue  = diffMs < 0;

  let label, color;
  if (overdue) {
    label = "Overdue";
    color = "error";
  } else if (diffDays <= 1) {
    label = "Due today";
    color = "warning";
  } else if (diffDays <= 3) {
    label = `Due in ${diffDays}d`;
    color = "warning";
  } else {
    label = d.toLocaleDateString([], { month: "short", day: "numeric" });
    color = "default";
  }

  return (
    <Chip
      label={label}
      size="small"
      color={color}
      variant={overdue ? "filled" : "outlined"}
      sx={{ fontSize: 11, height: 20 }}
    />
  );
}

export default function DashboardAssignmentsCard({ token, onCreateNew }) {
  const navigate = useNavigate();

  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/api/assignments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((body) => setAssignments(body.data ?? []))
      .catch((err) => console.error("Dashboard assignments fetch failed:", err))
      .finally(() => setLoading(false));
  }, [token]);

  // Show the 5 most recent assignments
  const recent = assignments.slice(0, 5);

  return (
    <SectionCard
      title="Assignments"
      action={
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={onCreateNew ?? (() => navigate("/assignments"))}
          >
            New
          </Button>
          <Button
            size="small"
            variant="outlined"
            endIcon={<ArrowForwardIcon />}
            onClick={() => navigate("/assignments")}
          >
            View All
          </Button>
        </Stack>
      }
    >
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={26} />
        </Box>
      ) : assignments.length === 0 ? (
        <Box sx={{ py: 4, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            No assignments yet.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => navigate("/assignments")}
          >
            Create your first assignment
          </Button>
        </Box>
      ) : (
        <>
          <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 12 }} align="center">Students</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 12 }} align="center">Due</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 12 }} align="center">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recent.map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 155 }}>
                          {a.title}
                        </Typography>
                        <ModeChip mode={a.mode} />
                      </Stack>
                      {a.problem?.title && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", maxWidth: 180 }}>
                          {a.problem.title}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell align="center">
                      <Typography variant="body2" fontWeight={600}>
                        {a.enrollments?.length ?? 0}
                      </Typography>
                    </TableCell>

                    <TableCell align="center">
                      <DueLabel dateStr={a.dueDate} />
                    </TableCell>

                    <TableCell align="center">
                      <Chip
                        label={a.isPublished ? "Published" : "Draft"}
                        size="small"
                        color={a.isPublished ? "success" : "default"}
                        variant={a.isPublished ? "filled" : "outlined"}
                        sx={{ fontSize: 11, height: 20 }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {assignments.length > 5 && (
            <Box sx={{ mt: 1.5, textAlign: "right" }}>
              <Typography
                variant="caption"
                color="primary"
                sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                onClick={() => navigate("/assignments")}
              >
                +{assignments.length - 5} more — view all
              </Typography>
            </Box>
          )}
        </>
      )}
    </SectionCard>
  );
}
