/**
 * ProblemForm.jsx
 *
 * Shared form used in both QuestionBankPanel (inline) and
 * AssignmentModal (sub-dialog). Handles the full problem-creation
 * fields: title, difficulty, languages, tags, description,
 * starter code, reference solution, and test cases.
 *
 * Props:
 *   form         — current form state object
 *   setForm      — state setter
 *   onSave       — async () => void  — called when "Save" is clicked
 *   onCancel     — () => void
 *   saving       — boolean
 *   error        — string | ""
 *   submitLabel  — string (e.g. "Create Problem")
 *   compact      — boolean — if true, omits the outer border box (for use inside a Dialog)
 */

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";

export const ALL_LANGUAGES = [
  { value: "python",     label: "Python"     },
  { value: "javascript", label: "JavaScript" },
  { value: "c",          label: "C"          },
  { value: "cpp",        label: "C++"        },
  { value: "csharp",     label: "C#"         },
  { value: "java",       label: "Java"       },
];

export const EMPTY_FORM = {
  title:             "",
  description:       "",
  difficulty:        "Easy",
  languages:         [],
  tags:              [],
  starterCode:       "",
  referenceSolution: "",
  testCases:         [{ input: "", expectedOutput: "", isHidden: false }],
};

export default function ProblemForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  error,
  submitLabel = "Save",
  compact = false,
}) {
  const [tagInput, setTagInput] = useState("");

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

  function toggleLanguage(lang) {
    setForm((prev) => {
      const has  = prev.languages.includes(lang);
      const next = has ? prev.languages.filter((l) => l !== lang) : [...prev.languages, lang];
      return { ...prev, languages: next };
    });
  }

  function addTag(raw) {
    // Support comma-separated topics: "arrays, loops, functions" → 3 separate tags
    const parts = raw.split(",").map((t) => t.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setForm((prev) => {
      let tags = [...prev.tags];
      for (const val of parts) {
        if (tags.length >= 5) break; // enforce max 5 tags
        if (!tags.includes(val)) tags = [...tags, val];
      }
      return { ...prev, tags };
    });
    setTagInput("");
  }

  function removeTag(tag) {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  }

  const allLangsSelected = form.languages.length === 0;

  const inner = (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        label="Problem Title *"
        value={form.title}
        onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
        fullWidth
        autoFocus
      />

      {/* Difficulty */}
      <TextField
        select label="Difficulty" value={form.difficulty}
        onChange={(e) => setForm((prev) => ({ ...prev, difficulty: e.target.value }))}
        sx={{ maxWidth: 200 }}
      >
        <MenuItem value="Easy">Easy</MenuItem>
        <MenuItem value="Medium">Medium</MenuItem>
        <MenuItem value="Hard">Hard</MenuItem>
      </TextField>

      {/* Languages */}
      <Box>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Languages</Typography>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          <Chip
            label="All Languages"
            size="small"
            variant={allLangsSelected ? "filled" : "outlined"}
            color={allLangsSelected ? "primary" : "default"}
            onClick={() => setForm((prev) => ({ ...prev, languages: [] }))}
            sx={{ cursor: "pointer" }}
          />
          {ALL_LANGUAGES.map((lang) => {
            const checked = form.languages.includes(lang.value);
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
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
          {allLangsSelected
            ? "Students may solve in any language."
            : `Restricted to: ${form.languages.join(", ")}`}
        </Typography>
      </Box>

      {/* Tags */}
      <Box>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Topics / Tags</Typography>
        {form.tags.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            {form.tags.map((tag) => (
              <Chip key={tag} label={tag} size="small" onDelete={() => removeTag(tag)} />
            ))}
          </Stack>
        )}
        <TextField
          size="small"
          placeholder="Type a topic and press Enter…"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
          onBlur={() => addTag(tagInput)}
          fullWidth
          disabled={form.tags.length >= 5}
          helperText={form.tags.length >= 5 ? "Maximum 5 topics reached." : "Press Enter to add a topic."}
        />
      </Box>

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
          <IconButton
            onClick={() => removeTestCase(idx)}
            disabled={form.testCases.length <= 1}
            size="small" color="error"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}

      <Button variant="outlined" size="small" onClick={addTestCase} sx={{ alignSelf: "flex-start" }}>
        + Add Test Case
      </Button>

      {!compact && (
        <>
          <Divider />
          <Stack direction="row" spacing={1.5}>
            <Button variant="contained" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : submitLabel}
            </Button>
            <Button variant="outlined" onClick={onCancel}>Cancel</Button>
          </Stack>
        </>
      )}
    </Stack>
  );

  if (compact) return inner;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, borderRadius: 3, border: 1, borderColor: "rgba(148,163,184,0.20)", mb: 3 }}>
      {inner}
    </Box>
  );
}
