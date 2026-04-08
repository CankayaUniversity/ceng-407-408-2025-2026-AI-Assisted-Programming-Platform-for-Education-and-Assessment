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
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

import AppLayout from "../../components/layout/AppLayout";
import SectionCard from "../../components/common/SectionCard";
import { API_BASE } from "../../apiBase";

function difficultyColor(d) {
  const v = (d ?? "").toLowerCase();
  if (v.includes("hard")) return "error";
  if (v.includes("medium")) return "warning";
  return "success";
}

export default function AssignmentsPage({ currentUser, token, handleLogout, navItems }) {
  const navigate = useNavigate();
  const [problems, setProblems] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

    Promise.all([
      fetch(`${API_BASE}/api/problems`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/api/student/history`, { headers }).then((r) => r.json()),
    ])
      .then(([probRes, subRes]) => {
        setProblems(probRes?.data ?? []);
        setSubmissions(subRes?.data ?? []);
      })
      .catch((err) => console.error("AssignmentsPage fetch failed:", err))
      .finally(() => setLoading(false));
  }, [token]);

  const solvedSet = new Set(
    submissions.filter((s) => s.status === "accepted" || s.status === "Accepted").map((s) => s.problemId),
  );

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
          All available problems. Click a row to start working.
        </Typography>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : problems.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
            No assignments available yet.
          </Typography>
        ) : (
          <>
            <Box sx={{ mb: 2 }}>
              <LinearProgress
                variant="determinate"
                value={problems.length > 0 ? (solvedSet.size / problems.length) * 100 : 0}
                sx={{ height: 10, borderRadius: 5 }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {solvedSet.size} / {problems.length} completed
              </Typography>
            </Box>

            <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                    <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Difficulty</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Language</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {problems.map((p, idx) => {
                    const solved = solvedSet.has(p.id);
                    return (
                      <TableRow
                        key={p.id}
                        hover
                        onClick={() => navigate(`/problem/${p.id}`)}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{p.title}</TableCell>
                        <TableCell>
                          <Chip label={p.difficulty ?? "N/A"} size="small" color={difficultyColor(p.difficulty)} variant="outlined" />
                        </TableCell>
                        <TableCell>{p.language ?? "-"}</TableCell>
                        <TableCell>
                          <Chip
                            label={solved ? "Solved" : "Not solved"}
                            size="small"
                            color={solved ? "success" : "default"}
                            variant={solved ? "filled" : "outlined"}
                          />
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
