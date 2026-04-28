/**
 * StudentAnalyticsContent.jsx
 *
 * Shared analytics view used by:
 *   - Student's own /analytics page
 *   - Teacher's student detail dialog
 *
 * Props:
 *   data          — the analytics data object from /api/student/analytics
 *                   or /api/teacher/students/:id/analytics
 *   loading       — boolean
 *   error         — string | null
 */
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
  Alert,
} from "@mui/material";
import {
  AreaChart, Area,
  BarChart, Bar,
  Cell,
  PieChart, Pie,
  ResponsiveContainer,
  Tooltip as RechartTooltip,
  XAxis, YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

// ── Palettes ──────────────────────────────────────────────────────────────────
export const ERROR_COLORS = {
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
export function errorLabel(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Stat box ──────────────────────────────────────────────────────────────────
function StatBox({ label, value, sub, color = "text.primary" }) {
  const accentColor = color === "text.primary" ? null : color;
  return (
    <Box sx={{
      flex: "1 1 130px", textAlign: "center", py: 2, px: 1,
      borderRadius: 2,
      bgcolor: accentColor ? `${accentColor}0d` : "rgba(148,163,184,0.06)",
      border: "1px solid", borderColor: "divider",
      borderTop: accentColor ? `3px solid ${accentColor}` : "1px solid",
      borderTopColor: accentColor ?? "divider",
    }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{label}</Typography>
      {sub && <Typography variant="caption" color="text.disabled" display="block">{sub}</Typography>}
    </Box>
  );
}

// ── Activity heatmap ──────────────────────────────────────────────────────────
export function ActivityHeatmap({ dailyActivity, cellSize = 13 }) {
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

  const DOW    = ["M", "T", "W", "T", "F", "S", "S"];
  const gap    = Math.round(cellSize * 0.23);
  const labelW = cellSize + 4;

  return (
    <Box sx={{ width: "100%" }}>
      <Stack direction="row" spacing={`${gap}px`} sx={{ overflowX: "auto", pb: 1, justifyContent: "center" }}>
        {/* Day labels */}
        <Stack spacing={`${gap}px`} sx={{ pt: `${cellSize + gap + 2}px` }}>
          {DOW.map((d, i) => (
            <Box key={i} sx={{ width: labelW, height: cellSize, display: "flex", alignItems: "center" }}>
              <Typography sx={{ fontSize: cellSize * 0.7, color: "text.disabled", lineHeight: 1 }}>
                {i % 2 === 0 ? d : ""}
              </Typography>
            </Box>
          ))}
        </Stack>

        {/* Grid */}
        {weeks.map((week, wi) => (
          <Stack key={wi} spacing={`${gap}px`}>
            <Typography sx={{ fontSize: cellSize * 0.7, color: "text.disabled",
              height: cellSize, lineHeight: `${cellSize}px`, mb: `${gap}px` }}>
              {week[0].date.slice(8, 10) <= "07"
                ? new Date(week[0].date).toLocaleString("en", { month: "short" }) : ""}
            </Typography>
            {week.map((day) => (
              <Tooltip key={day.date} placement="top"
                title={`${day.date}: ${day.count} submission${day.count !== 1 ? "s" : ""}, ${day.accepted} accepted`}>
                <Box sx={{
                  width: cellSize, height: cellSize, borderRadius: "3px",
                  bgcolor: cellColor(day.count), cursor: "default",
                  transition: "transform 0.1s",
                  "&:hover": { transform: "scale(1.3)" },
                }} />
              </Tooltip>
            ))}
          </Stack>
        ))}
      </Stack>

      {/* Legend */}
      <Stack direction="row" alignItems="center" spacing={`${gap}px`} justifyContent="center" sx={{ mt: 0.5 }}>
        <Typography variant="caption" color="text.disabled">Less</Typography>
        {["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"].map((c) => (
          <Box key={c} sx={{ width: cellSize, height: cellSize, borderRadius: "3px", bgcolor: c }} />
        ))}
        <Typography variant="caption" color="text.disabled">More</Typography>
      </Stack>
    </Box>
  );
}

// ── SVG arc for language score ────────────────────────────────────────────────
function ScoreArc({ score, color, size = 88 }) {
  const r    = (size - 14) / 2;
  const cx   = size / 2;
  const cy   = size / 2;
  // Arc spans 240° (from 150° to 390°, i.e. bottom-left to bottom-right)
  const startDeg = 150;
  const totalDeg = 240;
  const pct   = Math.min(Math.max(score, 0), 100) / 100;
  const angle = startDeg + totalDeg * pct;
  const toRad = (d) => (d * Math.PI) / 180;

  function arcPath(fromDeg, toDeg) {
    const x1 = cx + r * Math.cos(toRad(fromDeg));
    const y1 = cy + r * Math.sin(toRad(fromDeg));
    const x2 = cx + r * Math.cos(toRad(toDeg));
    const y2 = cy + r * Math.sin(toRad(toDeg));
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  }

  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      {/* track */}
      <path d={arcPath(startDeg, startDeg + totalDeg)} fill="none"
        stroke="#1e293b" strokeWidth={7} strokeLinecap="round" />
      {/* filled arc */}
      {score > 0 && (
        <path d={arcPath(startDeg, angle)} fill="none"
          stroke={color} strokeWidth={7} strokeLinecap="round" />
      )}
      {/* score text */}
      <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="central"
        fill="#e2e8f0" fontSize={size * 0.22} fontWeight="700">{score}</text>
      <text x={cx} y={cy + size * 0.16} textAnchor="middle"
        fill="#64748b" fontSize={size * 0.12}>/100</text>
    </svg>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────
export default function StudentAnalyticsContent({ data, loading, error }) {
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data)  return null;

  const summary  = data.summary          ?? {};
  const perProb  = data.perProblem       ?? [];
  const errProf  = data.errorProfile     ?? {};
  const langUse  = data.languageUsage    ?? {};
  const timeline = data.submissionTimeline ?? [];
  const trend    = data.learningTrend    ?? "stable";

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

  // ── Language performance computation ──────────────────────────────────────
  const langStatsMap = perProb.reduce((acc, p) => {
    const lang = p.language ?? "unknown";
    if (!acc[lang]) acc[lang] = { language: lang, solved: 0, attempted: 0, totalAttempts: 0, hints: 0, errors: {} };
    acc[lang].attempted     += 1;
    acc[lang].totalAttempts += p.attempts;
    acc[lang].hints         += p.hintsUsed ?? 0;
    if (p.solved) acc[lang].solved += 1;
    for (const [err, cnt] of Object.entries(p.errorProfile ?? {})) {
      acc[lang].errors[err] = (acc[lang].errors[err] ?? 0) + cnt;
    }
    return acc;
  }, {});

  const langStats = Object.values(langStatsMap).map((ls) => {
    const solveRate  = ls.attempted > 0 ? ls.solved / ls.attempted : 0;
    const avgAttempts = ls.solved > 0 ? ls.totalAttempts / ls.solved : ls.totalAttempts;
    // efficiency: fewer avg attempts = better; cap at 10 attempts for scale
    const efficiency = Math.max(0, 1 - (avgAttempts - 1) / 9);
    const score = Math.round(solveRate * 60 + efficiency * 40);
    const topError = Object.entries(ls.errors).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
    const band = score >= 80 ? "Strong" : score >= 50 ? "Average" : "Needs Work";
    const bandColor = score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
    return { ...ls, score, avgAttempts: Math.round(avgAttempts * 10) / 10, topError, band, bandColor };
  }).sort((a, b) => b.score - a.score);

  const trendColor = trend === "improving" ? "#22c55e" : trend === "declining" ? "#ef4444" : "#94a3b8";
  const trendLabel = trend === "improving" ? "↑ Improving"
    : trend === "declining" ? "↓ Declining" : "→ Stable";

  return (
    <Stack spacing={3}>

      {/* ── Summary stats ───────────────────────────────────────────────── */}
      <Box>
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap
          sx={{ justifyContent: "center" }}>
          <StatBox label="Submissions"   value={summary.totalAttempts ?? 0} />
          <StatBox label="Accepted"      value={summary.acceptedAttempts ?? 0}  color="#22c55e" />
          <StatBox label="Success Rate"  value={`${summary.successRate ?? 0}%`} color="#6366f1" />
          <StatBox label="Solved"        value={summary.problemsSolved ?? 0}
            sub={`of ${summary.totalProblemsAttempted ?? 0} tried`}            color="#f59e0b" />
          <StatBox label="AI Hints"      value={summary.totalHints ?? 0}        color="#06b6d4" />
          <StatBox label="Day Streak"    value={summary.streak ?? 0}
            sub="consecutive days"                                               color="#ec4899" />
        </Stack>

        {/* Trend + progress bar */}
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 2, justifyContent: "center" }}>
          <Typography variant="body2" color="text.secondary">Learning trend:</Typography>
          <Chip label={trendLabel} size="small"
            sx={{ bgcolor: trendColor + "22", color: trendColor, fontWeight: 700,
              border: `1px solid ${trendColor}44` }} />
        </Stack>

        {(summary.totalProblemsAttempted ?? 0) > 0 && (
          <Box sx={{ mt: 1.5, maxWidth: 600, mx: "auto" }}>
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
      </Box>

      {/* ── Activity heatmap (full-width, centred) ────────────────────── */}
      {data.dailyActivity?.length > 0 && (
        <Box sx={{
          p: 3, borderRadius: 3,
          border: "1px solid", borderColor: "divider",
          bgcolor: "rgba(148,163,184,0.04)",
        }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, textAlign: "center" }}>
            Activity — last 6 months
          </Typography>
          <ActivityHeatmap dailyActivity={data.dailyActivity} cellSize={14} />
        </Box>
      )}

      {/* ── Timeline + Error donut ─────────────────────────────────────── */}
      {(timeline.length > 0 || errorData.length > 0) && (
        <Stack direction={{ xs: "column", md: "row" }} spacing={3}>

          {timeline.length > 0 && (
            <Box sx={{ flex: 2, p: 2.5, borderRadius: 3,
              border: "1px solid", borderColor: "divider",
              bgcolor: "rgba(148,163,184,0.04)" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Cumulative Progress
              </Typography>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={timeline} margin={{ top: 5, right: 15, left: -25, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tickFormatter={fmtDate}
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    interval={Math.max(0, Math.floor(timeline.length / 4) - 1)} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <RechartTooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                    labelFormatter={(v) => `Date: ${v}`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="total"  name="Total"  stroke="#22c55e"
                    fill="url(#gT)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="solved" name="Solved" stroke="#6366f1"
                    fill="url(#gS)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          )}

          {errorData.length > 0 && (
            <Box sx={{ flex: 1, minWidth: 220, p: 2.5, borderRadius: 3,
              border: "1px solid", borderColor: "divider",
              bgcolor: "rgba(148,163,184,0.04)" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Error Breakdown
              </Typography>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={errorData} cx="50%" cy="50%"
                    innerRadius={45} outerRadius={72} paddingAngle={2} dataKey="value">
                    {errorData.map((e) => (
                      <Cell key={e.rawName} fill={ERROR_COLORS[e.rawName] ?? "#6b7280"} />
                    ))}
                  </Pie>
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="#e2e8f0">
                    <tspan x="50%" dy="-0.4em" fontSize="18" fontWeight="700">{totalErrors}</tspan>
                    <tspan x="50%" dy="1.4em" fontSize="10" fill="#94a3b8">errors</tspan>
                  </text>
                  <RechartTooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                    formatter={(v, n) => [`${v} times`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <Stack spacing={0.4} sx={{ mt: 1 }}>
                {errorData.map((e) => (
                  <Stack key={e.rawName} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                      bgcolor: ERROR_COLORS[e.rawName] ?? "#6b7280" }} />
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{e.name}</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{e.value}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      )}

      {/* ── Attempts bar + Language pie ────────────────────────────────── */}
      {(attemptsBar.length > 0 || langData.length > 0) && (
        <Stack direction={{ xs: "column", md: "row" }} spacing={3}>

          {attemptsBar.length > 0 && (
            <Box sx={{ flex: 2, p: 2.5, borderRadius: 3,
              border: "1px solid", borderColor: "divider",
              bgcolor: "rgba(148,163,184,0.04)" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Attempts Before Solving
              </Typography>
              <ResponsiveContainer width="100%" height={Math.max(160, attemptsBar.length * 30)}>
                <BarChart data={attemptsBar} layout="vertical"
                  margin={{ top: 5, right: 25, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={120}
                    tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <RechartTooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                    formatter={(v, n, props) => [v,
                      n === "attempts" ? `Attempts (${props.payload.fullName})` : "Hints"]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="attempts" name="Attempts to solve" radius={[0, 4, 4, 0]}>
                    {attemptsBar.map((e) => (
                      <Cell key={e.name} fill={DIFF_COLOR[e.difficulty] ?? "#6366f1"} />
                    ))}
                  </Bar>
                  <Bar dataKey="hints" name="Hints used" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <Stack direction="row" spacing={1.5} sx={{ mt: 1 }} flexWrap="wrap">
                {Object.entries(DIFF_COLOR).map(([d, c]) => (
                  <Stack key={d} direction="row" alignItems="center" spacing={0.5}>
                    <Box sx={{ width: 9, height: 9, borderRadius: 1, bgcolor: c }} />
                    <Typography variant="caption" color="text.secondary">{d}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {langData.length > 0 && (
            <Box sx={{ flex: 1, minWidth: 200, p: 2.5, borderRadius: 3,
              border: "1px solid", borderColor: "divider",
              bgcolor: "rgba(148,163,184,0.04)" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Languages
              </Typography>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={langData} cx="50%" cy="50%" outerRadius={72}
                    paddingAngle={3} dataKey="value"
                    label={({ name, percent }) =>
                      percent > 0.07 ? `${name} ${Math.round(percent * 100)}%` : ""}
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
              <Stack spacing={0.4} sx={{ mt: 0.5 }}>
                {langData.map((l, i) => (
                  <Stack key={l.name} direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                      bgcolor: LANG_COLORS[i % LANG_COLORS.length] }} />
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{l.name}</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{l.value}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      )}

      {/* ── Language Performance ──────────────────────────────────────── */}
      {langStats.length > 0 && (
        <Box sx={{ p: 2.5, borderRadius: 3, border: "1px solid", borderColor: "divider",
          bgcolor: "rgba(148,163,184,0.04)" }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Language Performance
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Strength score = solve rate (60%) + efficiency (40%) · higher is better
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            {langStats.map((ls) => (
              <Box key={ls.language} sx={{
                flex: "1 1 170px", maxWidth: 220,
                p: 2, borderRadius: 2.5,
                border: "1px solid", borderColor: ls.bandColor + "44",
                bgcolor: ls.bandColor + "0d",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
              }}>
                {/* Language name */}
                <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: "capitalize",
                  letterSpacing: 0.5 }}>
                  {ls.language}
                </Typography>

                {/* Arc */}
                <ScoreArc score={ls.score} color={ls.bandColor} size={90} />

                {/* Band badge */}
                <Chip
                  label={ls.band === "Strong" ? "💚 Strong" : ls.band === "Average" ? "🟡 Average" : "🔴 Needs Work"}
                  size="small"
                  sx={{
                    fontWeight: 700, fontSize: 11,
                    bgcolor: ls.bandColor + "22",
                    color:   ls.bandColor,
                    border: `1px solid ${ls.bandColor}55`,
                  }}
                />

                {/* Stats */}
                <Stack spacing={0.3} sx={{ width: "100%", mt: 0.5 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Solved</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      {ls.solved} / {ls.attempted}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Avg attempts</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{ls.avgAttempts}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Hints used</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{ls.hints}</Typography>
                  </Stack>
                  {ls.topError && (
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary">Top error</Typography>
                      <Chip size="small"
                        label={errorLabel(ls.topError)}
                        sx={{
                          fontSize: 9, height: 18,
                          bgcolor: (ERROR_COLORS[ls.topError] ?? "#6b7280") + "22",
                          color:   ERROR_COLORS[ls.topError] ?? "text.secondary",
                          border: `1px solid ${(ERROR_COLORS[ls.topError] ?? "#6b7280")}44`,
                        }} />
                    </Stack>
                  )}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {/* ── Per-problem table ──────────────────────────────────────────── */}
      {perProb.length > 0 && (
        <Box sx={{ p: 2.5, borderRadius: 3, border: "1px solid", borderColor: "divider",
          bgcolor: "rgba(148,163,184,0.04)" }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>Problem Breakdown</Typography>
          <TableContainer sx={{ borderRadius: 2, overflow: "hidden" }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                  <TableCell sx={{ fontWeight: 700 }}>Problem</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Diff.</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Attempts</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Hints</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Top Errors</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {perProb.map((p) => {
                  const topErrors = Object.entries(p.errorProfile ?? {})
                    .sort(([, a], [, b]) => b - a).slice(0, 2);
                  return (
                    <TableRow key={p.problemId} hover>
                      <TableCell sx={{ fontWeight: 600, maxWidth: 180 }}>
                        <Tooltip title={p.title}><span>{p.title}</span></Tooltip>
                      </TableCell>
                      <TableCell align="center">
                        {p.difficulty
                          ? <Chip label={p.difficulty} size="small" variant="outlined"
                              sx={{ color: DIFF_COLOR[p.difficulty] ?? "text.secondary",
                                borderColor: DIFF_COLOR[p.difficulty] ?? "divider", fontSize: 10 }} />
                          : "—"}
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={p.solved ? "Solved" : "Unsolved"} size="small"
                          color={p.solved ? "success" : "default"}
                          variant={p.solved ? "filled" : "outlined"} />
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: 13 }}>
                        {p.attemptsToSolve != null ? `${p.attemptsToSolve} to solve` : p.attempts}
                      </TableCell>
                      <TableCell align="center">{p.hintsUsed || "—"}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                          {topErrors.length === 0
                            ? <Typography variant="caption" color="text.disabled">—</Typography>
                            : topErrors.map(([key, cnt]) => (
                                <Chip key={key} size="small"
                                  label={`${errorLabel(key)} \xd7${cnt}`}
                                  sx={{ fontSize: 9,
                                    bgcolor: (ERROR_COLORS[key] ?? "#6b7280") + "22",
                                    color:   ERROR_COLORS[key] ?? "text.secondary",
                                    border: `1px solid ${(ERROR_COLORS[key] ?? "#6b7280")}44` }} />
                              ))}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {perProb.length === 0 && (
        <Box sx={{ py: 4, textAlign: "center" }}>
          <Typography color="text.secondary">No submission data yet.</Typography>
        </Box>
      )}

    </Stack>
  );
}
