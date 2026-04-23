import { useEffect, useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import AccessTimeIcon  from "@mui/icons-material/AccessTime";
import WarningIcon     from "@mui/icons-material/Warning";
import { useNavigate } from "react-router-dom";

import AppLayout   from "../../components/layout/AppLayout";
import SectionCard from "../../components/common/SectionCard";
import { API_BASE } from "../../apiBase";

// ── Helpers ───────────────────────────────────────────────────────────────────

function difficultyColor(d) {
  const v = (d ?? "").toLowerCase();
  if (v.includes("hard"))   return "error";
  if (v.includes("medium")) return "warning";
  return "success";
}

function formatCountdown(dueDate, lateDeadline) {
  const now  = Date.now();
  const due  = dueDate   ? new Date(dueDate).getTime()   : null;
  const late = lateDeadline ? new Date(lateDeadline).getTime() : null;

  if (!due) return null;

  const msRemaining = due - now;

  if (msRemaining > 0) {
    // Still before due date
    const totalMins  = Math.floor(msRemaining / 60000);
    const days       = Math.floor(totalMins / 1440);
    const hours      = Math.floor((totalMins % 1440) / 60);
    const mins       = totalMins % 60;

    if (days > 1)  return { label: `${days}d ${hours}h left`,  status: "ok",  urgent: false };
    if (days === 1) return { label: `1d ${hours}h left`,        status: "ok",  urgent: false };
    if (hours > 1) return { label: `${hours}h ${mins}m left`,  status: "warn", urgent: true };
    if (totalMins > 0) return { label: `${totalMins}m left`,   status: "warn", urgent: true };
    return { label: "Due now", status: "warn", urgent: true };
  }

  // Past due date
  if (late && now < late) {
    const msLate   = late - now;
    const totalMins = Math.floor(msLate / 60000);
    const days      = Math.floor(totalMins / 1440);
    const hours     = Math.floor((totalMins % 1440) / 60);
    const label     = days > 0 ? `${days}d ${hours}h late window` : `${hours}h late window`;
    return { label, status: "late", urgent: true };
  }

  if (late && now >= late) return { label: "Closed",  status: "closed", urgent: false };
  return                         { label: "Overdue",  status: "closed", urgent: false };
}

function DeadlineCell({ assignment }) {
  if (!assignment.dueDate) {
    return <Typography variant="body2" color="text.secondary">No deadline</Typography>;
  }

  const dueStr  = new Date(assignment.dueDate).toLocaleDateString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const countdown = formatCountdown(assignment.dueDate, assignment.lateDeadline);

  const colorMap = { ok: "success", warn: "warning", late: "warning", closed: "error" };
  const color    = countdown ? colorMap[countdown.status] ?? "default" : "default";

  return (
    <Stack spacing={0.25}>
      <Typography variant="body2">{dueStr}</Typography>
      {countdown && (
        <Chip
          icon={countdown.status === "closed" ? <WarningIcon /> : <AccessTimeIcon />}
          label={countdown.label}
          size="small"
          color={color}
          variant={countdown.status === "late" ? "filled" : "outlined"}
          sx={{ width: "fit-content", fontSize: 11 }}
        />
      )}
      {countdown?.status === "late" && assignment.lateDeduction > 0 && (
        <Typography variant="caption" color="warning.main">
          −{assignment.lateDeduction}% deduction applies
        </Typography>
      )}
    </Stack>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssignmentsPage({ currentUser, token, handleLogout, navItems }) {
  const navigate = useNavigate();
  const [assignments,  setAssignments]  = useState([]);
  const [submissions,  setSubmissions]  = useState([]);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

    Promise.all([
      fetch(`${API_BASE}/api/assignments`,      { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/api/student/history`,  { headers }).then((r) => r.json()),
    ])
      .then(([assignRes, subRes]) => {
        setAssignments(assignRes?.data ?? []);
        setSubmissions(subRes?.data    ?? []);
      })
      .catch((err) => console.error("AssignmentsPage fetch failed:", err))
      .finally(() => setLoading(false));
  }, [token]);

  const solvedSet = new Set(
    submissions
      .filter((s) => s.normalizedStatus === "accepted" || s.allPassed === true)
      .map((s) => s.problemId),
  );

  const total    = assignments.length;
  const solved   = assignments.filter((a) => solvedSet.has(a.problem?.id)).length;
  const progress = total > 0 ? (solved / total) * 100 : 0;

  return (
    <AppLayout
      title="AI Mentor"
      roleLabel="Student"
      userLabel={currentUser?.name || currentUser?.email}
      onLogout={handleLogout}
      navItems={navItems}
      maxWidth="lg"
      showPageTitle={false}
    >
      <SectionCard title="Assignments">
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Your enrolled assignments. Click a row to start working.
        </Typography>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : assignments.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
            No assignments available yet.
          </Typography>
        ) : (
          <>
            <Box sx={{ mb: 2 }}>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ height: 10, borderRadius: 5 }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {solved} / {total} completed
              </Typography>
            </Box>

            <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                    <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Difficulty</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Languages</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Deadline</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {assignments.map((a, idx) => {
                    const problem    = a.problem ?? {};
                    const solved     = solvedSet.has(problem.id);
                    const langs      = a.allowedLanguages ?? [];
                    const isLate     = (() => {
                      if (!a.dueDate) return false;
                      const now = Date.now();
                      return now > new Date(a.dueDate).getTime() &&
                        (!a.lateDeadline || now < new Date(a.lateDeadline).getTime());
                    })();

                    return (
                      <TableRow
                        key={a.id}
                        hover
                        onClick={() =>
                          navigate(`/problem/${problem.id}`, {
                            state: {
                              assignmentId:     a.id,
                              allowedLanguages: langs,
                              lateDeduction:    isLate ? (a.lateDeduction ?? 0) : 0,
                            },
                          })
                        }
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell>{idx + 1}</TableCell>

                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{a.title}</Typography>
                          {problem.title && a.title !== problem.title && (
                            <Typography variant="caption" color="text.secondary">
                              {problem.title}
                            </Typography>
                          )}
                        </TableCell>

                        <TableCell>
                          <Chip
                            label={problem.difficulty ?? "N/A"}
                            size="small"
                            color={difficultyColor(problem.difficulty)}
                            variant="outlined"
                          />
                        </TableCell>

                        <TableCell>
                          {langs.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">Any</Typography>
                          ) : (
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                              {langs.map((l) => (
                                <Chip key={l} label={l} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                              ))}
                            </Stack>
                          )}
                        </TableCell>

                        <TableCell>
                          <DeadlineCell assignment={a} />
                        </TableCell>

                        <TableCell>
                          {isLate ? (
                            <Tooltip title={a.lateDeduction > 0 ? `${a.lateDeduction}% deduction` : "No deduction"}>
                              <Chip label="Late" size="small" color="warning" variant="filled" />
                            </Tooltip>
                          ) : (
                            <Chip
                              label={solved ? "Solved" : "Not solved"}
                              size="small"
                              color={solved ? "success" : "default"}
                              variant={solved ? "filled" : "outlined"}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </SectionCard>
    </AppLayout>
  );
}
