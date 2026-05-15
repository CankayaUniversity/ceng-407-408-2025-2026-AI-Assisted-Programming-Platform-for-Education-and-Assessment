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
  FormLabel,
  InputAdornment,
  InputLabel,
  ListSubheader,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import GroupAddIcon         from "@mui/icons-material/GroupAdd";
import { API_BASE } from "../../apiBase";
import ProblemForm, { EMPTY_FORM } from "./ProblemForm";
import EnrollModal from "./EnrollModal";

const ASSIGNMENT_MODES = [
  { value: "homework", label: "Homework",  color: "#6366f1" },
  { value: "practice", label: "Practice",  color: "#22c55e" },
  { value: "exam",     label: "Exam",      color: "#ef4444" },
];

const EMPTY = {
  title:               "",
  description:         "",
  problemId:           "",
  mode:                "homework",
  examType:            "unscheduled",   // "scheduled" | "unscheduled"
  startDate:           "",
  dueDate:             "",
  isPublished:         false,
  allowedLanguages:    [],
  lateDeadline:        "",
  lateDeduction:       0,
  // Per-student enrollment chosen during creation. Synced to the backend
  // after the assignment is saved. Empty array = no one specifically
  // enrolled (the teacher can still publish to all via `isPublished`).
  enrolledStudentIds:  [],
};

// ── Date helpers ─────────────────────────────────────────────────────────────
// datetime-local inputs expect "YYYY-MM-DDTHH:MM" in the user's LOCAL timezone.
// JS's toISOString() always returns UTC — so we must format manually.

