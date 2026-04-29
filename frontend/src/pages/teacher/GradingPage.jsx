import { useEffect, useState, useCallback } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Slider,
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
import AutoAwesomeIcon    from "@mui/icons-material/AutoAwesome";
import CheckCircleIcon    from "@mui/icons-material/CheckCircle";
import DownloadIcon       from "@mui/icons-material/Download";
import GradingIcon        from "@mui/icons-material/Grading";
import PersonIcon         from "@mui/icons-material/Person";
import CodeIcon           from "@mui/icons-material/Code";
import CloseIcon          from "@mui/icons-material/Close";
import * as XLSX from "xlsx";

import AppLayout from "../../components/layout/AppLayout";
import SectionCard from "../../components/common/SectionCard";
import { API_BASE } from "../../apiBase";

// ── Export helper ─────────────────────────────────────────────────────────────
function exportToExcel(assignmentData) {
  if (!assignmentData) return;

  const { assignment, students } = assignmentData;
  const assignmentTitle = assignment?.title ?? "Assignment";
  const problemTitle    = assignment?.problem?.title ?? "";

  // Build rows
  const rows = students.map((entry) => {
    const grade = entry.grade;
    const attempt = entry.attempt;

    const row = {
      "Student Name":    entry.user.name,
      "Email":           entry.user.email,
      "Submission Status": entry.submission?.status ?? "No submission",
      "Public Tests":
        attempt?.publicTotal != null
          ? `${attempt.publicPassed ?? 0} / ${attempt.publicTotal}`
          : "—",
      "Hidden Tests":
        attempt?.hiddenTotal != null
          ? `${attempt.hiddenPassed ?? 0} / ${attempt.hiddenTotal}`
          : "—",
      "Score":    grade ? grade.score    : "",
      "Max Score": grade ? grade.maxScore : "",
      "Percentage":
        grade && grade.maxScore > 0
          ? `${((grade.score / grade.maxScore) * 100).toFixed(1)}%`
          : "",
      "Feedback": grade?.feedback ?? "",
    };

    // Add per-criterion breakdown columns if present
    if (grade?.breakdown?.length) {
      grade.breakdown.forEach((b) => {
        row[`[Rubric] ${b.name}`] = `${b.suggested ?? b.points ?? 0} / ${b.maxScore}`;
        if (b.comment) row[`[Comment] ${b.name}`] = b.comment;
      });
    }

    return row;
  });

  const worksheet  = XLSX.utils.json_to_sheet(rows);
  const workbook   = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Grades");

  // Auto-width columns
  const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => String(r[key] ?? "").length)) + 2,
  }));
  worksheet["!cols"] = colWidths;

  const safeTitle = assignmentTitle.replace(/[\\/:*?"<>|]/g, "_").slice(0, 50);
  XLSX.writeFile(workbook, `${safeTitle}_grades.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status) {
  if (!status) return "default";
  const s = status.toLowerCase();
  if (s === "accepted") return "success";
  if (s.includes("wrong")) return "error";
  if (s.includes("error") || s.includes("runtime")) return "warning";
  return "default";
}

function initBreakdown(criteria) {
  return criteria.map((c) => ({
    name:      c.name,
    maxScore:  c.maxScore,
    suggested: 0,
    comment:   "",
  }));
}

// ── Grading Drawer ────────────────────────────────────────────────────────────

function TestBadge({ attempt }) {
  if (!attempt) return <Typography variant="caption" color="text.secondary">No run data</Typography>;
  const pub  = attempt.publicTotal  ? `${attempt.publicPassed ?? 0}/${attempt.publicTotal} pub`  : null;
  const hid  = attempt.hiddenTotal  ? `${attempt.hiddenPassed ?? 0}/${attempt.hiddenTotal} hid`  : null;
  const text = [pub, hid].filter(Boolean).join(", ");
  const all  = attempt.allPassed;
  return (
    <Chip
      label={text || attempt.normalizedStatus}
      size="small"
      color={all === true ? "success" : all === false ? "error" : "default"}
    />
  );
}

function GradingDrawer({
  open,
  onClose,
  student,
  submission,
  attempt,
  rubric,
  assignment,
  token,
  onSaved,
  existingGrade,
  globalSuggesting = false,
  onSuggestingChange,
}) {
  const criteria = rubric?.criteria ?? [];

  const [breakdown,  setBreakdown]  = useState(() => initBreakdown(criteria));
  const [feedback,   setFeedback]   = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const [saved,      setSaved]      = useState(false);

  // Keep local + global suggesting in sync
  function startSuggesting() { setSuggesting(true);  onSuggestingChange?.(true); }
  function stopSuggesting()  { setSuggesting(false); onSuggestingChange?.(false); }

  // Populate from existing grade when drawer opens
  useEffect(() => {
    if (!open) return;
    setSaved(false);
    setError("");
    if (existingGrade?.breakdown) {
      setBreakdown(
        criteria.map((c) => {
          const saved = existingGrade.breakdown.find((b) => b.name === c.name);
          return {
            name:      c.name,
            maxScore:  c.maxScore,
            suggested: saved?.suggested ?? saved?.points ?? 0,
            comment:   saved?.comment ?? "",
          };
        }),
      );
      setFeedback(existingGrade.feedback ?? "");
    } else {
      setBreakdown(initBreakdown(criteria));
      setFeedback("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingGrade]);

  const totalScore = breakdown.reduce((s, c) => s + (Number(c.suggested) || 0), 0);
  const maxTotal   = breakdown.reduce((s, c) => s + c.maxScore, 0);

  async function handleSuggest() {
    if (!submission || globalSuggesting) return;
    startSuggesting();
    setError("");
    try {
      const res = await fetch(
        `${API_BASE}/api/grades/${assignment.id}/${student.id}/suggest`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "AI suggestion failed");
      if (body.data?.breakdown) {
        setBreakdown(
          body.data.breakdown.map((b) => ({
            name:      b.name,
            maxScore:  b.maxScore,
            suggested: b.suggested,
            comment:   b.comment,
          })),
        );
        if (body.data.generalNotes) setFeedback(body.data.generalNotes);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      stopSuggesting();
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        `${API_BASE}/api/grades/${assignment.id}/${student.id}`,
        {
          method:  "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body:    JSON.stringify({
            score:       totalScore,
            maxScore:    maxTotal || 100,
            breakdown,
            feedback,
            rubricId:    rubric?.id ?? null,
            aiSuggested: false,
          }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to save grade");
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function updateRow(idx, field, value) {
    setBreakdown((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: field === "suggested" ? Number(value) : value };
      return next;
    });
    setSaved(false);
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100vw", md: 720 }, p: 0 } }}
    >
      {/* ── Header ── */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ px: 3, py: 2, borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}
      >
        <Avatar sx={{ bgcolor: "primary.main", width: 36, height: 36 }}>
          <PersonIcon fontSize="small" />
        </Avatar>
        <Box flex={1}>
          <Typography variant="subtitle1" fontWeight={700}>{student?.name}</Typography>
          <Typography variant="caption" color="text.secondary">{student?.email}</Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </Stack>

      <Box sx={{ overflow: "auto", p: 3, flex: 1 }}>
        <Stack spacing={3}>
          {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
          {saved && <Alert severity="success">Grade saved successfully.</Alert>}

          {/* ── Submission code ── */}
          {submission ? (
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} mb={1} flexWrap="wrap">
                <CodeIcon fontSize="small" color="action" />
                <Typography variant="subtitle2" fontWeight={700}>Student Submission</Typography>
                <Chip label={submission.status} size="small" color={statusColor(submission.status)} />
                {attempt?.publicTotal != null && (
                  <Chip
                    label={`${attempt.publicPassed ?? 0}/${attempt.publicTotal} public tests`}
                    size="small"
                    color={attempt.allPassed ? "success" : "warning"}
                    variant="outlined"
                  />
                )}
                {attempt?.hiddenTotal != null && (
                  <Chip
                    label={`${attempt.hiddenPassed ?? 0}/${attempt.hiddenTotal} hidden tests`}
                    size="small"
                    color={attempt.hiddenPassed === attempt.hiddenTotal ? "success" : "error"}
                    variant="outlined"
                  />
                )}
                {attempt?.executionTimeMs != null && (
                  <Chip label={`${attempt.executionTimeMs.toFixed(0)} ms`} size="small" variant="outlined" />
                )}
              </Stack>
              <Box
                component="pre"
                sx={{
                  bgcolor: "grey.900",
                  color:   "grey.100",
                  p: 2,
                  borderRadius: 2,
                  overflow: "auto",
                  maxHeight: 260,
                  fontSize: 12,
                  fontFamily: "monospace",
                  m: 0,
                }}
              >
                {submission.code}
              </Box>
            </Box>
          ) : (
            <Alert severity="info">No submission found for this student.</Alert>
          )}

          <Divider />

          {/* ── Rubric scoring ── */}
          {criteria.length > 0 ? (
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="subtitle2" fontWeight={700}>Rubric Scoring</Typography>
                <Tooltip title={submission ? "AI scores the submission against the rubric" : "No submission to score"}>
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={globalSuggesting ? <CircularProgress size={14} /> : <AutoAwesomeIcon />}
                      onClick={handleSuggest}
                      disabled={globalSuggesting || saving || !submission}
                    >
                      {globalSuggesting ? "Suggesting…" : "AI Suggest"}
                    </Button>
                  </span>
                </Tooltip>
              </Stack>

              <Stack spacing={2}>
                {breakdown.map((row, idx) => (
                  <Box
                    key={idx}
                    sx={{ p: 2, borderRadius: 2, border: 1, borderColor: "divider", bgcolor: "background.paper" }}
                  >
                    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                      <Typography variant="body2" fontWeight={700}>{row.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.suggested} / {row.maxScore} pts
                      </Typography>
                    </Stack>
                    <Slider
                      value={row.suggested}
                      onChange={(_, v) => updateRow(idx, "suggested", v)}
                      min={0}
                      max={row.maxScore}
                      step={1}
                      marks
                      valueLabelDisplay="auto"
                      color={row.suggested === row.maxScore ? "success" : row.suggested === 0 ? "error" : "primary"}
                      size="small"
                    />
                    <TextField
                      value={row.comment}
                      onChange={(e) => updateRow(idx, "comment", e.target.value)}
                      placeholder="Grader comment (optional)"
                      size="small"
                      fullWidth
                      multiline
                      minRows={1}
                      sx={{ mt: 1 }}
                    />
                  </Box>
                ))}
              </Stack>

              <Stack direction="row" justifyContent="flex-end" mt={2}>
                <Chip
                  label={`Total: ${totalScore} / ${maxTotal} pts`}
                  color={totalScore >= maxTotal * 0.9 ? "success" : totalScore >= maxTotal * 0.5 ? "warning" : "error"}
                  sx={{ fontWeight: 700, fontSize: 14, px: 1 }}
                />
              </Stack>
            </Box>
          ) : (
            <Alert severity="warning">
              No rubric found for this problem. Generate one first via the Rubric button in the Question Bank.
            </Alert>
          )}

          {/* ── Overall feedback ── */}
          <TextField
            label="Overall Feedback"
            value={feedback}
            onChange={(e) => { setFeedback(e.target.value); setSaved(false); }}
            multiline
            minRows={3}
            fullWidth
            placeholder="Write overall feedback for the student…"
          />
        </Stack>
      </Box>

      {/* ── Footer ── */}
      <Stack
        direction="row"
        justifyContent="flex-end"
        spacing={1.5}
        sx={{ px: 3, py: 2, borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}
      >
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={14} /> : <CheckCircleIcon />}
          onClick={handleSave}
          disabled={saving || criteria.length === 0}
        >
          {saving ? "Saving…" : "Save Grade"}
        </Button>
      </Stack>
    </Drawer>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GradingPage({ currentUser, token, handleLogout, navItems }) {
  const [assignments,      setAssignments]      = useState([]);
  const [selectedId,       setSelectedId]       = useState("");
  const [assignmentData,   setAssignmentData]   = useState(null);
  const [loadingList,      setLoadingList]       = useState(true);
  const [loadingStudents,  setLoadingStudents]  = useState(false);
  const [drawerOpen,       setDrawerOpen]       = useState(false);
  const [activeStudent,    setActiveStudent]    = useState(null);
  const [globalSuggesting, setGlobalSuggesting] = useState(false);
  const [error,            setError]            = useState("");

  const authHeaders = { Authorization: `Bearer ${token}` };

  // ── Load assignment list ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoadingList(true);
      try {
        const res  = await fetch(`${API_BASE}/api/assignments`, { headers: authHeaders });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load assignments");
        setAssignments(body.data ?? []);
        if ((body.data ?? []).length > 0) setSelectedId(String(body.data[0].id));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingList(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Load students + submissions when assignment changes ───────────────────
  const loadAssignment = useCallback(async (id) => {
    if (!id) return;
    setLoadingStudents(true);
    setError("");
    setAssignmentData(null);
    try {
      const res  = await fetch(`${API_BASE}/api/grades/assignment/${id}`, { headers: authHeaders });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load assignment data");
      setAssignmentData(body.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingStudents(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { if (selectedId) loadAssignment(selectedId); }, [selectedId, loadAssignment]);

  function openDrawer(studentEntry) {
    setActiveStudent(studentEntry);
    setDrawerOpen(true);
  }

  const activeEntry = activeStudent
    ? assignmentData?.students?.find((s) => s.user.id === activeStudent.user.id)
    : null;

  return (
    <AppLayout
      title="AI Mentor"
      userLabel={currentUser?.name || currentUser?.email}
      onLogout={handleLogout}
      navItems={navItems}
      headerVariant="teacher"
      roleLabel="Teacher"
      showPageTitle={false}
    >
      <Stack spacing={3} sx={{ maxWidth: 1100, mx: "auto", px: { xs: 2, md: 3 }, py: 3 }}>

        {/* ── Assignment selector ── */}
        <SectionCard title="Grading">
          <Typography variant="body2" color="text.secondary" mb={2}>
            Select an assignment to view enrolled students and grade their submissions.
          </Typography>

          {loadingList ? (
            <CircularProgress size={24} />
          ) : assignments.length === 0 ? (
            <Alert severity="info">No assignments found. Create one in the Assignments section.</Alert>
          ) : (
            <FormControl sx={{ minWidth: 320 }}>
              <InputLabel>Assignment</InputLabel>
              <Select
                value={selectedId}
                label="Assignment"
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {assignments.map((a) => (
                  <MenuItem key={a.id} value={String(a.id)}>
                    {a.title}
                    {a.dueDate && (
                      <Typography component="span" variant="caption" color="text.secondary" ml={1}>
                        (due {new Date(a.dueDate).toLocaleDateString()})
                      </Typography>
                    )}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </SectionCard>

        {/* ── Student table ── */}
        {selectedId && (
          <SectionCard
            title={assignmentData ? `${assignmentData.assignment.problem.title} — Student Submissions` : "Loading…"}
            action={
              <Stack direction="row" spacing={1} alignItems="center">
                {assignmentData?.rubric ? (
                  <Chip
                    icon={<GradingIcon />}
                    label="Rubric loaded"
                    color="success"
                    size="small"
                    variant="outlined"
                  />
                ) : (
                  <Chip label="No rubric" color="warning" size="small" variant="outlined" />
                )}
                {assignmentData?.students?.length > 0 && (
                  <Tooltip title="Export all grades to Excel (.xlsx)">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      onClick={() => exportToExcel(assignmentData)}
                    >
                      Export Excel
                    </Button>
                  </Tooltip>
                )}
              </Stack>
            }
          >
            {loadingStudents ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress />
              </Box>
            ) : assignmentData?.students?.length === 0 ? (
              <Alert severity="info">No students enrolled in this assignment yet.</Alert>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Student</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Submission</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Grade</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(assignmentData?.students ?? []).map((entry) => {
                    const graded      = Boolean(entry.grade);
                    const hasSubmission = Boolean(entry.submission);
                    return (
                      <TableRow
                        key={entry.user.id}
                        hover
                        sx={!hasSubmission ? { opacity: 0.65 } : {}}
                      >
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Avatar sx={{ width: 30, height: 30, fontSize: 13, bgcolor: "primary.light" }}>
                              {entry.user.name?.[0]?.toUpperCase() ?? "?"}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" fontWeight={600}>{entry.user.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{entry.user.email}</Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          {entry.submission ? (
                            <Stack direction="row" spacing={0.5} flexWrap="wrap">
                              <Chip
                                label={entry.submission.status}
                                size="small"
                                color={statusColor(entry.submission.status)}
                              />
                              <TestBadge attempt={entry.attempt} />
                            </Stack>
                          ) : (
                            <Typography variant="caption" color="text.secondary">No submission</Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          {graded ? (
                            <Chip
                              label={`${entry.grade.score} / ${entry.grade.maxScore}`}
                              size="small"
                              color="primary"
                              icon={<CheckCircleIcon />}
                            />
                          ) : (
                            <Typography variant="caption" color="text.secondary">Not graded</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip
                            title={
                              !hasSubmission
                                ? "This student has not submitted yet — nothing to grade."
                                : ""
                            }
                          >
                            <span>
                              <Button
                                size="small"
                                variant={graded ? "outlined" : "contained"}
                                startIcon={<GradingIcon />}
                                onClick={() => openDrawer(entry)}
                                disabled={!hasSubmission}
                              >
                                {graded ? "Edit Grade" : "Grade"}
                              </Button>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        )}
      </Stack>

      {/* ── Grading side drawer ── */}
      {activeStudent && (
        <GradingDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          student={activeStudent.user}
          submission={activeStudent.submission}
          attempt={activeStudent.attempt}
          rubric={assignmentData?.rubric}
          assignment={assignmentData?.assignment}
          token={token}
          existingGrade={activeEntry?.grade ?? null}
          onSaved={() => loadAssignment(selectedId)}
          globalSuggesting={globalSuggesting}
          onSuggestingChange={setGlobalSuggesting}
        />
      )}
    </AppLayout>
  );
}
