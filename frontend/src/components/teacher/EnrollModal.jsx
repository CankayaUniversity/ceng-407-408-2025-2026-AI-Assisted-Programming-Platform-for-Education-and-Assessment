import { useEffect, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import GroupAddIcon  from "@mui/icons-material/GroupAdd";
import GroupIcon     from "@mui/icons-material/Group";
import PersonIcon    from "@mui/icons-material/Person";
import { API_BASE } from "../../apiBase";

export default function EnrollModal({ open, onClose, onSaved, assignment, token }) {
  const [students, setStudents] = useState([]);
  const [groups,   setGroups]   = useState([]);   // [{ id, name, members: [{id,name,email}] }]
  const [selected, setSelected] = useState(new Set());
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  // Load students, groups, and current enrollments whenever modal opens
  useEffect(() => {
    if (!open || !assignment?.id || !token) return;
    setError("");
    setLoading(true);

    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_BASE}/api/teacher/students`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/api/teacher/groups`,   { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/api/assignments/${assignment.id}`, { headers }).then((r) => r.json()),
    ])
      .then(([stuRes, grpRes, assRes]) => {
        const allStudents = stuRes?.data ?? [];
        const allGroups   = grpRes?.data ?? [];
        const enrolledIds = new Set(
          (assRes?.data?.enrollments ?? []).map((e) => e.userId),
        );
        setStudents(allStudents);
        setGroups(allGroups);
        setSelected(enrolledIds);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, assignment?.id, token]);

  // ── Individual student toggle ──────────────────────────────────────────────
  function toggleStudent(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === students.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(students.map((s) => s.id)));
    }
  }

  // ── Group toggle — adds/removes all group members ──────────────────────────
  function groupState(group) {
    const memberIds = group.members.map((m) => m.id);
    if (memberIds.length === 0) return "none";
    const selectedCount = memberIds.filter((id) => selected.has(id)).length;
    if (selectedCount === 0)              return "none";
    if (selectedCount === memberIds.length) return "all";
    return "partial";
  }

  function toggleGroup(group) {
    const memberIds = group.members.map((m) => m.id);
    const state = groupState(group);
    setSelected((prev) => {
      const next = new Set(prev);
      if (state === "all") {
        // deselect all members
        memberIds.forEach((id) => next.delete(id));
      } else {
        // select all members
        memberIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!assignment?.id) return;
    setSaving(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

      const assRes   = await fetch(`${API_BASE}/api/assignments/${assignment.id}`, { headers });
      const assData  = await assRes.json();
      const existing = new Set((assData?.data?.enrollments ?? []).map((e) => e.userId));

      const toRemove = [...existing].filter((id) => !selected.has(id));
      await Promise.all(
        toRemove.map((uid) =>
          fetch(`${API_BASE}/api/assignments/${assignment.id}/enroll/${uid}`, {
            method: "DELETE", headers,
          }),
        ),
      );

      const toAdd = [...selected].filter((id) => !existing.has(id));
      if (toAdd.length > 0) {
        await fetch(`${API_BASE}/api/assignments/${assignment.id}/enroll`, {
          method: "POST",
          headers,
          body:   JSON.stringify({ studentIds: toAdd }),
        });
      }

      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const allChecked  = students.length > 0 && selected.size === students.length;
  const someChecked = selected.size > 0 && selected.size < students.length;

  // Build a map: studentId → group names they belong to
  const studentGroupMap = {};
  for (const group of groups) {
    for (const member of group.members) {
      if (!studentGroupMap[member.id]) studentGroupMap[member.id] = [];
      studentGroupMap[member.id].push(group.name);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <GroupAddIcon color="primary" />
          <Box>
            <Typography variant="h6" fontWeight={700}>Enroll Students</Typography>
            {assignment?.title && (
              <Typography variant="body2" color="text.secondary" noWrap>
                {assignment.title}
              </Typography>
            )}
          </Box>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Typography color="error" variant="body2" sx={{ mb: 1 }}>{error}</Typography>
        )}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* ── Groups section ─────────────────────────────── */}
            {groups.length > 0 && (
              <>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <GroupIcon fontSize="small" color="primary" />
                  <Typography variant="subtitle2" fontWeight={700}>
                    Groups
                  </Typography>
                </Stack>

                <Stack spacing={0.5} sx={{ mb: 1.5 }}>
                  {groups.map((group) => {
                    const state = groupState(group);
                    const checked     = state === "all";
                    const indeterminate = state === "partial";
                    return (
                      <Box
                        key={group.id}
                        onClick={() => toggleGroup(group)}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          px: 1.5,
                          py: 0.75,
                          borderRadius: 1.5,
                          border: "1px solid",
                          borderColor: checked ? "primary.main" : "divider",
                          bgcolor: checked ? "primary.50" : "transparent",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        <Checkbox
                          checked={checked}
                          indeterminate={indeterminate}
                          size="small"
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleGroup(group)}
                          sx={{ p: 0 }}
                        />
                        <GroupIcon fontSize="small" color={checked ? "primary" : "action"} />
                        <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
                          {group.name}
                        </Typography>
                        <Tooltip title={group.members.map((m) => m.name || m.email).join(", ") || "No members"}>
                          <Chip
                            label={`${group.members.length} student${group.members.length !== 1 ? "s" : ""}`}
                            size="small"
                            variant="outlined"
                            color={checked ? "primary" : "default"}
                          />
                        </Tooltip>
                      </Box>
                    );
                  })}
                </Stack>

                <Divider sx={{ mb: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">or pick individually</Typography>
                </Divider>
              </>
            )}

            {/* ── Individual students section ─────────────────── */}
            {students.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                No students registered yet.
              </Typography>
            ) : (
              <>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <PersonIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2" fontWeight={700}>
                    Individual Students
                  </Typography>
                </Stack>

                <FormControlLabel
                  sx={{ ml: 0.5, mb: 0.5 }}
                  control={
                    <Checkbox
                      checked={allChecked}
                      indeterminate={someChecked}
                      onChange={toggleAll}
                    />
                  }
                  label={
                    <Typography variant="body2" fontWeight={600}>
                      Select all ({students.length})
                    </Typography>
                  }
                />
                <Divider />
                <List disablePadding dense>
                  {students.map((s) => (
                    <ListItem
                      key={s.id}
                      disableGutters
                      secondaryAction={
                        <Checkbox
                          edge="end"
                          checked={selected.has(s.id)}
                          onChange={() => toggleStudent(s.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      }
                      sx={{ cursor: "pointer" }}
                      onClick={() => toggleStudent(s.id)}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ width: 32, height: 32, fontSize: 13 }}>
                          {(s.name || s.email || "?")[0].toUpperCase()}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap">
                            <Typography variant="body2" fontWeight={600}>
                              {s.name || "(no name)"}
                            </Typography>
                            {(studentGroupMap[s.id] ?? []).map((gName) => (
                              <Chip
                                key={gName}
                                label={gName}
                                size="small"
                                icon={<GroupIcon style={{ fontSize: 12 }} />}
                                variant="outlined"
                                color="primary"
                                sx={{ height: 18, fontSize: 10, "& .MuiChip-label": { px: 0.75 } }}
                              />
                            ))}
                          </Stack>
                        }
                        secondary={s.email}
                        secondaryTypographyProps={{ variant: "caption" }}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, justifyContent: "space-between" }}>
        <Typography variant="body2" color="text.secondary">
          {selected.size} student{selected.size !== 1 ? "s" : ""} selected
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || loading}
            startIcon={saving ? <CircularProgress size={14} /> : null}
          >
            {saving ? "Saving…" : "Save Enrollment"}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
