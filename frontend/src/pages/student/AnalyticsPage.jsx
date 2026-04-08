import { useEffect, useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
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

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

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
  return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AnalyticsPage({ currentUser, token, handleLogout, navItems }) {
  const [submissions, setSubmissions] = useState([]);
  const [aiLogs, setAiLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

    Promise.all([
      fetch(`${API_BASE}/api/student/history`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/api/student/history/ai`, { headers }).then((r) => r.json()),
    ])
      .then(([subRes, aiRes]) => {
        setSubmissions(subRes?.data ?? []);
        setAiLogs(aiRes?.data ?? []);
      })
      .catch((err) => console.error("AnalyticsPage fetch failed:", err))
      .finally(() => setLoading(false));
  }, [token]);

  const totalSubmissions = submissions.length;
  const accepted = submissions.filter((s) => s.status === "accepted" || s.status === "Accepted").length;
  const uniqueProblemsSolved = new Set(
    submissions.filter((s) => s.status === "accepted" || s.status === "Accepted").map((s) => s.problemId),
  ).size;
  const totalAiChats = aiLogs.length;

  const statusCounts = {};
  for (const s of submissions) {
    const key = s.status ?? "unknown";
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }

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
        <SectionCard title="My Analytics">
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 1 }}>
              <StatBox label="Total Submissions" value={totalSubmissions} />
              <StatBox label="Accepted" value={accepted} color="#22C55E" />
              <StatBox label="Problems Solved" value={uniqueProblemsSolved} color="#4F46E5" />
              <StatBox label="AI Chats" value={totalAiChats} color="#EAB308" />
            </Stack>
          )}
        </SectionCard>

        {!loading && Object.keys(statusCounts).length > 0 && (
          <SectionCard title="Submission Breakdown">
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {Object.entries(statusCounts).map(([status, count]) => (
                <Chip
                  key={status}
                  label={`${status}: ${count}`}
                  variant="outlined"
                  sx={{ textTransform: "capitalize", fontWeight: 600 }}
                />
              ))}
            </Stack>
          </SectionCard>
        )}

        {!loading && submissions.length > 0 && (
          <SectionCard title="Recent Submissions">
            <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                    <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Language</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {submissions.slice(0, 20).map((sub, idx) => (
                    <TableRow key={sub.id} hover>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>
                        <Chip
                          label={sub.status}
                          size="small"
                          color={sub.status === "accepted" || sub.status === "Accepted" ? "success" : "default"}
                          variant="outlined"
                          sx={{ textTransform: "capitalize" }}
                        />
                      </TableCell>
                      <TableCell>{sub.language ?? "-"}</TableCell>
                      <TableCell sx={{ color: "text.secondary", fontSize: 13 }}>{formatDate(sub.createdAt)}</TableCell>
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
