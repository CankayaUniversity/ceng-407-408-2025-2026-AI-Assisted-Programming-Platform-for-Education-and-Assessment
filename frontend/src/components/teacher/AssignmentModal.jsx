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
  ListSubheader,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import { API_BASE } from "../../apiBase";
import ProblemForm, { EMPTY_FORM } from "./ProblemForm";

const ALL_LANGUAGES = [
  { value: "python",     label: "Python"     },
  { value: "javascript", label: "JavaScript" },
  { value: "c",          label: "C"          },
  { value: "cpp",        label: "C++"        },
  { value: "csharp",     label: "C#"         },
  { value: "java",       label: "Java"       },
];

const ASSIGNMENT_MODES = [
  { value: "homework", label: "Homework",  color: "#6366f1" },
  { value: "practice", label: "Practice",  color: "#22c55e" },
  { value: "exam",     label: "Exam",      color: "#ef4444" },
];

const EMPTY = {
  title:            "",
  description:      "",
  problemId:        "",
  mode:             "homework",
  dueDate:          "",
  isPublished:      false,
  allowedLanguages: [],
  lateDeadline:     "",
  lateDeduction:    0,
};

export default function AssignmentModal({
  open,
  onClose,
  onSaved,
  assignment,
  problems,
  token,
  onProblemsChanged,   // () => void — called after a new problem is created
}) {
  const isEdit = Boolean(assignment?.id);

  const [form,   setForm]   = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  // ── Extra problems created inline (appear in dropdown immediately) ──────────
  const [inlineProblems, setInlineProblems] = useState([]);

  // ── "New Question" sub-dialog ───────────────────────────────────────────────
  const [newQOpen,    setNewQOpen]    = useState(false);
  const [newQForm,    setNewQForm]    = useState({ ...EMPTY_FORM });
  const [newQSaving,  setNewQSaving]  = useState(false);
  const [newQError,   setNewQError]   = useState("");

  // ── Combined problem list: upstream prop + anything created inline ──────────
  const allProblems = [...(problems ?? []), ...inlineProblems];

  useEffect(() => {
    if (!open) return;
    setError("");
    setInlineProblems([]);
    if (assignment) {
      setForm({
        title:            assignment.title            ?? "",
        description:      assignment.description      ?? "",
        problemId:        assignment.problemId        ?? "",
        mode:             assignment.mode             ?? "homework",
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

  // ── Save assignment ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.title.trim())  { setError("Title is required."); return; }
    if (!form.problemId)     { setError("Please select a problem."); return; }
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
        mode:             form.mode,
        dueDate:          form.dueDate       || null,
        isPublished:      form.isPublished,
        allowedLanguages: form.allowedLanguages,
        lateDeadline:     form.lateDeadline  || null,
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

  // ── Create new problem inline ───────────────────────────────────────────────
  function openNewQuestion() {
    setNewQForm({ ...EMPTY_FORM, testCases: [{ input: "", expectedOutput: "", isHidden: false }] });
    setNewQError("");
    setNewQOpen(true);
  }

  async function handleCreateNewQuestion() {
    if (!newQForm.title.trim() || !newQForm.description.trim()) {
      setNewQError("Title and description are required.");
      return;
    }
    setNewQSaving(true);
    setNewQError("");
    try {
      const res = await fetch(`${API_BASE}/api/problems`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title:             newQForm.title,
          description:       newQForm.description,
          difficulty:        newQForm.difficulty,
          languages:         newQForm.languages,
          language:          newQForm.languages[0] ?? "python",
          tags:              newQForm.tags,
          category:          newQForm.tags[0] ?? null,
          starterCode:       newQForm.starterCode       || null,
          referenceSolution: newQForm.referenceSolution || null,
          testCases:         newQForm.testCases.filter((tc) => tc.input || tc.expectedOutput),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create problem");

      const newProblem = body.data;

      // Add to inline list so it appears in dropdown immediately
      setInlineProblems((prev) => [...prev, newProblem]);

      // Auto-select the new problem
      set("problemId", newProblem.id);

      // Notify parent to refresh question bank for future sessions
      onProblemsChanged?.();

      setNewQOpen(false);
    } catch (err) {
      setNewQError(err.message);
    } finally {
      setNewQSaving(false);
    }
  }

  const allSelected = form.allowedLanguages.length === 0;

  return (
    <>
      {/* ── Main assignment dialog ──────────────────────────────────────── */}
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

            {/* ── Problem selector + New Question button ──────────────── */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <FormControl fullWidth required>
                  <InputLabel>Problem</InputLabel>
                  <Select
                    value={form.problemId}
                    label="Problem"
                    onChange={(e) => set("problemId", e.target.value)}
                  >
                    {/* Existing problems */}
                    {allProblems.length > 0 && (
                      <ListSubheader sx={{ lineHeight: "32px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
                        QUESTION BANK
                      </ListSubheader>
                    )}
                    {allProblems.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ width: "100%" }}>
                          <Typography sx={{ flex: 1 }}>{p.title}</Typography>
                          {p.difficulty && (
                            <Chip
                              label={p.difficulty}
                              size="small"
                              sx={{ fontSize: 10, height: 18 }}
                            />
                          )}
                          {p.language && (
                            <Typography variant="caption" color="text.secondary">
                              {p.language}
                            </Typography>
                          )}
                        </Stack>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Tooltip title="Create a new question and add it to the Question Bank">
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={openNewQuestion}
                    sx={{ mt: 0.5, minWidth: "auto", px: 1.5, height: 56, whiteSpace: "nowrap" }}
                    startIcon={<AddCircleOutlineIcon />}
                  >
                    New
                  </Button>
                </Tooltip>
              </Stack>

              {/* Show newly-created problem confirmation */}
              {inlineProblems.length > 0 && (
                <Alert severity="success" sx={{ mt: 1 }}>
                  "{inlineProblems[inlineProblems.length - 1].title}" was added to the Question Bank and selected.
                </Alert>
              )}
            </Box>

            {/* ── Assignment Mode ────────────────────────────────────────── */}
            <Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Assignment Mode
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {ASSIGNMENT_MODES.map((m) => {
                  const selected = form.mode === m.value;
                  return (
                    <Chip
                      key={m.value}
                      label={m.label}
                      size="small"
                      variant={selected ? "filled" : "outlined"}
                      onClick={() => set("mode", m.value)}
                      sx={{
                        cursor: "pointer",
                        fontWeight: selected ? 700 : 400,
                        ...(selected
                          ? { bgcolor: m.color, color: "#fff", borderColor: m.color }
                          : { borderColor: m.color, color: m.color }),
                      }}
                    />
                  );
                })}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                {form.mode === "exam"
                  ? "Exam — stricter conditions; AI mentor may be limited by system policy."
                  : form.mode === "practice"
                  ? "Practice — no deadline pressure; students can attempt freely."
                  : "Homework — standard graded assignment with optional deadline."}
              </Typography>
            </Box>

            {/* ── Deadline ──────────────────────────────────────────────── */}
            <TextField
              label="Due Date (optional)"
              type="datetime-local"
              value={form.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
              fullWidth InputLabelProps={{ shrink: true }}
            />

            {/* ── Allowed languages ─────────────────────────────────────── */}
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

            {/* ── Late submission ───────────────────────────────────────── */}
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

      {/* ── "New Question" sub-dialog ───────────────────────────────────── */}
      <Dialog
        open={newQOpen}
        onClose={() => setNewQOpen(false)}
        fullWidth
        maxWidth="md"
        scroll="paper"
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>Create New Question</Typography>
          <Typography variant="body2" color="text.secondary">
            The question will be saved to the Question Bank and automatically selected.
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <ProblemForm
            form={newQForm}
            setForm={setNewQForm}
            onSave={handleCreateNewQuestion}
            onCancel={() => setNewQOpen(false)}
            saving={newQSaving}
            error={newQError}
            submitLabel="Create & Select"
            compact
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNewQOpen(false)} disabled={newQSaving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateNewQuestion}
            disabled={newQSaving}
            startIcon={newQSaving ? <CircularProgress size={14} /> : null}
          >
            {newQSaving ? "Creating…" : "Create & Select"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
