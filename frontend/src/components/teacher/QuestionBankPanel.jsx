import { useMemo, useState } from "react";
import {
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
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteIcon      from "@mui/icons-material/Delete";
import EditIcon        from "@mui/icons-material/Edit";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SearchIcon      from "@mui/icons-material/Search";
import GradingIcon     from "@mui/icons-material/Grading";

import SectionCard from "../common/SectionCard";
import VariationReviewModal from "./VariationReviewModal";
import RubricModal from "./RubricModal";
import ProblemForm, { EMPTY_FORM } from "./ProblemForm";
import { API_BASE } from "../../apiBase";

function normalizeDifficulty(value = "Easy") {
  const label = String(value).toLowerCase();
  if (label.includes("hard"))   return { label: "Hard",   tone: "#FEE2E2", color: "#DC2626" };
  if (label.includes("medium")) return { label: "Medium", tone: "#FEF3C7", color: "#D97706" };
  return                               { label: "Easy",   tone: "#DCFCE7", color: "#16A34A" };
}

export default function QuestionBankPanel({ items = [], token, onProblemsChanged }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ── Filter / search / sort state ─────────────────────────────────────────
  const [search,      setSearch]      = useState("");
  const [filterDiff,  setFilterDiff]  = useState("all");
  const [filterTopic, setFilterTopic] = useState("all");
  const [sortBy,      setSortBy]      = useState("newest");

  // Derive unique topics from all items for the dropdown
  const allTopics = useMemo(() => {
    const set = new Set();
    for (const it of items) {
      if (Array.isArray(it.tags)) it.tags.forEach((t) => set.add(t));
    }
    return Array.from(set).sort();
  }, [items]);

  const visibleItems = useMemo(() => {
    let result = [...items];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (it) =>
          it.title?.toLowerCase().includes(q) ||
          it.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (filterDiff !== "all") {
      result = result.filter(
        (it) => (it.difficulty ?? "Easy").toLowerCase() === filterDiff,
      );
    }
    if (filterTopic !== "all") {
      result = result.filter(
        (it) => Array.isArray(it.tags) && it.tags.includes(filterTopic),
      );
    }
    result.sort((a, b) => {
      if (sortBy === "title_asc")  return (a.title ?? "").localeCompare(b.title ?? "");
      if (sortBy === "title_desc") return (b.title ?? "").localeCompare(a.title ?? "");
      if (sortBy === "most_used")  return (b.usageCount ?? 0) - (a.usageCount ?? 0);
      if (sortBy === "least_used") return (a.usageCount ?? 0) - (b.usageCount ?? 0);
      if (sortBy === "newest") {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : (a.id ?? 0);
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : (b.id ?? 0);
        return tb - ta;
      }
      if (sortBy === "oldest") {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : (a.id ?? 0);
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : (b.id ?? 0);
        return ta - tb;
      }
      return 0;
    });
    return result;
  }, [items, search, filterDiff, filterTopic, sortBy]);

  // ── Variation state ──────────────────────────────────────────────────────
  const [variationSource,  setVariationSource]  = useState(null);   // the source problem object
  const [variationType,    setVariationType]    = useState(null);   // "harder" | "easier" | "similar"
  const [variationModalOpen, setVariationModalOpen] = useState(false);

  function openVariation(item, type) {
    setVariationSource(item);
    setVariationType(type);
    setVariationModalOpen(true);
  }

  // ── Rubric state ──────────────────────────────────────────────────────────
  const [rubricProblem,    setRubricProblem]    = useState(null);
  const [rubricModalOpen,  setRubricModalOpen]  = useState(false);

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
          // Send both: new multi-lang array + legacy single language (first, or "python" fallback)
          languages: form.languages,
          language: form.languages[0] ?? "python",
          // Send both: new tags array + legacy category (first tag)
          tags: form.tags,
          category: form.tags[0] ?? null,
          starterCode: form.starterCode || null,
          referenceSolution: form.referenceSolution || null,
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
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const res = await fetch(`${API_BASE}/api/problems/${item.id}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const body = await res.json();
      const p = body.data ?? {};
      // Prefer new multi-lang array, fall back to single language
      const languages =
        Array.isArray(p.languages) && p.languages.length > 0
          ? p.languages
          : p.language
          ? [p.language]
          : [];
      // Prefer new tags array, fall back to category
      const tags =
        Array.isArray(p.tags) && p.tags.length > 0
          ? p.tags
          : p.category
          ? [p.category]
          : [];
      setForm({
        title: p.title ?? "",
        description: p.description ?? "",
        difficulty: p.difficulty ?? "Easy",
        languages,
        tags,
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
          languages: form.languages,
          language: form.languages[0] ?? "python",
          tags: form.tags,
          category: form.tags[0] ?? null,
          starterCode: form.starterCode || null,
          referenceSolution: form.referenceSolution || null,
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

        {/* ── Search / filter / sort toolbar ───────────────────────────── */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ mb: 2 }}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <TextField
            size="small"
            placeholder="Search by title or topic…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1, minWidth: 180 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            select size="small" label="Difficulty" value={filterDiff}
            onChange={(e) => setFilterDiff(e.target.value)}
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="all">All Difficulties</MenuItem>
            <MenuItem value="easy">Easy</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="hard">Hard</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Topic" value={filterTopic}
            onChange={(e) => setFilterTopic(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="all">All Topics</MenuItem>
            {allTopics.map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" label="Sort by" value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="newest">Newest First</MenuItem>
            <MenuItem value="oldest">Oldest First</MenuItem>
            <MenuItem value="title_asc">Title A→Z</MenuItem>
            <MenuItem value="title_desc">Title Z→A</MenuItem>
            <MenuItem value="most_used">Most Attempts</MenuItem>
            <MenuItem value="least_used">Fewest Attempts</MenuItem>
          </TextField>
        </Stack>

        {visibleItems.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
            No problems match your filters.
          </Typography>
        )}

        <Stack divider={<Divider flexItem />}>
          {visibleItems.map((item) => {
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
                    {/* Languages: "All" chip or individual chips */}
                    {Array.isArray(item.languages) && item.languages.length === 0 ? (
                      <Chip label="All languages" size="small" variant="outlined" color="primary" />
                    ) : (
                      item.languages?.map((lang) => (
                        <Chip key={lang} label={lang} size="small" variant="outlined" color="primary" />
                      ))
                    )}
                    {/* Topic tags */}
                    {item.tags?.map((tag) => (
                      <Chip key={tag} label={tag} size="small" variant="outlined" />
                    ))}
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

                  <Tooltip title="View / generate grading rubric">
                    <Button
                      variant="outlined"
                      size="small"
                      color="secondary"
                      startIcon={<GradingIcon />}
                      onClick={() => { setRubricProblem(item); setRubricModalOpen(true); }}
                    >
                      Rubric
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

      {/* ── Rubric Modal ──────────────────────────────────────────────── */}
      {rubricProblem && (
        <RubricModal
          open={rubricModalOpen}
          onClose={() => setRubricModalOpen(false)}
          problem={rubricProblem}
          token={token}
        />
      )}

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
