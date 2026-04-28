/**
 * ClassAnalyticsPage.jsx
 *
 * Teacher-facing class analytics dashboard.
 * Fetches GET /api/teacher/class/analytics and renders:
 *   - Summary stat boxes
 *   - Weekly submission activity (bar chart)
 *   - Problem difficulty table (accept rate, error breakdown)
 *   - Student leaderboard (problems solved)
 */
import { useEffect, useState } from "react";
import {
  Alert,
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
import {
  BarChart,
  Bar,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartTooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

import AppLayout   from "../../components/layout/AppLayout";
import SectionCard from "../../components/common/SectionCard";
import { API_BASE } from "../../apiBase";

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
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatBox({ label, value, color = "text.primary", sub }) {
  return (
    <Box sx={{
      flex: 1, minWidth: 130, textAlign: "center", py: 2, px: 1,
      borderRadius: 2, bgcolor: "rgba(148,163,184,0.06)",
      border: "1px solid", borderColor: "divider",
    }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{label}</Typography>
      {sub && <Typography variant="caption" color="text.disabled">{sub}</Typography>}
    </Box>
  );
}

export default function ClassAnalyticsPage({ currentUser, token, handleLogout, navItems }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/api/teacher/class/analytics`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then((r) => r.json())
      .then((body) => setData(body.data ?? null))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const totals         = data?.totals         ?? {};
  const weeklyData     = data?.weeklyData     ?? [];
  const problemStats   = data?.problemStats   ?? [];
  const studentProgress = data?.studentProgress ?? [];

  const classAcceptRate = totals.attempts > 0
    ? Math.round((totals.accepted / totals.attempts) * 100)
    : 0;

  return (
    <AppLayout
      title="AI Mentor" roleLabel="Teacher"
      userLabel={currentUser?.name || currentUser?.email}
      onLogout={handleLogout} navItems={navItems}
      maxWidth="xl" showPageTitle={false}
    >
      <Stack spacing={3}>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}

        {!loading && data && (
          <>
            {/* ── Class summary ──────────────────────────────────────────── */}
            <SectionCard title="Class Overview">
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} flexWrap="wrap">
                <StatBox label="Students"         value={totals.students ?? 0} />
                <StatBox label="Total Submissions" value={totals.attempts ?? 0} />
                <StatBox label="Accepted"         value={totals.accepted ?? 0} color="#22c55e" />
                <StatBox label="Class Accept Rate" value={`${classAcceptRate}%`} color="#6366f1" />
                <StatBox label="Problems"         value={totals.problems ?? 0} color="#f59e0b" />
              </Stack>
            </SectionCard>

            {/* ── Weekly activity ────────────────────────────────────────── */}
            {weeklyData.length > 0 && (
              <SectionCard title="Weekly Submission Activity (last 12 weeks)">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={weeklyData} margin={{ top: 5, right: 20, left: -15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="week"
                      tickFormatter={(v) => new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                    <RechartTooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                      labelFormatter={(v) => `Week of ${v}`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="total"    name="Total submissions" fill="#334155" radius={[4,4,0,0]} />
                    <Bar dataKey="accepted" name="Accepted"          fill="#22c55e" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>
            )}

            {/* ── Problem difficulty table ────────────────────────────────── */}
            {problemStats.length > 0 && (
              <SectionCard title="Problem Difficulty (sorted hardest first)">
                <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                        <TableCell sx={{ fontWeight: 700 }}>Problem</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">Difficulty</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">Students</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">Solved</TableCell>
                        <TableCell sx={{ fontWeight: 700, minWidth: 130 }}>Accept Rate</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Top Errors</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {problemStats.map((p) => {
                        const topErrors = Object.entries(p.errorProfile ?? {})
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 3);
                        return (
                          <TableRow key={p.problemId} hover>
                            <TableCell sx={{ fontWeight: 600 }}>
                              <Tooltip title={p.title}><span>{p.title}</span></Tooltip>
                            </TableCell>
                            <TableCell align="center">
                              {p.difficulty
                                ? <Chip label={p.difficulty} size="small" variant="outlined"
                                    sx={{ color: DIFF_COLOR[p.difficulty] ?? "text.secondary",
                                      borderColor: DIFF_COLOR[p.difficulty] ?? "divider" }} />
                                : "—"}
                            </TableCell>
                            <TableCell align="center">{p.distinctStudents}</TableCell>
                            <TableCell align="center">
                              <Typography variant="body2">
                                <b>{p.solvedStudents}</b>
                                <Typography component="span" variant="caption" color="text.secondary">
                                  {" "}/ {p.distinctStudents}
                                </Typography>
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ minWidth: 130 }}>
                              <Stack direction="row" alignItems="center" spacing={1}>
                                <LinearProgress variant="determinate" value={p.acceptRate}
                                  sx={{ flex: 1, height: 6, borderRadius: 3,
                                    "& .MuiLinearProgress-bar": {
                                      bgcolor: p.acceptRate >= 60 ? "#22c55e"
                                        : p.acceptRate >= 30 ? "#f59e0b" : "#ef4444",
                                    },
                                  }} />
                                <Typography variant="caption" sx={{ minWidth: 32, fontWeight: 600 }}>
                                  {p.acceptRate}%
                                </Typography>
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                {topErrors.length === 0
                                  ? <Typography variant="caption" color="text.disabled">—</Typography>
                                  : topErrors.map(([key, cnt]) => (
                                      <Chip key={key} size="small"
                                        label={`${errorLabel(key)} \xd7${cnt}`}
                                        sx={{
                                          fontSize: 10,
                                          bgcolor: (ERROR_COLORS[key] ?? "#6b7280") + "22",
                                          color:   ERROR_COLORS[key] ?? "text.secondary",
                                          border: `1px solid ${(ERROR_COLORS[key] ?? "#6b7280")}44`,
                                        }} />
                                    ))}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </SectionCard>
            )}

            {/* ── Student leaderboard ────────────────────────────────────── */}
            {studentProgress.length > 0 && (
              <SectionCard title="Student Progress">
                <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                        <TableCell sx={{ fontWeight: 700 }} align="center">#</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Student</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">Solved</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">Submissions</TableCell>
                        <TableCell sx={{ fontWeight: 700, minWidth: 130 }}>Success Rate</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {studentProgress.map((s, i) => (
                        <TableRow key={s.studentId} hover>
                          <TableCell align="center">
                            <Typography variant="body2" sx={{ fontWeight: i < 3 ? 700 : 400,
                              color: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7f32" : "text.primary" }}>
                              {i + 1}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{s.email}</Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip label={s.problemsSolved} size="small" color="primary" variant="outlined" />
                          </TableCell>
                          <TableCell align="center">{s.totalAttempts}</TableCell>
                          <TableCell sx={{ minWidth: 130 }}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <LinearProgress variant="determinate" value={s.successRate}
                                sx={{ flex: 1, height: 6, borderRadius: 3,
                                  "& .MuiLinearProgress-bar": {
                                    bgcolor: s.successRate >= 60 ? "#22c55e"
                                      : s.successRate >= 30 ? "#f59e0b" : "#ef4444",
                                  },
                                }} />
                              <Typography variant="caption" sx={{ minWidth: 32, fontWeight: 600 }}>
                                {s.successRate}%
                              </Typography>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </SectionCard>
            )}
          </>
        )}

      </Stack>
    </AppLayout>
  );
}
