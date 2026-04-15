import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
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
import AddIcon         from "@mui/icons-material/Add";
import EditIcon        from "@mui/icons-material/Edit";
import DeleteIcon      from "@mui/icons-material/Delete";
import GroupAddIcon    from "@mui/icons-material/GroupAdd";
import GradingIcon     from "@mui/icons-material/Grading";

import AppLayout        from "../../components/layout/AppLayout";
import SectionCard      from "../../components/common/SectionCard";
import AssignmentModal  from "../../components/teacher/AssignmentModal";
import EnrollModal      from "../../components/teacher/EnrollModal";
import { API_BASE }     from "../../apiBase";

function formatDue(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const overdue = d < now;
  return (
    <Typography
      component="span"
      variant="body2"
      color={overdue ? "error" : "text.primary"}
    >
      {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      {overdue && " (overdue)"}
    </Typography>
  );
}

export default function AssignmentsPage({ currentUser, problems, token, handleLogout, navItems }) {
  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(true);

  const [assignModal,     setAssignModal]     = useState(false);
  const [editTarget,      setEditTarget]      = useState(null);   // null = create
  const [enrollModal,     setEnrollModal]     = useState(false);
  const [enrollTarget,    setEnrollTarget]    = useState(null);
  const [deletingId,      setDeletingId]      = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  async function fetchAssignments() {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/assignments`, { headers });
      const body = await res.json();
      setAssignments(body.data ?? []);
    } catch (err) {
      console.error("Failed to fetch assignments:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) fetchAssignments();
  }, [token]); // eslint-disable-line

  function openCreate() {
    setEditTarget(null);
    setAssignModal(true);
  }

  function openEdit(assignment) {
    setEditTarget(assignment);
    setAssignModal(true);
  }

  function openEnroll(assignment) {
    setEnrollTarget(assignment);
    setEnrollModal(true);
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this assignment? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await fetch(`${API_BASE}/api/assignments/${id}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setAssignments((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  function handleSaved(saved) {
    setAssignModal(false);
    if (editTarget) {
      setAssignments((prev) => prev.map((a) => (a.id === saved.id ? { ...a, ...saved } : a)));
    } else {
      setAssignments((prev) => [saved, ...prev]);
    }
  }

  function handleEnrollSaved() {
    setEnrollModal(false);
    fetchAssignments(); // refresh enrollment counts
  }

  return (
    <AppLayout
      title="AI Mentor"
      roleLabel="Teacher"
      userLabel={currentUser?.name || currentUser?.email}
      onLogout={handleLogout}
      navItems={navItems}
      maxWidth="xl"
      showPageTitle={false}
    >
      <SectionCard
        title="Assignments"
        action={
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openCreate}>
            New Assignment
          </Button>
        }
      >
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : assignments.length === 0 ? (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography color="text.secondary" gutterBottom>
              No assignments yet.
            </Typography>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
              Create your first assignment
            </Button>
          </Box>
        ) : (
          <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                  <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Problem</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Due Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Students</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Grades</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{a.title}</Typography>
                      {a.description && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", maxWidth: 240 }}>
                          {a.description}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2">{a.problem?.title ?? "—"}</Typography>
                      {a.problem?.language && (
                        <Chip label={a.problem.language} size="small" variant="outlined" sx={{ mt: 0.25 }} />
                      )}
                    </TableCell>

                    <TableCell>{formatDue(a.dueDate)}</TableCell>

                    <TableCell align="center">
                      <Typography variant="body2" fontWeight={600}>
                        {a.enrollments?.length ?? 0}
                      </Typography>
                    </TableCell>

                    <TableCell align="center">
                      <Typography variant="body2" fontWeight={600}>
                        {a._count?.grades ?? 0}
                      </Typography>
                    </TableCell>

                    <TableCell align="center">
                      <Chip
                        label={a.isPublished ? "Published" : "Draft"}
                        size="small"
                        color={a.isPublished ? "success" : "default"}
                        variant={a.isPublished ? "filled" : "outlined"}
                      />
                    </TableCell>

                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Enroll students">
                          <IconButton size="small" color="primary" onClick={() => openEnroll(a)}>
                            <GroupAddIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(a)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDelete(a.id)}
                            disabled={deletingId === a.id}
                          >
                            {deletingId === a.id
                              ? <CircularProgress size={16} />
                              : <DeleteIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      <AssignmentModal
        open={assignModal}
        onClose={() => setAssignModal(false)}
        onSaved={handleSaved}
        assignment={editTarget}
        problems={problems}
        token={token}
      />

      <EnrollModal
        open={enrollModal}
        onClose={() => setEnrollModal(false)}
        onSaved={handleEnrollSaved}
        assignment={enrollTarget}
        token={token}
      />
    </AppLayout>
  );
}
