import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon    from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon   from "@mui/icons-material/Edit";

import AppLayout from "../../components/layout/AppLayout";
import StudentDetailModal from "../../components/teacher/StudentDetailModal";
import StudentProgressTable from "../../components/teacher/StudentProgressTable";
import { API_BASE } from "../../apiBase";

// ── Group Modal (create / edit) ───────────────────────────────────────────────
function GroupModal({ open, onClose, onSave, allStudents, initialGroup }) {
  const [name,      setName]      = useState("");
  const [selected,  setSelected]  = useState(new Set());
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [search,    setSearch]    = useState("");

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setName(initialGroup?.name ?? "");
      setSelected(new Set(initialGroup?.members?.map((m) => m.id) ?? []));
      setError("");
      setSearch("");
    }
  }, [open, initialGroup]);

  function toggleStudent(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filteredStudents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredStudents.map((s) => s.id)));
    }
  }

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allStudents;
    return allStudents.filter(
      (s) => s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q),
    );
  }, [allStudents, search]);

  async function handleSave() {
    if (!name.trim()) { setError("Group name is required."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), memberIds: [...selected] });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save group.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initialGroup ? "Edit Group" : "Create New Group"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Group Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus
          />

          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Select Students
                {selected.size > 0 && (
                  <Chip label={selected.size} size="small" color="primary" sx={{ ml: 1 }} />
                )}
              </Typography>
              <Button size="small" onClick={toggleAll} variant="text">
                {selected.size === filteredStudents.length && filteredStudents.length > 0
                  ? "Deselect all"
                  : "Select all"}
              </Button>
            </Stack>

            <TextField
              size="small"
              placeholder="Search students…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              fullWidth
              sx={{ mb: 1 }}
            />

            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                maxHeight: 280,
                overflowY: "auto",
              }}
            >
              {filteredStudents.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
                  No students found.
                </Typography>
              ) : (
                filteredStudents.map((s, idx) => (
                  <Box
                    key={s.id}
                    onClick={() => toggleStudent(s.id)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      px: 2,
                      py: 1.25,
                      cursor: "pointer",
                      bgcolor: selected.has(s.id) ? "rgba(79,70,229,0.08)" : "transparent",
                      borderBottom: idx < filteredStudents.length - 1 ? 1 : 0,
                      borderColor: "divider",
                      "&:hover": { bgcolor: selected.has(s.id) ? "rgba(79,70,229,0.12)" : "rgba(148,163,184,0.06)" },
                      transition: "background-color 0.15s",
                    }}
                  >
                    <Box
                      sx={{
                        width: 18,
                        height: 18,
                        borderRadius: 0.5,
                        border: 2,
                        borderColor: selected.has(s.id) ? "primary.main" : "divider",
                        bgcolor: selected.has(s.id) ? "primary.main" : "transparent",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {selected.has(s.id) && (
                        <Box component="span" sx={{ color: "white", fontSize: 12, lineHeight: 1 }}>✓</Box>
                      )}
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{s.email}</Typography>
                    </Box>
                  </Box>
                ))
              )}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : initialGroup ? "Update Group" : "Create Group"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StudentsPage({ currentUser, token, handleLogout, navItems }) {
  const [students,             setStudents]             = useState([]);
  const [studentsLoading,      setStudentsLoading]      = useState(true);
  const [groups,               setGroups]               = useState([]);
  const [groupsLoading,        setGroupsLoading]        = useState(true);

  const [activeTab,            setActiveTab]            = useState(0); // 0 = All Students
  const [groupModalOpen,       setGroupModalOpen]       = useState(false);
  const [editingGroup,         setEditingGroup]         = useState(null);
  const [deleteGroupTarget,    setDeleteGroupTarget]    = useState(null);
  const [deletingGroup,        setDeletingGroup]        = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  }), [token]);

  const fetchJson = useCallback(
    (path, opts = {}) =>
      fetch(`${API_BASE}${path}`, { headers: authHeaders, ...opts }).then((r) => r.json()),
    [authHeaders],
  );

  // ── Fetch students ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setStudentsLoading(true);
    fetchJson("/api/teacher/students")
      .then((body) => {
        const totalProblems = body.meta?.totalProblems ?? 1;
        const rows = (body.data ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          completed: s.distinctProblemsSolved ?? 0,
          total: totalProblems,
          progress: totalProblems > 0
            ? Math.round(((s.distinctProblemsSolved ?? 0) / totalProblems) * 100)
            : 0,
        }));
        setStudents(rows);
      })
      .catch((err) => console.error("students fetch failed:", err))
      .finally(() => setStudentsLoading(false));
  }, [token, fetchJson]);

  // ── Fetch groups ─────────────────────────────────────────────────────────
  const fetchGroups = useCallback(() => {
    if (!token) return;
    setGroupsLoading(true);
    fetchJson("/api/teacher/groups")
      .then((body) => setGroups(body.data ?? []))
      .catch((err) => console.error("groups fetch failed:", err))
      .finally(() => setGroupsLoading(false));
  }, [token, fetchJson]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // ── Active group's students ──────────────────────────────────────────────
  const displayedStudents = useMemo(() => {
    if (activeTab === 0) return students; // All Students
    const group = groups[activeTab - 1];
    if (!group) return students;
    const memberIds = new Set(group.members.map((m) => m.id));
    return students.filter((s) => memberIds.has(s.id));
  }, [activeTab, students, groups]);

  // ── studentId → group names map ─────────────────────────────────────────
  const studentGroupMap = useMemo(() => {
    const map = {};
    for (const group of groups) {
      for (const member of group.members) {
        if (!map[member.id]) map[member.id] = [];
        map[member.id].push(group.name);
      }
    }
    return map;
  }, [groups]);

  // ── Group CRUD ───────────────────────────────────────────────────────────
  async function handleSaveGroup({ name, memberIds }) {
    if (editingGroup) {
      const res = await fetch(`${API_BASE}/api/teacher/groups/${editingGroup.id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ name, memberIds }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to update group");
    } else {
      const res = await fetch(`${API_BASE}/api/teacher/groups`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name, memberIds }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create group");
    }
    fetchGroups();
  }

  async function handleDeleteGroup() {
    if (!deleteGroupTarget) return;
    setDeletingGroup(true);
    try {
      await fetch(`${API_BASE}/api/teacher/groups/${deleteGroupTarget.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      // If we were viewing the deleted group, go back to "All"
      if (activeTab > 0 && groups[activeTab - 1]?.id === deleteGroupTarget.id) {
        setActiveTab(0);
      }
      setDeleteGroupTarget(null);
      fetchGroups();
    } catch (err) {
      console.error("delete group failed:", err);
    } finally {
      setDeletingGroup(false);
    }
  }

  // ── Student detail ───────────────────────────────────────────────────────
  function handleStudentClick(student) {
    setSelectedStudent(student);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AppLayout
      title="AI Mentor"
      userLabel={currentUser?.name || currentUser?.email || "Teacher"}
      onLogout={handleLogout}
      navItems={navItems}
      maxWidth="xl"
      headerVariant="teacher"
      roleLabel="Teacher"
      showPageTitle={false}
    >
      <Stack spacing={3}>

        {/* ── Group tabs ─────────────────────────────────────────────────── */}
        <Box>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>Students</Typography>
            <Tooltip title="Create a new student group">
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => { setEditingGroup(null); setGroupModalOpen(true); }}
              >
                Create New Group
              </Button>
            </Tooltip>
          </Stack>

          {groupsLoading ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">Loading groups…</Typography>
            </Box>
          ) : (
            <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
              <Tabs
                value={activeTab}
                onChange={(_, v) => setActiveTab(v)}
                variant="scrollable"
                scrollButtons="auto"
              >
                <Tab label={`All Students (${students.length})`} value={0} />
                {groups.map((g, idx) => (
                  <Tab
                    key={g.id}
                    value={idx + 1}
                    label={
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        <span>{g.name}</span>
                        <Chip label={g.members.length} size="small" variant="outlined" sx={{ height: 18, fontSize: 11 }} />
                        <Tooltip title="Edit group">
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); setEditingGroup(g); setGroupModalOpen(true); }}
                            sx={{ p: 0.25 }}
                          >
                            <EditIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete group">
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); setDeleteGroupTarget(g); }}
                            sx={{ p: 0.25, color: "error.main" }}
                          >
                            <DeleteIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    }
                  />
                ))}
              </Tabs>
            </Box>
          )}
        </Box>

        {/* ── Student table (filtered by selected group) ──────────────── */}
        <StudentProgressTable
          students={displayedStudents}
          loading={studentsLoading}
          onStudentClick={handleStudentClick}
          studentGroupMap={studentGroupMap}
        />

      </Stack>

      {/* ── Create / Edit group modal ─────────────────────────────────── */}
      <GroupModal
        open={groupModalOpen}
        onClose={() => { setGroupModalOpen(false); setEditingGroup(null); }}
        onSave={handleSaveGroup}
        allStudents={students}
        initialGroup={editingGroup}
      />

      {/* ── Delete confirmation ───────────────────────────────────────── */}
      <Dialog open={Boolean(deleteGroupTarget)} onClose={() => setDeleteGroupTarget(null)}>
        <DialogTitle>Delete Group</DialogTitle>
        <DialogContent>
          <Typography>
            Delete group <strong>{deleteGroupTarget?.name}</strong>? Students will not be removed from the
            platform, only from this group.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteGroupTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteGroup} disabled={deletingGroup}>
            {deletingGroup ? "Deleting…" : "Delete Group"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Student detail modal ──────────────────────────────────────── */}
      <StudentDetailModal
        open={Boolean(selectedStudent)}
        onClose={() => setSelectedStudent(null)}
        student={selectedStudent}
        token={token}
      />
    </AppLayout>
  );
}