function toLocalISO(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function localNow() {
  return toLocalISO(new Date());
}

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

  // ── "Enroll students" sub-dialog (select mode) ─────────────────────────────
  const [enrollPickerOpen, setEnrollPickerOpen] = useState(false);

  // ── Combined problem list: upstream prop + anything created inline ──────────
  const allProblems = [...(problems ?? []), ...inlineProblems];

  useEffect(() => {
    if (!open) return;
    setError("");
    setInlineProblems([]);
    if (assignment) {
      setForm({
        title:               assignment.title            ?? "",
        description:         assignment.description      ?? "",
        problemId:           assignment.problemId        ?? "",
        mode:                assignment.mode             ?? "homework",
        examType:            assignment.examType         ?? "unscheduled",
        // Use toLocalISO so the datetime-local input shows the teacher's local time,
        // not the UTC representation of the stored ISO string.
        startDate:           toLocalISO(assignment.startDate),
        dueDate:             toLocalISO(assignment.dueDate),
        isPublished:         assignment.isPublished      ?? false,
        allowedLanguages:    assignment.allowedLanguages ?? [],
        lateDeadline:        toLocalISO(assignment.lateDeadline),
        lateDeduction:       assignment.lateDeduction    ?? 0,
        // Pre-populated below from the API since `assignment` rarely includes
        // enrollments. Loaded asynchronously after this initial render.
        enrolledStudentIds:  [],
      });
      // Fetch existing enrollments for this assignment so the inline picker
      // reflects the current state when the teacher reopens the form.
      if (assignment.id && token) {
        fetch(`${API_BASE}/api/assignments/${assignment.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((data) => {
            const ids = (data?.data?.enrollments ?? []).map((e) => e.userId);
            setForm((prev) => ({ ...prev, enrolledStudentIds: ids }));
          })
          .catch(() => { /* non-fatal — picker just starts empty */ });
      }
    } else {
      setForm(EMPTY);
    }
  }, [open, assignment, token]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  }

  /**
   * Select a problem from the question bank AND auto-fill the assignment's
   * title + description from the problem's own title + description. The teacher
   * can still edit those fields afterwards if they want a per-assignment
   * override (e.g. "Edit Distance — HW3"). Picking a different problem
   * overwrites again, by design.
   */
  function setProblemId(id) {
    const problem = allProblems.find((p) => p.id === Number(id));
    setForm((prev) => ({
      ...prev,
      problemId:   id,
      // Auto-fill only when a real problem is found. If `problem` is missing
      // (e.g. the dropdown was cleared), keep whatever the teacher had.
      ...(problem ? {
        title:       problem.title       ?? prev.title,
        description: problem.description ?? prev.description,
      } : {}),
    }));
    setError("");
  }

  // ── Save assignment ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.title.trim())  { setError("Title is required."); return; }
    if (!form.problemId)     { setError("Please select a problem."); return; }
    if (form.mode === "exam" && form.examType === "scheduled" && !form.startDate) {
      setError("A start date is required for scheduled exams."); return;
    }

    // ── Past-date guard (new assignments only) ────────────────────────────
    // When editing an existing assignment the teacher may not change every date,
    // so we only reject a date that is BOTH set AND in the past AND is a new
    // assignment (isEdit === false). Editing keeps whatever dates exist.
    if (!isEdit) {
      const nowMs = Date.now();
      if (form.startDate && new Date(form.startDate).getTime() <= nowMs) {
        setError("Start date/time must be in the future."); return;
      }
      if (form.dueDate && new Date(form.dueDate).getTime() <= nowMs) {
        setError("Due date/time must be in the future."); return;
      }
      if (form.lateDeadline && new Date(form.lateDeadline).getTime() <= nowMs) {
        setError("Late submission deadline must be in the future."); return;
      }
    }

    if (form.mode === "exam" && form.examType === "scheduled" && form.dueDate && form.startDate >= form.dueDate) {
      setError("Exam end date must be after the start date."); return;
    }
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

      // Convert datetime-local strings (timezone-naive) to full ISO strings so
      // Node.js on the backend receives the correct UTC time instead of treating
      // the local time as UTC (which would shift by the teacher's UTC offset).
      const toISO = (s) => s ? new Date(s).toISOString() : null;

      // allowedLanguages is no longer chosen on the assignment form.
      // We derive it from the selected problem so a JS problem can never be
      // assigned with a C-only allow-list (the previous bug: teacher picked
      // JS question + C language → student got JS starter + C compiler).
      const selectedProblem  = allProblems.find((p) => p.id === Number(form.problemId));
      const allowedLanguages =
        selectedProblem?.languages?.length ? selectedProblem.languages
        : selectedProblem?.language        ? [selectedProblem.language]
        : [];

      const body = {
        title:            form.title.trim(),
        description:      form.description.trim() || null,
        problemId:        Number(form.problemId),
        mode:             form.mode,
        examType:         form.mode === "exam" ? form.examType : null,
        startDate:        form.mode === "exam" && form.examType === "scheduled" ? toISO(form.startDate) : null,
        dueDate:          toISO(form.dueDate),
        isPublished:      form.isPublished,
        allowedLanguages,
        lateDeadline:     toISO(form.lateDeadline),
        lateDeduction:    Number(form.lateDeduction) || 0,
      };

      const res  = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      // ── Sync per-student enrollments after the assignment is saved ─────────
      // We use the same diff-and-apply strategy as EnrollModal: remove students
      // no longer in the selection, add ones newly in it. For new assignments
      // (no prior enrollments) this is just a single POST.
      const newAssignment = data.data;
      try {
        const headers  = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
        const wanted   = new Set(form.enrolledStudentIds);

        // Fetch current enrollments for this assignment to compute the diff.
        // For new assignments this returns an empty list.
        const currentRes  = await fetch(`${API_BASE}/api/assignments/${newAssignment.id}`, { headers });
        const currentData = await currentRes.json();
        const existing    = new Set((currentData?.data?.enrollments ?? []).map((e) => e.userId));

        const toRemove = [...existing].filter((id) => !wanted.has(id));
        const toAdd    = [...wanted].filter((id) => !existing.has(id));

        await Promise.all(
          toRemove.map((uid) =>
            fetch(`${API_BASE}/api/assignments/${newAssignment.id}/enroll/${uid}`, {
              method: "DELETE", headers,
            }),
          ),
        );
        if (toAdd.length > 0) {
          await fetch(`${API_BASE}/api/assignments/${newAssignment.id}/enroll`, {
            method: "POST", headers,
            body: JSON.stringify({ studentIds: toAdd }),
          });
        }
      } catch (enrollErr) {
        // Enrollment sync failure is non-fatal — the assignment was saved.
        // Surface a soft warning so the teacher can re-enroll via the
        // assignments-list "Enroll" button if something went wrong.
        console.warn("[AssignmentModal] enrollment sync failed:", enrollErr);
      }

      onSaved(newAssignment);
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

      // Auto-select the new problem AND auto-fill title + description.
      setProblemId(newProblem.id);

      // Notify parent to refresh question bank for future sessions
      onProblemsChanged?.();

      setNewQOpen(false);
    } catch (err) {
      setNewQError(err.message);
    } finally {
      setNewQSaving(false);
    }
  }

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

            {/* ── Problem selector — FIRST. Picking a problem auto-fills the
                   title and description fields below (still editable). The
                   problem's language is used implicitly; there is no
                   separate language picker. ─────────────────────────────── */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <FormControl fullWidth required>
                  <InputLabel>Problem (from Question Bank)</InputLabel>
                  <Select
                    value={form.problemId}
                    label="Problem (from Question Bank)"
                    onChange={(e) => setProblemId(e.target.value)}
                  >
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

              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: "block" }}>
                Selecting a problem auto-fills the title and description below — you can still edit them for this assignment if you want a different label.
              </Typography>

              {/* Show newly-created problem confirmation */}
              {inlineProblems.length > 0 && (
                <Alert severity="success" sx={{ mt: 1 }}>
                  "{inlineProblems[inlineProblems.length - 1].title}" was added to the Question Bank and selected.
                </Alert>
              )}
            </Box>

            <TextField
              label="Title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required fullWidth
              helperText="Auto-filled from the selected problem. Edit if you want a per-assignment label."
            />

            <TextField
              label="Description (optional)"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              multiline minRows={2} fullWidth
              helperText="Auto-filled from the selected problem. Edit to customise per assignment."
            />

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

            {/* ── Exam type (only when mode = exam) ─────────────────────── */}
            {form.mode === "exam" && (
              <Box sx={{ border: 1, borderColor: "error.light", borderRadius: 2, p: 1.5 }}>
                <FormControl component="fieldset">
                  <FormLabel component="legend" sx={{ fontSize: 13, fontWeight: 700, mb: 0.5, color: "error.main" }}>
                    Exam Type
                  </FormLabel>
                  <RadioGroup
                    row
                    value={form.examType}
                    onChange={(e) => set("examType", e.target.value)}
                  >
                    <FormControlLabel
                      value="unscheduled"
                      control={<Radio size="small" color="error" />}
                      label={<Typography variant="body2">Unscheduled — students can start any time before the deadline</Typography>}
                    />
                    <FormControlLabel
                      value="scheduled"
                      control={<Radio size="small" color="error" />}
                      label={<Typography variant="body2">Scheduled — exam opens at a specific time and closes at the deadline</Typography>}
                    />
                  </RadioGroup>
                </FormControl>

                {form.examType === "scheduled" && (
                  <TextField
                    label="Exam Start Date & Time"
                    type="datetime-local"
                    value={form.startDate}
                    onChange={(e) => set("startDate", e.target.value)}
                    fullWidth InputLabelProps={{ shrink: true }}
                    inputProps={{ min: localNow() }}
                    helperText="Students cannot see exam content before this time."
                    sx={{ mt: 1.5 }}
                    error={!form.startDate}
                  />
                )}
              </Box>
            )}

            {/* ── Deadline ──────────────────────────────────────────────── */}
            <TextField
              label={form.mode === "exam" && form.examType === "scheduled" ? "Exam End Date & Time" : "Due Date (optional)"}
              type="datetime-local"
              value={form.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
              fullWidth InputLabelProps={{ shrink: true }}
              inputProps={{
                min: form.mode === "exam" && form.examType === "scheduled" && form.startDate
                  ? form.startDate
                  : localNow(),
              }}
              helperText={form.mode === "exam" && form.examType === "scheduled" ? "Students cannot submit after this time." : undefined}
            />

            {/* ── Allowed languages section removed ──────────────────────
                The assignment's allowed-languages list is now derived from
                the selected problem on save. The teacher's only "language"
                input is choosing the problem itself — which prevents the old
                bug where a JS problem could be assigned with a C-only allow-
                list, leaving the student with a JS editor + C compiler. */}

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
                  inputProps={{ min: form.dueDate || localNow() }}
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

            {/* ── Enroll Students ──────────────────────────────────────────
                Lets the teacher pick specific students/groups at creation
                time. Without this, an assignment is "published to all" but
                no one is enrolled. After save we POST the picked IDs to
                /api/assignments/:id/enroll. */}
            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                p: 1.5,
                bgcolor: "background.default",
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Box>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Enroll Students
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {form.enrolledStudentIds.length === 0
                      ? "No students selected. Pick individuals or whole groups to enroll."
                      : `${form.enrolledStudentIds.length} student${form.enrolledStudentIds.length !== 1 ? "s" : ""} will be enrolled when you save.`}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<GroupAddIcon />}
                  onClick={() => setEnrollPickerOpen(true)}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  {form.enrolledStudentIds.length === 0 ? "Pick students" : "Change selection"}
                </Button>
              </Stack>
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

      {/* ── Enroll-students picker (select mode — no API calls until the
             parent AssignmentModal is saved). Reuses the same component the
             "Enroll" button on the assignments-list opens. ──────────────── */}
      <EnrollModal
        open={enrollPickerOpen}
        onClose={() => setEnrollPickerOpen(false)}
        mode="select"
        token={token}
        // Pass a stub "assignment" so the dialog title shows the current
        // working title even before save.
        assignment={{ title: form.title || (isEdit ? assignment?.title : "New assignment") }}
        initialSelected={form.enrolledStudentIds}
        onSelectionSave={(ids) => {
          set("enrolledStudentIds", ids);
          setEnrollPickerOpen(false);
        }}
      />
    </>
  );
}
