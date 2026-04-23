import { useEffect, useState } from "react";
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
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { API_BASE } from "../../apiBase";

const ALL_LANGUAGES = [
  { value: "python",     label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "c",          label: "C" },
  { value: "cpp",        label: "C++" },
  { value: "csharp",     label: "C#" },
];

const EMPTY = {
  title:            "",
  description:      "",
  problemId:        "",
  dueDate:          "",
  isPublished:      false,
  allowedLanguages: [],   // empty = all languages allowed
  lateDeadline:     "",
  lateDeduction:    0,
};

export default function AssignmentModal({ open, onClose, onSaved, assignment, problems, token }) {
  const isEdit = Boolean(assignment?.id);

  const [form,   setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (assignment) {
      setForm({
        title:            assignment.title            ?? "",
        description:      assignment.description      ?? "",
        problemId:        assignment.problemId        ?? "",
        dueDate:          assignment.dueDate
          ? new Date(assignment.dueDate).toISOString().slice(0, 16)
          : "",
        isPublished:      assignment.isPublished      ?? false,
        allowedLanguages: assignment.allowedLanguages ?? [],
        lateDeadline:     assignment.lateDeadline
          ? new Date(assignment.lateDeadline).toISOString().slice(0, 16)
          : "",
        lateDeduction:    assignment.lateDeduction    ?? 0,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, assignment]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  }

  function toggleLanguage(lang) {
    setForm((prev) => {
      const has  = prev.allowedLanguages.includes(lang);
      const next = has
        ? prev.allowedLanguages.filter((l) => l !== lang)
        : [...prev.allowedLanguages, lang];
      return { ...prev, allowedLanguages: next };
    });
  }

  async function handleSave() {
    if (!form.title.trim()) { setError("Title is required."); return; }
    if (!form.problemId)    { setError("Please select a problem."); return; }
    if (form.lateDeadline && form.dueDate && form.lateDeadline <= form.dueDate) {
      setError("Late submission deadline must be after the due date."); return;
    }
    if (form.lateDeduction < 0 || form.lateDeduction > 100) {
      setError("Late deduction must be between 0 and 100%."); return;
    }

    setSaving(true);
    setError("");
    try {
      const url    = isEdit
        ? `${API_BASE}/api/assignments/${assignment.id}`
        : `${API_BASE}/api/assignments`;
      const method = isEdit ? "PUT" : "POST";

      const body = {
        title:            form.title.trim(),
        description:      form.description.trim() || null,
        problemId:        Number(form.problemId),
        dueDate:          form.dueDate          || null,
        isPublished:      form.isPublished,
        allowedLanguages: form.allowedLanguages,
        lateDeadline:     form.lateDeadline     || null,
        lateDeduction:    Number(form.lateDeduction) || 0,
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

  const allSelected = form.allowedLanguages.length === 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Typography variant="h6" fontWeight={700}>
          {isEdit ? "Edit Assignment" : "New Assignment"}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            required fullWidth autoFocus
          />

          <TextField
            label="Description (optional)"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            multiline minRows={2} fullWidth
          />

          {/* ── Problem selector ─────────────────────────────── */}
          <FormControl fullWidth required>
            <InputLabel>Problem</InputLabel>
            <Select
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

          {/* ── Deadline ─────────────────────────────────────── */}
          <TextField
            label="Due Date (optional)"
            type="datetime-local"
            value={form.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
            fullWidth InputLabelProps={{ shrink: true }}
          />

          {/* ── Allowed languages ────────────────────────────── */}
          <Box>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Allowed Languages
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              <Chip
                label="All languages"
                size="small"
                variant={allSelected ? "filled" : "outlined"}
                color={allSelected ? "primary" : "default"}
                onClick={() => set("allowedLanguages", [])}
                sx={{ cursor: "pointer" }}
              />
              {ALL_LANGUAGES.map((lang) => {
                const checked = form.allowedLanguages.includes(lang.value);
                return (
                  <Chip
                    key={lang.value}
                    label={lang.label}
                    size="small"
                    variant={checked ? "filled" : "outlined"}
                    color={checked ? "primary" : "default"}
                    onClick={() => toggleLanguage(lang.value)}
                    sx={{ cursor: "pointer" }}
                  />
                );
              })}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {allSelected
                ? "Students may submit in any language."
                : `Only: ${form.allowedLanguages.join(", ")}`}
            </Typography>
          </Box>

          <Divider />

          {/* ── Late submission ───────────────────────────────── */}
          <Box>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Late Submission
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Late Deadline (optional)"
                type="datetime-local"
                value={form.lateDeadline}
                onChange={(e) => set("lateDeadline", e.target.value)}
                fullWidth InputLabelProps={{ shrink: true }}
                helperText="Students may still submit after the due date until this deadline, with a point deduction."
              />
              <TextField
                label="Point Deduction (%)"
                type="number"
                value={form.lateDeduction}
                onChange={(e) => set("lateDeduction", Math.min(100, Math.max(0, Number(e.target.value))))}
                InputProps={{
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  inputProps: { min: 0, max: 100 },
                }}
                sx={{ maxWidth: 200 }}
                helperText="Deducted from final score for late submissions."
              />
            </Stack>
          </Box>

          <Divider />

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
