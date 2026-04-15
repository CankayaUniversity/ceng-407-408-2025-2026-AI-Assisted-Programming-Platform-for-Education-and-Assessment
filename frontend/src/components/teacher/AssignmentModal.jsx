import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { API_BASE } from "../../apiBase";

const EMPTY = {
  title:       "",
  description: "",
  problemId:   "",
  dueDate:     "",
  isPublished: false,
};

export default function AssignmentModal({ open, onClose, onSaved, assignment, problems, token }) {
  const isEdit = Boolean(assignment?.id);

  const [form,   setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  // Populate form when editing
  useEffect(() => {
    if (!open) return;
    setError("");
    if (assignment) {
      setForm({
        title:       assignment.title       ?? "",
        description: assignment.description ?? "",
        problemId:   assignment.problemId   ?? "",
        dueDate:     assignment.dueDate
          ? new Date(assignment.dueDate).toISOString().slice(0, 16)
          : "",
        isPublished: assignment.isPublished ?? false,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, assignment]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  }

  async function handleSave() {
    if (!form.title.trim()) { setError("Title is required."); return; }
    if (!form.problemId)    { setError("Please select a problem."); return; }

    setSaving(true);
    setError("");
    try {
      const url    = isEdit
        ? `${API_BASE}/api/assignments/${assignment.id}`
        : `${API_BASE}/api/assignments`;
      const method = isEdit ? "PUT" : "POST";

      const body = {
        title:       form.title.trim(),
        description: form.description.trim() || null,
        problemId:   Number(form.problemId),
        dueDate:     form.dueDate || null,
        isPublished: form.isPublished,
      };

      const res  = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      onSaved(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Typography variant="h6" fontWeight={700}>
          {isEdit ? "Edit Assignment" : "New Assignment"}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 0.5 }}>
          {error && (
            <Typography color="error" variant="body2">{error}</Typography>
          )}

          <TextField
            label="Title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            required
            fullWidth
            autoFocus
          />

          <TextField
            label="Description (optional)"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />

          <FormControl fullWidth required>
            <InputLabel id="problem-select-label">Problem</InputLabel>
            <Select
              labelId="problem-select-label"
              value={form.problemId}
              label="Problem"
              onChange={(e) => set("problemId", e.target.value)}
            >
              {(problems ?? []).map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.title}
                  {p.language && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      ({p.language})
                    </Typography>
                  )}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Due Date (optional)"
            type="datetime-local"
            value={form.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />

          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={form.isPublished}
                  onChange={(e) => set("isPublished", e.target.checked)}
                  color="primary"
                />
              }
              label="Published (visible to enrolled students)"
            />
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={14} /> : null}
        >
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
