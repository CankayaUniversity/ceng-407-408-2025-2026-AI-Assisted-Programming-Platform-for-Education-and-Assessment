import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DeleteIcon       from "@mui/icons-material/Delete";
import AddIcon          from "@mui/icons-material/Add";
import SaveIcon         from "@mui/icons-material/Save";
import { API_BASE } from "../../apiBase";

const EMPTY_CRITERION = { name: "", description: "", maxScore: 20, scoringGuide: "" };

function totalOf(criteria) {
  return criteria.reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0);
}

export default function RubricModal({ open, onClose, problem, token }) {
  const [criteria,     setCriteria]     = useState([]);
  const [gradingNotes, setGradingNotes] = useState("");
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [generating,   setGenerating]   = useState(false);
  const [error,        setError]        = useState("");
  const [saved,        setSaved]        = useState(false);

  // ── Load existing rubric when modal opens ─────────────────────────────────
  useEffect(() => {
    if (!open || !problem?.id) return;
    setError("");
    setSaved(false);

    async function loadRubric() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/rubrics/${problem.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (body.data?.criteria) {
          setCriteria(body.data.criteria);
          setGradingNotes(body.data.gradingNotes ?? "");
        } else {
          // No rubric yet — start with empty state
          setCriteria([]);
          setGradingNotes("");
        }
      } catch {
        setCriteria([]);
        setGradingNotes("");
      } finally {
        setLoading(false);
      }
    }

    loadRubric();
  }, [open, problem?.id, token]);

  // ── AI Generation ─────────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch(`${API_BASE}/api/rubrics/${problem.id}/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "AI generation failed");
      if (body.data?.criteria) {
        setCriteria(body.data.criteria);
        setGradingNotes(body.data.gradingNotes ?? "");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  // ── Save / PUT ────────────────────────────────────────────────────────────
  async function handleSave() {
    const total = totalOf(criteria);
    if (total !== 100) {
      setError(`Criteria must total exactly 100 points (currently ${total}).`);
      return;
    }
    if (criteria.some((c) => !c.name.trim())) {
      setError("All criteria must have a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/rubrics/${problem.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ criteria }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to save rubric");
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Criterion editing helpers ─────────────────────────────────────────────
  function updateCriterion(idx, field, value) {
    setCriteria((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: field === "maxScore" ? Number(value) || 0 : value };
      return next;
    });
    setSaved(false);
  }

  function addCriterion() {
    setCriteria((prev) => [...prev, { ...EMPTY_CRITERION }]);
    setSaved(false);
  }

  function removeCriterion(idx) {
    setCriteria((prev) => prev.filter((_, i) => i !== idx));
    setSaved(false);
  }

  const total = totalOf(criteria);
  const totalColor = total === 100 ? "success.main" : total > 100 ? "error.main" : "warning.main";

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box flex={1}>
          <Typography variant="h6" fontWeight={700}>Grading Rubric</Typography>
          {problem?.title && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {problem.title}
            </Typography>
          )}
        </Box>
        <Tooltip title="Generate rubric with AI">
          <span>
            <Button
              variant="outlined"
              size="small"
              startIcon={generating ? <CircularProgress size={14} /> : <AutoAwesomeIcon />}
              onClick={handleGenerate}
              disabled={generating || saving}
            >
              {generating ? "Generating…" : "Generate with AI"}
            </Button>
          </span>
        </Tooltip>
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack spacing={2}>
            {error   && <Alert severity="error"   onClose={() => setError("")}>{error}</Alert>}
            {saved   && <Alert severity="success">Rubric saved successfully.</Alert>}

            {/* ── Criteria table ── */}
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, minWidth: 140 }}>Criterion</TableCell>
                    <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 90 }} align="center">Max pts</TableCell>
                    <TableCell sx={{ fontWeight: 700, minWidth: 200 }}>Scoring Guide</TableCell>
                    <TableCell sx={{ width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {criteria.map((c, idx) => (
                    <TableRow key={idx} sx={{ verticalAlign: "top" }}>
                      <TableCell>
                        <TextField
                          value={c.name}
                          onChange={(e) => updateCriterion(idx, "name", e.target.value)}
                          size="small"
                          fullWidth
                          placeholder="e.g. Correctness"
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          value={c.description}
                          onChange={(e) => updateCriterion(idx, "description", e.target.value)}
                          size="small"
                          fullWidth
                          multiline
                          minRows={1}
                          placeholder="What this criterion assesses"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <TextField
                          value={c.maxScore}
                          onChange={(e) => updateCriterion(idx, "maxScore", e.target.value)}
                          size="small"
                          type="number"
                          inputProps={{ min: 1, max: 100, style: { textAlign: "center" } }}
                          sx={{ width: 72 }}
                          InputProps={{
                            endAdornment: <InputAdornment position="end">pt</InputAdornment>,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          value={c.scoringGuide}
                          onChange={(e) => updateCriterion(idx, "scoringGuide", e.target.value)}
                          size="small"
                          fullWidth
                          multiline
                          minRows={1}
                          placeholder="Full / partial / zero points guide"
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => removeCriterion(idx)}
                          disabled={criteria.length <= 1}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>

            {/* ── Total row ── */}
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={addCriterion}
                disabled={criteria.length >= 8}
              >
                Add Criterion
              </Button>
              <Typography variant="body2" fontWeight={700} color={totalColor}>
                Total: {total} / 100 pts
              </Typography>
            </Stack>

            <Divider />

            {/* ── Grading notes ── */}
            <TextField
              label="Grading Notes (optional)"
              value={gradingNotes}
              onChange={(e) => { setGradingNotes(e.target.value); setSaved(false); }}
              multiline
              minRows={2}
              fullWidth
              placeholder="Overall notes for graders, common mistakes to watch for, etc."
            />
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Close</Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={14} /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving || loading || criteria.length === 0}
        >
          {saving ? "Saving…" : "Save Rubric"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
