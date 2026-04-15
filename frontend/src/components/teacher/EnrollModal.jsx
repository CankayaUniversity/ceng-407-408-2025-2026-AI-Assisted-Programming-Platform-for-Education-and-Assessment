import { useEffect, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Checkbox,
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
  Typography,
} from "@mui/material";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import { API_BASE } from "../../apiBase";

export default function EnrollModal({ open, onClose, onSaved, assignment, token }) {
  const [students,  setStudents]  = useState([]);
  const [selected,  setSelected]  = useState(new Set());
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  // Load students + current enrollments whenever modal opens
  useEffect(() => {
    if (!open || !assignment?.id || !token) return;
    setError("");
    setLoading(true);

    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_BASE}/api/teacher/students`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/api/assignments/${assignment.id}`, { headers }).then((r) => r.json()),
    ])
      .then(([stuRes, assRes]) => {
        const allStudents    = stuRes?.data ?? [];
        const enrolledIds    = new Set(
          (assRes?.data?.enrollments ?? []).map((e) => e.userId),
        );
        setStudents(allStudents);
        setSelected(enrolledIds);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, assignment?.id, token]);

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

  async function handleSave() {
    if (!assignment?.id) return;
    setSaving(true);
    setError("");
    try {
      // Replace enrollments: unenroll everyone, then re-enroll selected
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

      // Unenroll currently enrolled students not in new selection
      const currentlyEnrolled = students.filter((s) =>
        // We'll handle this by fetching current enrollments and diffing
        false, // placeholder — handled below
      );
      void currentlyEnrolled;

      // Fetch current enrollments fresh
      const assRes   = await fetch(`${API_BASE}/api/assignments/${assignment.id}`, { headers });
      const assData  = await assRes.json();
      const existing = new Set((assData?.data?.enrollments ?? []).map((e) => e.userId));

      // Unenroll removed
      const toRemove = [...existing].filter((id) => !selected.has(id));
      await Promise.all(
        toRemove.map((uid) =>
          fetch(`${API_BASE}/api/assignments/${assignment.id}/enroll/${uid}`, {
            method: "DELETE",
            headers,
          }),
        ),
      );

      // Enroll added
      const toAdd = [...selected].filter((id) => !existing.has(id));
      if (toAdd.length > 0) {
        await fetch(`${API_BASE}/api/assignments/${assignment.id}/enroll`, {
          method:  "POST",
          headers,
          body:    JSON.stringify({ studentIds: toAdd }),
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
        {error && <Typography color="error" variant="body2" sx={{ mb: 1 }}>{error}</Typography>}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : students.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
            No students registered yet.
          </Typography>
        ) : (
          <>
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
                    primary={s.name || "(no name)"}
                    secondary={s.email}
                    primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}
                    secondaryTypographyProps={{ variant: "caption" }}
                  />
                </ListItem>
              ))}
            </List>
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
