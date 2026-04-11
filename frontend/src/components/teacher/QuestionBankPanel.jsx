import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteIcon      from "@mui/icons-material/Delete";
import EditIcon        from "@mui/icons-material/Edit";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import SectionCard from "../common/SectionCard";
import VariationReviewModal from "./VariationReviewModal";
import { API_BASE } from "../../apiBase";

const EMPTY_FORM = {
  title: "",
  description: "",
  difficulty: "Easy",
  language: "python",
  category: "",
  starterCode: "",
  referenceSolution: "",
  testCases: [{ input: "", expectedOutput: "", isHidden: false }],
};

function normalizeDifficulty(value = "Easy") {
  const label = String(value).toLowerCase();
  if (label.includes("hard")) return { label: "Hard", tone: "#FEE2E2", color: "#DC2626" };
  if (label.includes("medium")) return { label: "Medium", tone: "#FEF3C7", color: "#D97706" };
  return { label: "Easy", tone: "#DCFCE7", color: "#16A34A" };
}

function ProblemForm({ form, setForm, onSave, onCancel, saving, error, submitLabel }) {
  function updateTestCase(idx, field, value) {
    setForm((prev) => {
      const updated = [...prev.testCases];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, testCases: updated };
    });
  }

  function addTestCase() {
    setForm((prev) => ({
      ...prev,
      testCases: [...prev.testCases, { input: "", expectedOutput: "", isHidden: false }],
    }));
  }

  function removeTestCase(idx) {
    setForm((prev) => ({
      ...prev,
      testCases: prev.testCases.filter((_, i) => i !== idx),
    }));
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, borderRadius: 3, border: 1, borderColor: "rgba(148,163,184,0.20)", mb: 3 }}>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          label="Problem Title *"
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          fullWidth
        />

        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField
            select label="Difficulty" value={form.difficulty}
            onChange={(e) => setForm((prev) => ({ ...prev, difficulty: e.target.value }))}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="Easy">Easy</MenuItem>
            <MenuItem value="Medium">Medium</MenuItem>
            <MenuItem value="Hard">Hard</MenuItem>
          </TextField>

          <TextField
            select label="Language" value={form.language}
            onChange={(e) => setForm((prev) => ({ ...prev, language: e.target.value }))}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="javascript">JavaScript</MenuItem>
            <MenuItem value="python">Python</MenuItem>
            <MenuItem value="c">C</MenuItem>
            <MenuItem value="cpp">C++</MenuItem>
            <MenuItem value="csharp">C#</MenuItem>
          </TextField>

          <TextField
            label="Category / Topic"
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
            fullWidth
          />
        </Stack>

        <TextField
          label="Description *"
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          multiline minRows={4} fullWidth
        />

        <TextField
          label="Starter Code"
          value={form.starterCode}
          onChange={(e) => setForm((prev) => ({ ...prev, starterCode: e.target.value }))}
          multiline minRows={3} fullWidth
          sx={{ "& textarea": { fontFamily: "monospace", fontSize: 13 } }}
        />

        <TextField
          label="Reference Solution (hidden from students)"
          value={form.referenceSolution}
          onChange={(e) => setForm((prev) => ({ ...prev, referenceSolution: e.target.value }))}
          multiline minRows={3} fullWidth
          sx={{ "& textarea": { fontFamily: "monospace", fontSize: 13 } }}
        />

        <Divider />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Test Cases</Typography>

        {form.testCases.map((tc, idx) => (
          <Stack key={idx} direction={{ xs: "column", md: "row" }} spacing={1} alignItems="flex-start">
            <TextField
              label={`Input #${idx + 1}`}
              value={tc.input}
              onChange={(e) => updateTestCase(idx, "input", e.target.value)}
              multiline minRows={1} fullWidth size="small"
              sx={{ "& textarea": { fontFamily: "monospace", fontSize: 13 } }}
            />
            <TextField
              label="Expected Output"
              value={tc.expectedOutput}
              onChange={(e) => updateTestCase(idx, "expectedOutput", e.target.value)}
              multiline minRows={1} fullWidth size="small"
              sx={{ "& textarea": { fontFamily: "monospace", fontSize: 13 } }}
            />
            <TextField
              select label="Visibility" value={tc.isHidden ? "hidden" : "public"} size="small"
              onChange={(e) => updateTestCase(idx, "isHidden", e.target.value === "hidden")}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="public">Public</MenuItem>
              <MenuItem value="hidden">Hidden</MenuItem>
            </TextField>
            <IconButton onClick={() => removeTestCase(idx)} disabled={form.testCases.length <= 1} size="small" color="error">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}

        <Button variant="outlined" size="small" onClick={addTestCase} sx={{ alignSelf: "flex-start" }}>
          + Add Test Case
        </Button>

        <Divider />

        <Stack direction="row" spacing={1.5}>
          <Button variant="contained" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : submitLabel}
          </Button>
          <Button variant="outlined" onClick={onCancel}>Cancel</Button>
        </Stack>
      </Stack>
    </Box>
  );
}

