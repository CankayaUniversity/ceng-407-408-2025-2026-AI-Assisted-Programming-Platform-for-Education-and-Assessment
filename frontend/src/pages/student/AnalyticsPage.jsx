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
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip as RechartTooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

import AppLayout    from "../../components/layout/AppLayout";
import SectionCard  from "../../components/common/SectionCard";
import { API_BASE } from "../../apiBase";

// ── Colour palettes ───────────────────────────────────────────────────────────
const ERROR_COLORS = {
  wrong_answer:          "#ef4444",
  compile_error:         "#f97316",
  runtime_error:         "#eab308",
  time_limit_exceeded:   "#a855f7",
  memory_limit_exceeded: "#06b6d4",
  syntax_error:          "#ec4899",
  internal_error:        "#6b7280",
};
const LANG_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#06b6d4", "#ec4899", "#a855f7"];
const DIFF_COLOR  = { Easy: "#22c55e", Medium: "#f59e0b", Hard: "#ef4444" };

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function errorLabel(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Stat box ──────────────────────────────────────────────────────────────────
function StatBox({ label, value, sub, color = "text.primary" }) {
  return (
    <Box
      sx={{
        flex: 1, minWidth: 130, textAlign: "center", py: 2, px: 1,
        borderRadius: 2, bgcolor: "rgba(148,163,184,0.06)",
        border: "1px solid", borderColor: "divider",
      }}
    >
      <Typography variant="h4" sx={{ fontWeight: 700, color }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{label}</Typography>
      {sub && <Typography variant="caption" color="text.disabled">{sub}</Typography>}
    </Box>
  );
}

// ── Activity heatmap (GitHub-style, last 26 weeks) ────────────────────────────
function ActivityHeatmap({ dailyActivity }) {
  if (!dailyActivity?.length) return null;

  const dayMap = new Map(dailyActivity.map((d) => [d.date, d]));
  const today  = new Date();
  const weeks  = [];
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 7 * 26 + 1);
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));

  for (let w = 0; w < 26; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const key  = cursor.toISOString().slice(0, 10);
      const data = dayMap.get(key);
      days.push({ date: key, count: data?.count ?? 0, accepted: data?.accepted ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(days);
  }

  const maxCount = Math.max(...dailyActivity.map((d) => d.count), 1);
  function cellColor(n) {
    if (n === 0) return "#161b22";
    const t = Math.min(n / maxCount, 1);
    if (t < 0.25) return "#0e4429";
    if (t < 0.5)  return "#006d32";
    if (t < 0.75) return "#26a641";
    return "#39d353";
  }

  const DOW = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <Box>
      <Stack direction="row" spacing={0.5} sx={{ overflowX: "auto", pb: 1 }}>
        <Stack spacing={0.5} sx={{ mr: 0.5, pt: "20px" }}>
          {DOW.map((d, i) => (
            <Box key={i} sx={{ width: 10, height: 10, display: "flex", alignItems: "center" }}>
              <Typography variant="caption" sx={{ fontSize: 9, color: "text.disabled", lineHeight: 1 }}>
                {i % 2 === 0 ? d : ""}
              </Typography>
            </Box>
          ))}
        </Stack>
        {weeks.map((week, wi) => (
          <Stack key={wi} spacing={0.5}>
            <Typography variant="caption"
              sx={{ fontSize: 9, color: "text.disabled", height: 14, lineHeight: "14px" }}>
              {week[0].date.slice(8, 10) <= "07"
                ? new Date(week[0].date).toLocaleString("en", { month: "short" })
                : ""}
            </Typography>
            {week.map((day) => (
              <Tooltip key={day.date} placement="top"
                title={`${day.date}: ${day.count} submission${day.count !== 1 ? "s" : ""}, ${day.accepted} accepted`}>
                <Box sx={{
                  width: 10, height: 10, borderRadius: "2px",
                  bgcolor: cellColor(day.count), cursor: "default",
                  transition: "transform 0.1s",
                  "&:hover": { transform: "scale(1.4)" },
                }} />
              </Tooltip>
            ))}
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }}>
        <Typography variant="caption" color="text.disabled">Less</Typography>
        {["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"].map((c) => (
          <Box key={c} sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: c }} />
        ))}
        <Typography variant="caption" color="text.disabled">More</Typography>
      </Stack>
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage({ currentUser, token, handleLogout, navItems }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/api/student/analytics`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then((r) => r.json())
      .then((body) => setData(body.data ?? null))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const summary  = data?.summary          ?? {};
  const perProb  = data?.perProblem       ?? [];
  const errProf  = data?.errorProfile     ?? {};
  const langUse  = data?.languageUsage    ?? {};
  const timeline = data?.submissionTimeline ?? [];
  const trend    = data?.learningTrend    ?? "stable";

  const errorData = Object.entries(errProf)
    .map(([name, value]) => ({ name: errorLabel(name), rawName: name, value }))
    .sort((a, b) => b.value - a.value);
  const totalErrors = errorData.reduce((s, e) => s + e.value, 0);

  const langData = Object.entries(langUse)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const attemptsBar = perProb
    .filter((p) => p.solved)
    .map((p) => ({
      name:       p.title.length > 22 ? p.title.slice(0, 20) + "…" : p.title,
      fullName:   p.title,
      attempts:   p.attemptsToSolve ?? p.attempts,
      hints:      p.hintsUsed,
      difficulty: p.difficulty,
    }))
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 12);

  const trendColor = trend === "improving" ? "#22c55e" : trend === "declining" ? "#ef4444" : "#94a3b8";
  const trendLabel = trend === "improving" ? "↑ Improving"
    : trend === "declining" ? "↓ Declining" : "→ Stable";

  return (
    <AppLayout
      title="AI Mentor" roleLabel="Student"
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
            {/* ── Summary stats ─────────────────────────────────────────── */}
            <SectionCard title="My Progress">
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} flexWrap="wrap">
                <StatBox label="Total Submissions" value={summary.totalAttempts ?? 0} />
                <StatBox label="Accepted"          value={summary.acceptedAttempts ?? 0} color="#22c55e" />
                <StatBox label="Success Rate"      value={`${summary.successRate ?? 0}%`} color="#6366f1" />
                <StatBox label="Problems Solved"   value={summary.problemsSolved ?? 0}
                  sub={`of ${summary.totalProblemsAttempted ?? 0} attempted`} color="#f59e0b" />
                <StatBox label="AI Hints Used"     value={summary.totalHints ?? 0} color="#06b6d4" />
                <StatBox label="Day Streak"        value={summary.streak ?? 0}
                  sub="consecutive days" color="#ec4899" />
              </Stack>

              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">Learning trend:</Typography>
                <Chip label={trendLabel} size="small"
                  sx={{ bgcolor: trendColor + "22", color: trendColor, fontWeight: 700,
                    border: `1px solid ${trendColor}44` }} />
              </Stack>

              {(summary.totalProblemsAttempted ?? 0) > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">Problems solved</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {summary.problemsSolved} / {summary.totalProblemsAttempted}
                    </Typography>
                  </Stack>
                  <LinearProgress variant="determinate"
                    value={(summary.problemsSolved / summary.totalProblemsAttempted) * 100}
                    sx={{ height: 8, borderRadius: 4 }} />
                </Box>
              )}
            </SectionCard>

            {/* ── Activity heatmap ──────────────────────────────────────── */}
            {data.dailyActivity?.length > 0 && (
              <SectionCard title="Activity (last 6 months)">
                <ActivityHeatmap dailyActivity={data.dailyActivity} />
              </SectionCard>
            )}

            {/* ── Timeline + Error donut ────────────────────────────────── */}
            {(timeline.length > 0 || errorData.length > 0) && (
              <Stack direction={{ xs: "column", md: "row" }} spacing={3}>

                {timeline.length > 0 && (
                  <SectionCard title="Cumulative Progress Over Time" sx={{ flex: 2 }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={timeline} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                        <defs>
                          <linearGradient id="gradSolved" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="date" tickFormatter={fmtDate}
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          interval={Math.max(0, Math.floor(timeline.length / 5) - 1)} />
                        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                        <RechartTooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                          labelStyle={{ color: "#94a3b8" }}
                          labelFormatter={(v) => `Date: ${v}`} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area type="monotone" dataKey="total"  name="Total submissions"
                          stroke="#22c55e" fill="url(#gradTotal)"  strokeWidth={2} dot={false} />
                        <Area type="monotone" dataKey="solved" name="Problems solved"
                          stroke="#6366f1" fill="url(#gradSolved)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </SectionCard>
                )}

                {errorData.length > 0 && (
                  <SectionCard title="Error Breakdown" sx={{ flex: 1, minWidth: 260 }}>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={errorData} cx="50%" cy="50%"
                          innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                          {errorData.map((entry) => (
                            <Cell key={entry.rawName} fill={ERROR_COLORS[entry.rawName] ?? "#6b7280"} />
                          ))}
                        </Pie>
                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="#e2e8f0">
                          <tspan x="50%" dy="-0.4em" fontSize="22" fontWeight="700">{totalErrors}</tspan>
                          <tspan x="50%" dy="1.4em" fontSize="11" fill="#94a3b8">errors</tspan>
                        </text>
                        <RechartTooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                          formatter={(v, n) => [`${v} times`, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <Stack spacing={0.5} sx={{ mt: 1 }}>
                      {errorData.map((e) => (
                        <Stack key={e.rawName} direction="row" alignItems="center" spacing={1}>
                          <Box sx={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                            bgcolor: ERROR_COLORS[e.rawName] ?? "#6b7280" }} />
                          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                            {e.name}
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>{e.value}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </SectionCard>
                )}
              </Stack>
            )}

            {/* ── Attempts-to-solve bar + Language pie ─────────────────── */}
            {(attemptsBar.length > 0 || langData.length > 0) && (
              <Stack direction={{ xs: "column", md: "row" }} spacing={3}>

                {attemptsBar.length > 0 && (
                  <SectionCard title="Attempts Before Solving" sx={{ flex: 2 }}>
                    <ResponsiveContainer width="100%" height={Math.max(180, attemptsBar.length * 34)}>
                      <BarChart data={attemptsBar} layout="vertical"
                        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={130}
                          tick={{ fontSize: 11, fill: "#94a3b8" }} />
                        <RechartTooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                          formatter={(v, n, props) => [
                            v,
                            n === "attempts"
                              ? `Attempts (${props.payload.fullName})`
                              : "Hints used",
                          ]} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="attempts" name="Attempts to solve" radius={[0, 4, 4, 0]}>
                          {attemptsBar.map((entry) => (
                            <Cell key={entry.name} fill={DIFF_COLOR[entry.difficulty] ?? "#6366f1"} />
                          ))}
                        </Bar>
                        <Bar dataKey="hints" name="Hints used" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <Stack direction="row" spacing={1.5} sx={{ mt: 1 }} flexWrap="wrap">
                      {Object.entries(DIFF_COLOR).map(([d, c]) => (
                        <Stack key={d} direction="row" alignItems="center" spacing={0.5}>
                          <Box sx={{ width: 10, height: 10, borderRadius: 1, bgcolor: c }} />
                          <Typography variant="caption" color="text.secondary">{d}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </SectionCard>
                )}

                {langData.length > 0 && (
                  <SectionCard title="Language Usage" sx={{ flex: 1, minWidth: 220 }}>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={langData} cx="50%" cy="50%" outerRadius={80}
                          paddingAngle={3} dataKey="value"
                          label={({ name, percent }) =>
                            percent > 0.05 ? `${name} ${Math.round(percent * 100)}%` : ""}
                          labelLine={false}>
                          {langData.map((_, i) => (
                            <Cell key={i} fill={LANG_COLORS[i % LANG_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartTooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                          formatter={(v, n) => [`${v} submissions`, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      {langData.map((l, i) => (
                        <Stack key={l.name} direction="row" alignItems="center" spacing={1}>
                          <Box sx={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                            bgcolor: LANG_COLORS[i % LANG_COLORS.length] }} />
                          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                            {l.name}
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>{l.value}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </SectionCard>
                )}
              </Stack>
            )}

            {/* ── Per-problem table ─────────────────────────────────────── */}
            {perProb.length > 0 && (
              <SectionCard title="Problem Breakdown">
                <TableContainer
                  sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                        <TableCell sx={{ fontWeight: 700 }}>Problem</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">Difficulty</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">Status</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">Attempts</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="center">Hints</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Top Errors</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {perProb.map((p) => {
                        const topErrors = Object.entries(p.errorProfile)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 2);
                        return (
                          <TableRow key={p.problemId} hover>
                            <TableCell sx={{ fontWeight: 600, maxWidth: 200 }}>
                              <Tooltip title={p.title}><span>{p.title}</span></Tooltip>
                            </TableCell>
                            <TableCell align="center">
                              {p.difficulty
                                ? <Chip label={p.difficulty} size="small" variant="outlined"
                                    sx={{ color: DIFF_COLOR[p.difficulty] ?? "text.secondary",
                                      borderColor: DIFF_COLOR[p.difficulty] ?? "divider" }} />
                                : "—"}
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={p.solved ? "Solved" : "Unsolved"} size="small"
                                color={p.solved ? "success" : "default"}
                                variant={p.solved ? "filled" : "outlined"} />
                            </TableCell>
                            <TableCell align="center">
                              {p.attemptsToSolve != null
                                ? `${p.attemptsToSolve} to solve`
                                : p.attempts}
                            </TableCell>
                            <TableCell align="center">{p.hintsUsed || "—"}</TableCell>
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

            {perProb.length === 0 && (
              <SectionCard title="No data yet">
                <Typography color="text.secondary" sx={{ py: 2 }}>
                  Submit solutions to problems to see your analytics here.
                </Typography>
              </SectionCard>
            )}
          </>
        )}

      </Stack>
    </AppLayout>
  );
}
