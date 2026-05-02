/**
 * ProblemErrorAnalyticsModal.jsx
 *
 * Teacher-facing drill-down for cross-submission error analysis of a single problem.
 * Opened from ClassAnalyticsPage by clicking a problem row.
 *
 * Fetches GET /api/teacher/problems/:id/analytics and shows:
 *   - Summary stat row (total attempts, accept rate, solved/total students)
 *   - Error type breakdown — horizontal bar chart + chip list
 *   - Per-student table (struggling students first)
 *   - Daily submission volume mini-chart
 */
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
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
import CloseIcon      from "@mui/icons-material/Close";
import WarningIcon    from "@mui/icons-material/Warning";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ResponsiveContainer, Cell,
} from "recharts";

import { API_BASE } from "../../apiBase";

// ── Constants ─────────────────────────────────────────────────────────────────

const ERROR_COLORS = {
  wrong_answer:          "#ef4444",
  compile_error:         "#f97316",
  runtime_error:         "#eab308",
  time_limit_exceeded:   "#a855f7",
  memory_limit_exceeded: "#06b6d4",
  syntax_error:          "#ec4899",
  internal_error:        "#6b7280",
};
const DIFF_COLOR = { Easy: "#22c55e", Medium: "#f59e0b", Hard: "#ef4444" };