export default function QuestionBankPanel({ items = [], token, onProblemsChanged }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ── Variation state ──────────────────────────────────────────────────────
  const [variationSource,  setVariationSource]  = useState(null);   // the source problem object
  const [variationType,    setVariationType]    = useState(null);   // "harder" | "easier" | "similar"
  const [variationModalOpen, setVariationModalOpen] = useState(false);

  function openVariation(item, type) {
    setVariationSource(item);
    setVariationType(type);
    setVariationModalOpen(true);
  }

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  function resetForm() {
    setForm({ ...EMPTY_FORM, testCases: [{ input: "", expectedOutput: "", isHidden: false }] });
    setError("");
  }

  async function handleCreate() {
    if (!form.title.trim() || !form.description.trim()) {
      setError("Title and description are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/problems`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          difficulty: form.difficulty,
          language: form.language,
          category: form.category || null,
          starterCode: form.starterCode || null,
          referenceSolution: form.referenceSolution || null,
          tags: form.category ? [form.category] : [],
          testCases: form.testCases.filter((tc) => tc.input || tc.expectedOutput),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create problem");
      resetForm();
      setCreateOpen(false);
      onProblemsChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(item) {
    setEditingItem(item);
    setCreateOpen(false);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/problems/${item.id}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const body = await res.json();
      const p = body.data ?? {};
      setForm({
        title: p.title ?? "",
        description: p.description ?? "",
        difficulty: p.difficulty ?? "Easy",
        language: p.language ?? "javascript",
        category: p.tags?.[0] ?? "",
        starterCode: p.starterCode ?? "",
        referenceSolution: p.referenceSolution ?? "",
        testCases: (p.testCases ?? []).length > 0
          ? p.testCases.map((tc) => ({ input: tc.input, expectedOutput: tc.expectedOutput, isHidden: tc.isHidden }))
          : [{ input: "", expectedOutput: "", isHidden: false }],
      });
    } catch {
      setForm({ ...EMPTY_FORM, title: item.title, description: item.description ?? "" });
    }
  }

  async function handleUpdate() {
    if (!editingItem) return;
    if (!form.title.trim() || !form.description.trim()) {
      setError("Title and description are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/problems/${editingItem.id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          difficulty: form.difficulty,
          language: form.language,
          category: form.category || null,
          starterCode: form.starterCode || null,
          referenceSolution: form.referenceSolution || null,
          tags: form.category ? [form.category] : [],
          testCases: form.testCases.filter((tc) => tc.input || tc.expectedOutput),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to update problem");
      setEditingItem(null);
      resetForm();
      onProblemsChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/problems/${deleteTarget.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to delete");
      }
      setDeleteTarget(null);
      onProblemsChanged?.();
    } catch (err) {
      console.error("delete failed:", err);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <SectionCard
        title="Question Bank Management"
        action={
          !editingItem && (
            <Button variant="contained" onClick={() => { setCreateOpen((prev) => !prev); setEditingItem(null); resetForm(); }}>
              {createOpen ? "Close Form" : "Create New Problem"}
            </Button>
          )
        }
      >
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5 }}>
          Create, edit, and manage problems with test cases
        </Typography>

        <Collapse in={createOpen && !editingItem} unmountOnExit>
          <ProblemForm
            form={form} setForm={setForm}
            onSave={handleCreate} onCancel={() => { setCreateOpen(false); resetForm(); }}
            saving={saving} error={error} submitLabel="Create Problem"
          />
        </Collapse>

        <Collapse in={Boolean(editingItem)} unmountOnExit>
          <ProblemForm
            form={form} setForm={setForm}
            onSave={handleUpdate} onCancel={() => { setEditingItem(null); resetForm(); }}
            saving={saving} error={error} submitLabel="Update Problem"
          />
        </Collapse>

        <Stack divider={<Divider flexItem />}>
          {items.map((item) => {
            const difficulty = normalizeDifficulty(item.difficulty);
            return (
              <Box
                key={item.id}
                sx={{
                  py: 3,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  alignItems: { xs: "flex-start", lg: "center" },
                  flexDirection: { xs: "column", lg: "row" },
                }}
              >
                {/* ── Problem info ──────────────────────────────────── */}
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>{item.title}</Typography>
                    <Chip label={difficulty.label} size="small" sx={{ bgcolor: difficulty.tone, color: difficulty.color }} />
                    {item.topic && <Chip label={item.topic} size="small" variant="outlined" />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {item.usageCount} total attempts
                  </Typography>
                </Box>

                {/* ── Action buttons ────────────────────────────────── */}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} flexWrap="wrap" useFlexGap>

                  {/* AI Variation buttons */}
                  <Tooltip title="Generate an easier version with AI">
                    <Button
                      variant="outlined"
                      size="small"
                      color="success"
                      startIcon={<AutoAwesomeIcon />}
                      onClick={() => openVariation(item, "easier")}
                    >
                      Easier
                    </Button>
                  </Tooltip>

                  <Tooltip title="Generate a similar problem with AI">
                    <Button
                      variant="outlined"
                      size="small"
                      color="info"
                      startIcon={<AutoAwesomeIcon />}
                      onClick={() => openVariation(item, "similar")}
                    >
                      Similar
                    </Button>
                  </Tooltip>

                  <Tooltip title="Generate a harder version with AI">
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      startIcon={<AutoAwesomeIcon />}
                      onClick={() => openVariation(item, "harder")}
                    >
                      Harder
                    </Button>
                  </Tooltip>

                  <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", sm: "block" } }} />

                  <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => handleEdit(item)}>
                    Edit
                  </Button>
                  <Button variant="outlined" size="small" color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteTarget(item)}>
                    Delete
                  </Button>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </SectionCard>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Problem</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "<strong>{deleteTarget?.title}</strong>"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Variation Review Modal ─────────────────────────────────────── */}
      {variationSource && variationType && (
        <VariationReviewModal
          open={variationModalOpen}
          onClose={() => setVariationModalOpen(false)}
          sourceProblem={variationSource}
          variationType={variationType}
          token={token}
          onApproved={() => {
            setVariationModalOpen(false);
            onProblemsChanged?.();
          }}
        />
      )}
    </>
  );
}
