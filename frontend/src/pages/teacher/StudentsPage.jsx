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
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon        from "@mui/icons-material/Add";
import DeleteIcon     from "@mui/icons-material/Delete";
import EditIcon       from "@mui/icons-material/Edit";
import PeopleIcon     from "@mui/icons-material/People";
import PersonIcon     from "@mui/icons-material/Person";

import AppLayout             from "../../components/layout/AppLayout";
import StudentDetailModal    from "../../components/teacher/StudentDetailModal";
import StudentProgressTable  from "../../components/teacher/StudentProgressTable";
import { API_BASE }          from "../../apiBase";
import { YEAR_OPTIONS, yearLabel } from "../../lib/classYear";

// Year chip colour map (mirrors StudentProgressTable)
const YEAR_COLORS = { 1: "primary", 2: "secondary", 3: "success", 4: "warning", 5: "info" };

// ── Assign-to-Teacher Modal ───────────────────────────────────────────────────
function AssignToTeacherModal({ open, onClose, onAssign, teachers, allStudents }) {
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selected,          setSelected]          = useState(new Set());
  const [saving,            setSaving]            = useState(false);
  const [error,             setError]             = useState("");
  const [search,            setSearch]            = useState("");
  const [yearFilter,        setYearFilter]        = useState(0);

  // Reset state whenever the modal opens
  useEffect(() => {
    if (open) {
      setSelectedTeacherId("");
      setSelected(new Set());
      setError("");
      setSearch("");
      setYearFilter(0);
    }
  }, [open]);

  // When a teacher is picked, pre-check all students already assigned to them
  useEffect(() => {
    if (!selectedTeacherId) { setSelected(new Set()); return; }
    const tid = Number(selectedTeacherId);
    setSelected(new Set(
      allStudents
        .filter((s) => s.assignedTeacher?.id === tid)
        .map((s) => s.id),
    ));
  }, [selectedTeacherId, allStudents]);

  function toggleStudent(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filteredStudents = useMemo(() => {
    let list = allStudents;
    if (yearFilter !== 0) list = list.filter((s) => s.classYear === yearFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(
      (s) => s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q),
    );
    return list;
  }, [allStudents, search, yearFilter]);

  const allVisibleSelected =
    filteredStudents.length > 0 && filteredStudents.every((s) => selected.has(s.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredStudents.forEach((s) => next.delete(s.id));
      } else {
        filteredStudents.forEach((s) => next.add(s.id));
      }
      return next;
    });
  }

  function selectYear(year) {
    setSelected((prev) => {
      const next = new Set(prev);
      allStudents.filter((s) => s.classYear === year).forEach((s) => next.add(s.id));
      return next;
    });
  }

  const usedYears = useMemo(() => {
    const years = new Set(allStudents.map((s) => s.classYear).filter(Boolean));
    return [...years].sort();
  }, [allStudents]);

  const selectedTeacher = teachers.find((t) => t.id === Number(selectedTeacherId));

  async function handleAssign() {
    if (!selectedTeacherId) { setError("Please select a teacher first."); return; }
    if (selected.size === 0) { setError("Select at least one student."); return; }
    setSaving(true);
    setError("");
    try {
      await onAssign(Number(selectedTeacherId), [...selected]);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to assign students.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <PeopleIcon color="primary" />
          <span>Assign Students to Teacher</span>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* ── Step 1: Pick a teacher ─────────────────────────────── */}
          <TextField
            select
            label="Teacher *"
            value={selectedTeacherId}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
            fullWidth
            size="small"
            helperText="Students currently assigned to this teacher will be pre-selected."
          >
            <MenuItem value=""><em>— Select a teacher —</em></MenuItem>
            {teachers.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <PersonIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>{t.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{t.email}</Typography>
                  </Box>
                </Box>
              </MenuItem>
            ))}
          </TextField>

          <Divider />

          {/* ── Step 2: Select students ────────────────────────────── */}
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Students
                {selected.size > 0 && (
                  <Chip label={selected.size} size="small" color="primary" sx={{ ml: 1 }} />
                )}
              </Typography>
              <Button size="small" onClick={toggleAll} variant="text" disabled={!selectedTeacherId}>
                {allVisibleSelected ? "Deselect all" : "Select all"}
              </Button>
            </Stack>

            {/* Year quick-add */}
            {usedYears.length > 0 && (
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                {usedYears.map((y) => {
                  const count = allStudents.filter((s) => s.classYear === y).length;
                  return (
                    <Chip
                      key={y}
                      label={`+ All ${yearLabel(y)} (${count})`}
                      size="small"
                      color={YEAR_COLORS[y] ?? "default"}
                      variant="outlined"
                      onClick={() => selectYear(y)}
                      disabled={!selectedTeacherId}
                      sx={{ cursor: "pointer", fontWeight: 600 }}
                    />
                  );
                })}
              </Stack>
            )}

            {/* Search + year filter */}
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <TextField
                size="small"
                placeholder="Search students…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ flex: 1 }}
                disabled={!selectedTeacherId}
              />
              <Box
                component="select"
                value={yearFilter}
                onChange={(e) => setYearFilter(Number(e.target.value))}
                disabled={!selectedTeacherId}
                sx={{
                  minWidth: 120,
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  px: 1,
                  bgcolor: "background.paper",
                  color: "text.primary",
                  fontSize: 13,
                  cursor: "pointer",
                  opacity: !selectedTeacherId ? 0.5 : 1,
                }}
              >
                {YEAR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Box>
            </Stack>

            {/* Student list */}
            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                maxHeight: 300,
                overflowY: "auto",
                opacity: !selectedTeacherId ? 0.45 : 1,
                pointerEvents: !selectedTeacherId ? "none" : "auto",
                transition: "opacity 0.2s",
              }}
            >
              {filteredStudents.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
                  No students found.
                </Typography>
              ) : (
                filteredStudents.map((s, idx) => {
                  const isSelected = selected.has(s.id);
                  const currentTeacher = s.assignedTeacher;
                  const assignedElsewhere =
                    currentTeacher && currentTeacher.id !== Number(selectedTeacherId);

                  return (
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
                        bgcolor: isSelected ? "rgba(79,70,229,0.08)" : "transparent",
                        borderBottom: idx < filteredStudents.length - 1 ? 1 : 0,
                        borderColor: "divider",
                        "&:hover": {
                          bgcolor: isSelected ? "rgba(79,70,229,0.12)" : "rgba(148,163,184,0.06)",
                        },
                        transition: "background-color 0.15s",
                      }}
                    >
                      {/* Checkbox */}
                      <Box
                        sx={{
                          width: 18, height: 18, borderRadius: 0.5, border: 2, flexShrink: 0,
                          borderColor: isSelected ? "primary.main" : "divider",
                          bgcolor: isSelected ? "primary.main" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {isSelected && (
                          <Box component="span" sx={{ color: "white", fontSize: 12, lineHeight: 1 }}>✓</Box>
                        )}
                      </Box>

                      {/* Name + email */}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{s.email}</Typography>
                      </Box>

                      {/* Year badge */}
                      {s.classYear && (
                        <Chip
                          label={yearLabel(s.classYear)}
                          size="small"
                          color={YEAR_COLORS[s.classYear] ?? "default"}
                          sx={{ fontWeight: 600, fontSize: 11, height: 20 }}
                        />
                      )}

                      {/* Current assignment indicator */}
                      {assignedElsewhere && (
                        <Chip
                          label={currentTeacher.name}
                          size="small"
                          variant="outlined"
                          icon={<PersonIcon style={{ fontSize: 11 }} />}
                          sx={{
                            height: 20, fontSize: 10,
                            "& .MuiChip-label": { px: 0.5 },
                            color: "text.secondary",
                            borderColor: "divider",
                          }}
                        />
                      )}
                    </Box>
                  );
                })
              )}
            </Box>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleAssign}
          disabled={saving || !selectedTeacherId || selected.size === 0}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
        >
          {saving
            ? "Assigning…"
            : selected.size > 0 && selectedTeacher
              ? `Assign ${selected.size} student${selected.size !== 1 ? "s" : ""} to ${selectedTeacher.name}`
              : "Assign"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Group Modal (create / edit) ───────────────────────────────────────────────
function GroupModal({ open, onClose, onSave, allStudents, initialGroup }) {
  const [name,      setName]      = useState("");
  const [selected,  setSelected]  = useState(new Set());
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [search,    setSearch]    = useState("");
  const [yearFilter, setYearFilter] = useState(0);

  useEffect(() => {
    if (open) {
      setName(initialGroup?.name ?? "");
      setSelected(new Set(initialGroup?.members?.map((m) => m.id) ?? []));
      setError("");
      setSearch("");
      setYearFilter(0);
    }
  }, [open, initialGroup]);

  function toggleStudent(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filteredStudents = useMemo(() => {
    let list = allStudents;
    if (yearFilter !== 0) list = list.filter((s) => s.classYear === yearFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(
      (s) => s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q),
    );
    return list;
  }, [allStudents, search, yearFilter]);

  function toggleAll() {
    if (filteredStudents.every((s) => selected.has(s.id))) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredStudents.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredStudents.forEach((s) => next.add(s.id));
        return next;
      });
    }
  }

  function selectYear(year) {
    setSelected((prev) => {
      const next = new Set(prev);
      allStudents.filter((s) => s.classYear === year).forEach((s) => next.add(s.id));
      return next;
    });
  }

  const usedYears = useMemo(() => {
    const years = new Set(allStudents.map((s) => s.classYear).filter(Boolean));
    return [...years].sort();
  }, [allStudents]);

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

  const allVisibleSelected = filteredStudents.length > 0 && filteredStudents.every((s) => selected.has(s.id));

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

          {/* ── Year quick-add buttons ────────────────────────── */}
          {usedYears.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                Quick-add by year:
              </Typography>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {usedYears.map((y) => {
                  const count = allStudents.filter((s) => s.classYear === y).length;
                  return (
                    <Chip
                      key={y}
                      label={`+ All ${yearLabel(y)} (${count})`}
                      size="small"
                      color={YEAR_COLORS[y] ?? "default"}
                      variant="outlined"
                      onClick={() => selectYear(y)}
                      sx={{ cursor: "pointer", fontWeight: 600 }}
                    />
                  );
                })}
              </Stack>
            </Box>
          )}

          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Select Students
                {selected.size > 0 && (
                  <Chip label={selected.size} size="small" color="primary" sx={{ ml: 1 }} />
                )}
              </Typography>
              <Button size="small" onClick={toggleAll} variant="text">
                {allVisibleSelected ? "Deselect all" : "Select all"}
              </Button>
            </Stack>

            {/* Search + year filter row */}
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <TextField
                size="small"
                placeholder="Search students…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ flex: 1 }}
              />
              <Box
                component="select"
                value={yearFilter}
                onChange={(e) => setYearFilter(Number(e.target.value))}
                sx={{
                  minWidth: 120,
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  px: 1,
                  bgcolor: "background.paper",
                  color: "text.primary",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {YEAR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Box>
            </Stack>

            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                maxHeight: 260,
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
                    {/* Checkbox */}
                    <Box
                      sx={{
                        width: 18, height: 18, borderRadius: 0.5, border: 2, flexShrink: 0,
                        borderColor: selected.has(s.id) ? "primary.main" : "divider",
                        bgcolor: selected.has(s.id) ? "primary.main" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {selected.has(s.id) && (
                        <Box component="span" sx={{ color: "white", fontSize: 12, lineHeight: 1 }}>✓</Box>
                      )}
                    </Box>

                    {/* Name + email */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{s.email}</Typography>
                    </Box>

                    {/* Year badge */}
                    {s.classYear && (
                      <Chip
                        label={yearLabel(s.classYear)}
                        size="small"
                        color={YEAR_COLORS[s.classYear] ?? "default"}
                        sx={{ fontWeight: 600, fontSize: 11, height: 20 }}
                      />
                    )}
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
  const isAdmin = currentUser?.isAdmin === true;

  const [students,        setStudents]        = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [groups,          setGroups]          = useState([]);
  const [groupsLoading,   setGroupsLoading]   = useState(true);
  const [teachers,        setTeachers]        = useState([]);   // admin only

  const [activeTab,           setActiveTab]           = useState(0);
  const [yearFilter,          setYearFilter]          = useState(0);
  const [groupModalOpen,      setGroupModalOpen]      = useState(false);
  const [editingGroup,        setEditingGroup]        = useState(null);
  const [deleteGroupTarget,   setDeleteGroupTarget]   = useState(null);
  const [deletingGroup,       setDeletingGroup]       = useState(false);
  const [selectedStudent,     setSelectedStudent]     = useState(null);
  const [assignModalOpen,     setAssignModalOpen]     = useState(false);

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

  // ── Shared student-list refresh ──────────────────────────────────────────
  const refreshStudents = useCallback(async () => {
    const body = await fetchJson("/api/teacher/students");
    const totalProblems = body.meta?.totalProblems ?? 1;
    return (body.data ?? []).map((s) => ({
      id:              s.id,
      name:            s.name,
      email:           s.email,
      classYear:       s.classYear ?? null,
      completed:       s.distinctProblemsSolved ?? 0,
      total:           totalProblems,
      progress:        totalProblems > 0
        ? Math.round(((s.distinctProblemsSolved ?? 0) / totalProblems) * 100)
        : 0,
      assignedTeacher: s.assignedTeacher ?? null,
    }));
  }, [fetchJson]);

  // ── Fetch students ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setStudentsLoading(true);
    refreshStudents()
      .then(setStudents)
      .catch((err) => console.error("students fetch failed:", err))
      .finally(() => setStudentsLoading(false));
  }, [token, refreshStudents]);

  // ── Fetch teachers (admin only) ──────────────────────────────────────────
  useEffect(() => {
    if (!token || !isAdmin) return;
    fetchJson("/api/admin/teachers")
      .then((body) => setTeachers(body.data ?? []))
      .catch((err) => console.error("teachers fetch failed:", err));
  }, [token, isAdmin, fetchJson]);

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

  // ── Students shown in the table (tab + year filter) ──────────────────────
  const tabStudents = useMemo(() => {
    if (activeTab === 0) return students;
    const group = groups[activeTab - 1];
    if (!group) return students;
    const memberIds = new Set(group.members.map((m) => m.id));
    return students.filter((s) => memberIds.has(s.id));
  }, [activeTab, students, groups]);

  const displayedStudents = useMemo(() => {
    if (yearFilter === 0) return tabStudents;
    return tabStudents.filter((s) => s.classYear === yearFilter);
  }, [tabStudents, yearFilter]);

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

  // ── Admin: bulk assign students to a teacher ─────────────────────────────
  async function handleBulkAssign(teacherId, studentIds) {
    const res = await fetch(`${API_BASE}/api/admin/teacher-students/bulk`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ teacherId, studentIds }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Assignment failed");
    // Refresh student list so TEACHER chips update
    const rows = await refreshStudents();
    setStudents(rows);
  }

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
      if (activeTab > 0 && groups[activeTab - 1]?.id === deleteGroupTarget.id) setActiveTab(0);
      setDeleteGroupTarget(null);
      fetchGroups();
    } catch (err) {
      console.error("delete group failed:", err);
    } finally {
      setDeletingGroup(false);
    }
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

        {/* ── Header row ──────────────────────────────────────────────── */}
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>Students</Typography>

          {/* Admin-only: assign students to teacher */}
          {isAdmin && (
            <Tooltip title="Pick a teacher and select which students to assign">
              <Button
                variant="outlined"
                size="small"
                startIcon={<PeopleIcon />}
                onClick={() => setAssignModalOpen(true)}
                disabled={teachers.length === 0}
              >
                Assign to Teacher
              </Button>
            </Tooltip>
          )}

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

        {/* ── Year filter chips ────────────────────────────────────────── */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {YEAR_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={
                opt.value === 0
                  ? `All Years (${students.length})`
                  : `${opt.label} (${students.filter((s) => s.classYear === opt.value).length})`
              }
              onClick={() => setYearFilter(opt.value)}
              color={yearFilter === opt.value ? (YEAR_COLORS[opt.value] ?? "primary") : "default"}
              variant={yearFilter === opt.value ? "filled" : "outlined"}
              sx={{ fontWeight: 600, cursor: "pointer" }}
            />
          ))}
        </Stack>

        {/* ── Group tabs ──────────────────────────────────────────────── */}
        {groupsLoading ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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

        {/* ── Admin info banner ─────────────────────────────────────── */}
        {isAdmin && (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            You are viewing all students as admin. Use <strong>Assign to Teacher</strong> to
            bulk-assign students. The <strong>Teacher</strong> column shows current assignments.
          </Alert>
        )}

        {/* ── Student table ─────────────────────────────────────────── */}
        <StudentProgressTable
          students={displayedStudents}
          loading={studentsLoading}
          onStudentClick={setSelectedStudent}
          studentGroupMap={studentGroupMap}
          showTeacherColumn={isAdmin}
        />

      </Stack>

      {/* ── Assign to Teacher modal (admin only) ────────────────────── */}
      <AssignToTeacherModal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        onAssign={handleBulkAssign}
        teachers={teachers}
        allStudents={students}
      />

      {/* ── Create / Edit group modal ────────────────────────────────── */}
      <GroupModal
        open={groupModalOpen}
        onClose={() => { setGroupModalOpen(false); setEditingGroup(null); }}
        onSave={handleSaveGroup}
        allStudents={students}
        initialGroup={editingGroup}
      />

      {/* ── Delete confirmation ──────────────────────────────────────── */}
      <Dialog open={Boolean(deleteGroupTarget)} onClose={() => setDeleteGroupTarget(null)}>
        <DialogTitle>Delete Group</DialogTitle>
        <DialogContent>
          <Typography>
            Delete group <strong>{deleteGroupTarget?.name}</strong>? Students will not be removed
            from the platform, only from this group.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteGroupTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteGroup} disabled={deletingGroup}>
            {deletingGroup ? "Deleting…" : "Delete Group"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Student detail modal ─────────────────────────────────────── */}
      <StudentDetailModal
        open={Boolean(selectedStudent)}
        onClose={() => setSelectedStudent(null)}
        student={selectedStudent}
        token={token}
      />
    </AppLayout>
  );
}