function errorLabel(key) {
  return (key ?? "unknown").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusChipColor(status) {
  if (status === "accepted") return "success";
  if (status?.includes("error") || status === "compile_error") return "error";
  if (status === "wrong_answer") return "warning";
  return "default";
}

// ── Stat box ──────────────────────────────────────────────────────────────────

function StatBox({ label, value, color = "text.primary", sub }) {
  return (
    <Box sx={{
      flex: 1, minWidth: 100, textAlign: "center", py: 1.5, px: 1,
      borderRadius: 2, bgcolor: "rgba(148,163,184,0.05)",
      border: "1px solid", borderColor: "divider",
    }}>
      <Typography variant="h5" sx={{ fontWeight: 700, color }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      {sub && <Typography variant="caption" color="text.disabled" sx={{ display: "block" }}>{sub}</Typography>}
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProblemErrorAnalyticsModal({ open, onClose, problem, token }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!open || !problem?.id || !token) return;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`${API_BASE}/api/teacher/problems/${problem.id}/analytics`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then((r) => r.json())
      .then((body) => {
        if (body.error) throw new Error(body.error);
        setData(body.data ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, problem?.id, token]);

  const analytics     = data?.analytics     ?? {};
  const perStudent    = analytics.perStudent ?? [];
  const errorProfile  = analytics.errorProfile ?? {};
  const dailyVolume   = analytics.dailyVolume  ?? [];

  // Build sorted error chart data
  const errorChartData = Object.entries(errorProfile)
    .sort(([, a], [, b]) => b - a)
    .map(([key, count]) => ({
      name:  errorLabel(key),
      count,
      color: ERROR_COLORS[key] ?? "#6b7280",
      key,
    }));

  const strugglingStudents = perStudent.filter((s) => !s.accepted && s.totalAttempts >= 2);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      scroll="paper"
      PaperProps={{ sx: { bgcolor: "#0f172a", backgroundImage: "none" } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Error Analysis — {data?.problem?.title ?? problem?.title ?? "…"}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              {(data?.problem?.difficulty ?? problem?.difficulty) && (
                <Chip
                  label={data?.problem?.difficulty ?? problem?.difficulty}
                  size="small"
                  variant="outlined"
                  sx={{
                    color: DIFF_COLOR[data?.problem?.difficulty ?? problem?.difficulty] ?? "text.secondary",
                    borderColor: DIFF_COLOR[data?.problem?.difficulty ?? problem?.difficulty] ?? "divider",
                    fontSize: 10,
                  }}
                />
              )}
              {(data?.problem?.language ?? problem?.language) && (
                <Chip label={data?.problem?.language ?? problem?.language} size="small" variant="outlined" sx={{ fontSize: 10 }} />
              )}
            </Stack>
          </Box>
          <IconButton onClick={onClose} size="small" sx={{ mt: 0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && data && (
          <Stack spacing={3}>

            {/* ── Summary stat row ──────────────────────────────────────── */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} flexWrap="wrap">
              <StatBox label="Total Submissions"  value={analytics.totalAttempts ?? 0} />
              <StatBox label="Accepted"           value={analytics.acceptedAttempts ?? 0} color="#22c55e" />
              <StatBox
                label="Accept Rate"
                value={`${analytics.acceptRate ?? 0}%`}
                color={
                  (analytics.acceptRate ?? 0) >= 60 ? "#22c55e"
                  : (analytics.acceptRate ?? 0) >= 30 ? "#f59e0b" : "#ef4444"
                }
              />
              <StatBox
                label="Students Solved"
                value={`${analytics.solvedStudents ?? 0} / ${analytics.distinctStudents ?? 0}`}
                color="#6366f1"
              />
              <StatBox label="AI Hints Used"    value={analytics.totalHints ?? 0} color="#a78bfa" />
            </Stack>

            {/* ── Error type breakdown ───────────────────────────────────── */}
            {errorChartData.length > 0 ? (
              <Box>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                  Error Type Breakdown
                </Typography>

                {/* Horizontal bar chart */}
                <ResponsiveContainer width="100%" height={Math.max(80, errorChartData.length * 40)}>
                  <BarChart
                    data={errorChartData}
                    layout="vertical"
                    margin={{ top: 0, right: 20, left: 130, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      width={125}
                    />
                    <RechartTooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                      formatter={(v, _n, props) => [`${v} submissions`, props.payload.name]}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                      {errorChartData.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Chip list with counts */}
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                  {errorChartData.map(({ key, count, color }) => (
                    <Chip
                      key={key}
                      label={`${errorLabel(key)} ×${count}`}
                      size="small"
                      sx={{
                        fontSize: 11,
                        bgcolor: color + "22",
                        color,
                        border: `1px solid ${color}44`,
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            ) : (
              <Box sx={{ py: 2, textAlign: "center" }}>
                <CheckCircleIcon sx={{ color: "#22c55e", fontSize: 28, mb: 0.5 }} />
                <Typography variant="body2" color="text.secondary">
                  No errors recorded — all attempts were accepted.
                </Typography>
              </Box>
            )}

            {/* ── Struggling students alert ─────────────────────────────── */}
            {strugglingStudents.length > 0 && (
              <Alert
                severity="warning"
                icon={<WarningIcon />}
                sx={{ "& .MuiAlert-message": { width: "100%" } }}
              >
                <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
                  {strugglingStudents.length} student{strugglingStudents.length > 1 ? "s" : ""} with multiple failures and no accepted submission
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {strugglingStudents.map((s) => (
                    <Chip
                      key={s.studentId}
                      label={`${s.name} (${s.totalAttempts} tries)`}
                      size="small"
                      color="warning"
                      variant="outlined"
                      sx={{ fontSize: 11 }}
                    />
                  ))}
                </Stack>
              </Alert>
            )}

            <Divider />

            {/* ── Per-student table ─────────────────────────────────────── */}
            {perStudent.length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                  Per-Student Breakdown
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    Struggling students shown first
                  </Typography>
                </Typography>
                <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                        <TableCell sx={{ fontWeight: 700 }}>Student</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">Status</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">Attempts</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">Hints</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Error Profile</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {perStudent.map((s) => {
                        const topErrors = Object.entries(s.errorCounts ?? {})
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 3);
                        return (
                          <TableRow
                            key={s.studentId}
                            sx={{
                              bgcolor: !s.accepted && s.totalAttempts >= 3
                                ? "rgba(239,68,68,0.04)"
                                : "transparent",
                            }}
                          >
                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>{s.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{s.email}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={s.accepted ? "Solved" : errorLabel(s.lastStatus)}
                                size="small"
                                color={s.accepted ? "success" : statusChipColor(s.lastStatus)}
                                variant={s.accepted ? "filled" : "outlined"}
                                sx={{ fontWeight: 600, fontSize: 10 }}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Typography
                                variant="body2"
                                fontWeight={700}
                                color={s.totalAttempts >= 5 && !s.accepted ? "error.main" : "text.primary"}
                              >
                                {s.totalAttempts}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Typography variant="body2" color={s.hintsUsed > 0 ? "secondary.main" : "text.secondary"}>
                                {s.hintsUsed}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {topErrors.length === 0 ? (
                                <Typography variant="caption" color="text.disabled">—</Typography>
                              ) : (
                                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                  {topErrors.map(([key, cnt]) => (
                                    <Tooltip key={key} title={errorLabel(key)}>
                                      <Chip
                                        label={`${errorLabel(key)} ×${cnt}`}
                                        size="small"
                                        sx={{
                                          fontSize: 10,
                                          bgcolor: (ERROR_COLORS[key] ?? "#6b7280") + "22",
                                          color:   ERROR_COLORS[key] ?? "text.secondary",
                                          border: `1px solid ${(ERROR_COLORS[key] ?? "#6b7280")}44`,
                                        }}
                                      />
                                    </Tooltip>
                                  ))}
                                </Stack>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* ── Daily submission volume ───────────────────────────────── */}
            {dailyVolume.length > 1 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                  Daily Submission Volume
                </Typography>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={dailyVolume} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} allowDecimals={false} />
                    <RechartTooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                      labelFormatter={(v) => new Date(v).toLocaleDateString()}
                    />
                    <Bar dataKey="total"    name="Total"    fill="#334155" radius={[3,3,0,0]} maxBarSize={20} />
                    <Bar dataKey="accepted" name="Accepted" fill="#22c55e" radius={[3,3,0,0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}

          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
