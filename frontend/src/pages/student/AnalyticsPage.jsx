import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import AppLayout from "../../components/layout/AppLayout";
import SectionCard from "../../components/common/SectionCard";
import { API_BASE } from "../../apiBase";

function StatBox({ label, value, color = "text.primary" }) {
  return (
    <Box sx={{ flex: 1, minWidth: 130, textAlign: "center", py: 2, px: 1, borderRadius: 2, bgcolor: "rgba(148,163,184,0.06)" }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{label}</Typography>
    </Box>
  );
}

function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function statusColor(s) {
  if (!s) return "default";
  const v = s.toLowerCase();
  if (v === "accepted") return "success";
  if (v === "failed" || v.includes("error") || v.includes("wrong")) return "error";
  return "default";
}

export default function AnalyticsPage({ currentUser, token, handleLogout, navItems }) {
  const [submissions, setSubmissions] = useState([]);
  const [aiLogs,      setAiLogs]      = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

    Promise.all([
      fetch(`${API_BASE}/api/student/history`,    { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/api/student/history/ai`, { headers }).then((r) => r.json()),
    ])
      .then(([subRes, aiRes]) => {
        setSubmissions(subRes?.data ?? []);
        setAiLogs(aiRes?.data ?? []);
      })
      .catch((err) => console.error("AnalyticsPage fetch failed:", err))
      .finally(() => setLoading(false));
  }, [token]);

  // ── Top-level counts ──────────────────────────────────────────────────────
  const totalSubmissions   = submissions.length;
  const acceptedCount      = submissions.filter(
    (s) => (s.status ?? "").toLowerCase() === "accepted",
  ).length;
  const successRate        = totalSubmissions > 0
    ? Math.round((acceptedCount / totalSubmissions) * 100)
    : 0;
  const totalAiChats       = aiLogs.length;

  // ── Per-problem summary ───────────────────────────────────────────────────
  const problemSummary = useMemo(() => {
    const map = new Map();
    for (const s of submissions) {
      const pid   = s.problemId;
      const title = s.problem?.title ?? `Problem #${pid}`;
      if (!map.has(pid)) {
        map.set(pid, { problemId: pid, title, attempts: 0, solved: false, latestStatus: null, latestAt: null });
      }
      const entry = map.get(pid);
      entry.attempts += 1;
      if ((s.status ?? "").toLowerCase() === "accepted") entry.solved = true;
      // keep the most-recent submission's status
      if (!entry.latestAt || new Date(s.createdAt) > new Date(entry.latestAt)) {
        entry.latestStatus = s.status;
        entry.latestAt     = s.createdAt;
      }
    }
    // Sort: solved first, then by attempts desc
    return [...map.values()].sort((a, b) => {
      if (a.solved !== b.solved) return a.solved ? -1 : 1;
      return b.attempts - a.attempts;
    });
  }, [submissions]);

  const solvedCount = problemSummary.filter((p) => p.solved).length;

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
      <Stack spacing={3}>

        {/* ── Summary stats ────────────────────────────────────────────── */}
        <SectionCard title="My Progress">
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : (
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <StatBox label="Total Submissions" value={totalSubmissions} />
                <StatBox label="Accepted"          value={acceptedCount}      color="#22C55E" />
                <StatBox label="Success Rate"      value={`${successRate}%`}  color="#4F46E5" />
                <StatBox label="AI Hints Used"     value={totalAiChats}       color="#EAB308" />
              </Stack>

              {problemSummary.length > 0 && (
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      Problems solved
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {solvedCount} / {problemSummary.length}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={problemSummary.length > 0 ? (solvedCount / problemSummary.length) * 100 : 0}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Box>
              )}
            </Stack>
          )}
        </SectionCard>

        {/* ── Per-problem breakdown ─────────────────────────────────────── */}
        {!loading && problemSummary.length > 0 && (
          <SectionCard title="Problem Progress">
            <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                    <TableCell sx={{ fontWeight: 700 }}>Problem</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Attempts</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {problemSummary.map((p) => (
                    <TableRow key={p.problemId} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{p.title}</TableCell>
                      <TableCell align="center">{p.attempts}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={p.solved ? "Solved" : (p.latestStatus ?? "Not solved")}
                          size="small"
                          color={p.solved ? "success" : statusColor(p.latestStatus)}
                          variant={p.solved ? "filled" : "outlined"}
                          sx={{ textTransform: "capitalize" }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
        )}

        {/* ── Recent submissions ────────────────────────────────────────── */}
        {!loading && submissions.length > 0 && (
          <SectionCard title="Recent Submissions">
            <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                    <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Problem</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Language</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {submissions.slice(0, 20).map((sub, idx) => (
                    <TableRow key={sub.id} hover>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>
                        {sub.problem?.title ?? `#${sub.problemId}`}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={sub.status}
                          size="small"
                          color={statusColor(sub.status)}
                          variant="outlined"
                          sx={{ textTransform: "capitalize" }}
                        />
                      </TableCell>
                      <TableCell>{sub.language ?? "-"}</TableCell>
                      <TableCell sx={{ color: "text.secondary", fontSize: 13 }}>
                        {formatDate(sub.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
        )}

      </Stack>
    </AppLayout>
  );
}
