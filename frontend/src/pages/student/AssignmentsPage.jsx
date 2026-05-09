import { useEffect, useState, useCallback } from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import AccessTimeIcon  from "@mui/icons-material/AccessTime";
import LockIcon        from "@mui/icons-material/Lock";
import EventIcon       from "@mui/icons-material/Event";
import WarningIcon     from "@mui/icons-material/Warning";
import { useNavigate } from "react-router-dom";

import AppLayout    from "../../components/layout/AppLayout";
import SectionCard  from "../../components/common/SectionCard";
import { API_BASE } from "../../apiBase";

// ── Helpers ───────────────────────────────────────────────────────────────────

function difficultyColor(d) {
  const v = (d ?? "").toLowerCase();
  if (v.includes("hard"))   return "error";
  if (v.includes("medium")) return "warning";
  return "success";
}

function formatTimeLeft(ms) {
  if (ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatCountdown(dueDate, lateDeadline) {
  const now  = Date.now();
  const due  = dueDate   ? new Date(dueDate).getTime()   : null;
  const late = lateDeadline ? new Date(lateDeadline).getTime() : null;

  if (!due) return null;

  const msRemaining = due - now;

  if (msRemaining > 0) {
    const totalMins  = Math.floor(msRemaining / 60000);
    const days       = Math.floor(totalMins / 1440);
    const hours      = Math.floor((totalMins % 1440) / 60);
    const mins       = totalMins % 60;

    if (days > 1)  return { label: `${days}d ${hours}h left`,  status: "ok",  urgent: false };
    if (days === 1) return { label: `1d ${hours}h left`,        status: "ok",  urgent: false };
    if (hours > 1) return { label: `${hours}h ${mins}m left`,  status: "warn", urgent: true };
    if (totalMins > 0) return { label: `${totalMins}m left`,   status: "warn", urgent: true };
    return { label: "Due now", status: "warn", urgent: true };
  }

  if (late && now < late) {
    const msLate    = late - now;
    const totalMins = Math.floor(msLate / 60000);
    const days      = Math.floor(totalMins / 1440);
    const hours     = Math.floor((totalMins % 1440) / 60);
    const label     = days > 0 ? `${days}d ${hours}h late window` : `${hours}h late window`;
    return { label, status: "late", urgent: true };
  }

  if (late && now >= late) return { label: "Closed",  status: "closed", urgent: false };
  return                         { label: "Overdue",  status: "closed", urgent: false };
}

function DeadlineCell({ assignment }) {
  if (!assignment.dueDate) {
    return <Typography variant="body2" color="text.secondary">No deadline</Typography>;
  }

  const dueStr  = new Date(assignment.dueDate).toLocaleDateString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const countdown = formatCountdown(assignment.dueDate, assignment.lateDeadline);
  const colorMap  = { ok: "success", warn: "warning", late: "warning", closed: "error" };
  const color     = countdown ? colorMap[countdown.status] ?? "default" : "default";

  return (
    <Stack spacing={0.25}>
      <Typography variant="body2">{dueStr}</Typography>
      {countdown && (
        <Chip
          icon={countdown.status === "closed" ? <WarningIcon /> : <AccessTimeIcon />}
          label={countdown.label}
          size="small"
          color={color}
          variant={countdown.status === "late" ? "filled" : "outlined"}
          sx={{ width: "fit-content", fontSize: 11 }}
        />
      )}
      {countdown?.status === "late" && assignment.lateDeduction > 0 && (
        <Typography variant="caption" color="warning.main">
          −{assignment.lateDeduction}% deduction applies
        </Typography>
      )}
    </Stack>
  );
}

/** Determine exam state for a scheduled exam */
function examState(a) {
  if (a.mode !== "exam") return "open";
  const now = Date.now();
  if (a.examType === "scheduled") {
    if (a.startDate && now < new Date(a.startDate).getTime()) return "not_started";
    if (a.dueDate  && now > new Date(a.dueDate).getTime())   return "ended";
    return "active";
  }
  // unscheduled exam
  if (a.dueDate && now > new Date(a.dueDate).getTime()) return "ended";
  return "active";
}

// ── Exam assignment row ───────────────────────────────────────────────────────

function ExamRow({ a, idx, solvedSet }) {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Live clock for active scheduled exams
  useEffect(() => {
    if (examState(a) !== "active" || a.examType !== "scheduled") return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [a]);

  const state     = examState(a);
  const problem   = a.problem ?? {};
  const langs     = a.allowedLanguages ?? [];
  const published = a.isPublished ?? false;
  const solved    = solvedSet.has(problem.id);

  const startLabel = a.startDate
    ? new Date(a.startDate).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const endLabel = a.dueDate
    ? new Date(a.dueDate).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  const timeLeftMs = a.dueDate ? new Date(a.dueDate).getTime() - now : null;

  function handleClick() {
    if (!published || state === "ended") return;
    if (state === "not_started") { setDialogOpen(true); return; }
    // active — navigate to problem
    navigate(`/problem/${problem.id}`, {
      state: {
        assignmentId:     a.id,
        allowedLanguages: langs,
        lateDeduction:    0,
        examMode:         true,
        examDeadline:     a.dueDate,
      },
    });
  }

  let statusChip;
  if (!published) {
    statusChip = <Chip label="Coming soon" size="small" variant="outlined" sx={{ fontSize: 10 }} />;
  } else if (state === "not_started") {
    statusChip = <Chip icon={<LockIcon />} label="Not started" size="small" color="default" variant="outlined" sx={{ fontSize: 10 }} />;
  } else if (state === "ended") {
    statusChip = <Chip label="Ended" size="small" color="error" variant="filled" sx={{ fontSize: 10 }} />;
  } else {
    statusChip = (
      <Chip
        label={solved ? "Submitted" : "In progress"}
        size="small"
        color={solved ? "success" : "warning"}
        variant={solved ? "filled" : "outlined"}
        sx={{ fontSize: 10 }}
      />
    );
  }

  return (
    <>
      <TableRow
        hover={published && state !== "ended"}
        onClick={handleClick}
        sx={{ cursor: (published && state !== "ended") ? "pointer" : "default", opacity: published ? 1 : 0.65 }}
      >
        <TableCell>{idx + 1}</TableCell>

        <TableCell>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Typography variant="body2" fontWeight={600}>{a.title}</Typography>
            {a.examType === "scheduled" && (
              <Chip label="Scheduled" size="small" color="error" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
            )}
          </Stack>
          {/* Hide problem content until exam is active */}
          {state === "active" && problem.title && a.title !== problem.title && (
            <Typography variant="caption" color="text.secondary">{problem.title}</Typography>
          )}
          {state !== "active" && (
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
              {state === "not_started" ? "Content hidden until exam starts" : "Exam content — exam ended"}
            </Typography>
          )}
        </TableCell>

        <TableCell>
          {state === "active" ? (
            (problem.tags ?? []).length === 0 ? (
              <Typography variant="caption" color="text.secondary">—</Typography>
            ) : (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {(problem.tags ?? []).map((tag) => (
                  <Chip key={tag} label={tag} size="small" variant="outlined" color="info" sx={{ fontSize: 11 }} />
                ))}
              </Stack>
            )
          ) : <Typography variant="caption" color="text.secondary">—</Typography>}
        </TableCell>

        <TableCell>
          {/* Show time info based on state */}
          {state === "not_started" && startLabel && (
            <Stack spacing={0.25}>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <EventIcon fontSize="small" color="action" />
                <Typography variant="caption">Starts: {startLabel}</Typography>
              </Stack>
              {endLabel && <Typography variant="caption" color="text.secondary">Ends: {endLabel}</Typography>}
            </Stack>
          )}
          {state === "active" && (
            <Stack spacing={0.25}>
              {endLabel && (
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <AccessTimeIcon fontSize="small" color={timeLeftMs !== null && timeLeftMs < 3600000 ? "error" : "action"} />
                  <Typography variant="caption" color={timeLeftMs !== null && timeLeftMs < 3600000 ? "error" : "text.secondary"}>
                    {timeLeftMs !== null ? `${formatTimeLeft(timeLeftMs)} remaining` : `Ends: ${endLabel}`}
                  </Typography>
                </Stack>
              )}
            </Stack>
          )}
          {state === "ended" && endLabel && (
            <Typography variant="caption" color="text.secondary">Ended: {endLabel}</Typography>
          )}
          {state === "open" && <DeadlineCell assignment={a} />}
        </TableCell>

        <TableCell>{statusChip}</TableCell>
      </TableRow>

      {/* "Exam not yet started" dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LockIcon color="error" />
          Exam Not Yet Started
        </DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            <strong>{a.title}</strong> has not started yet.
          </Typography>
          {startLabel && (
            <Alert severity="info" icon={<EventIcon />} sx={{ mt: 1 }}>
              This exam will become available on <strong>{startLabel}</strong>.
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            The exam content will be visible and the timer will start once the scheduled time arrives.
          </Typography>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Assignment / Practice row (existing logic, kept as-is) ────────────────────

function AssignmentRow({ a, idx, solvedSet }) {
  const navigate = useNavigate();
  const problem    = a.problem ?? {};
  const solved     = solvedSet.has(problem.id);
  const langs      = a.allowedLanguages ?? [];
  const published  = a.isPublished ?? false;
  const isLate     = (() => {
    if (!a.dueDate) return false;
    const now = Date.now();
    return now > new Date(a.dueDate).getTime() &&
      (!a.lateDeadline || now < new Date(a.lateDeadline).getTime());
  })();

  return (
    <TableRow
      hover={published}
      onClick={() => {
        if (!published) return;
        navigate(`/problem/${problem.id}`, {
          state: {
            assignmentId:     a.id,
            allowedLanguages: langs,
            lateDeduction:    isLate ? (a.lateDeduction ?? 0) : 0,
          },
        });
      }}
      sx={{ cursor: published ? "pointer" : "default", opacity: published ? 1 : 0.65 }}
    >
      <TableCell>{idx + 1}</TableCell>

      <TableCell>
        <Typography variant="body2" fontWeight={600}>{a.title}</Typography>
        {problem.title && a.title !== problem.title && (
          <Typography variant="caption" color="text.secondary">{problem.title}</Typography>
        )}
      </TableCell>

      <TableCell>
        {(problem.tags ?? []).length === 0 ? (
          <Typography variant="caption" color="text.secondary">—</Typography>
        ) : (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {(problem.tags ?? []).map((tag) => (
              <Chip key={tag} label={tag} size="small" variant="outlined" color="info" sx={{ fontSize: 11 }} />
            ))}
          </Stack>
        )}
      </TableCell>

      <TableCell>
        <Chip label={problem.difficulty ?? "N/A"} size="small" color={difficultyColor(problem.difficulty)} variant="outlined" />
      </TableCell>

      <TableCell>
        {langs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Any</Typography>
        ) : (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {langs.map((l) => <Chip key={l} label={l} size="small" variant="outlined" sx={{ fontSize: 11 }} />)}
          </Stack>
        )}
      </TableCell>

      <TableCell><DeadlineCell assignment={a} /></TableCell>

      <TableCell>
        {!published ? (
          <Chip label="Coming soon" size="small" color="default" variant="outlined" sx={{ fontSize: 10 }} />
        ) : isLate ? (
          <Tooltip title={a.lateDeduction > 0 ? `${a.lateDeduction}% deduction` : "No deduction"}>
            <Chip label="Late" size="small" color="warning" variant="filled" />
          </Tooltip>
        ) : (
          <Chip
            label={solved ? "Solved" : "Not solved"}
            size="small"
            color={solved ? "success" : "default"}
            variant={solved ? "filled" : "outlined"}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssignmentsPage({ currentUser, token, handleLogout, navItems }) {
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState(0);  // 0=homework, 1=practice, 2=exams

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

    Promise.all([
      fetch(`${API_BASE}/api/assignments`,      { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/api/student/history`,  { headers }).then((r) => r.json()),
    ])
      .then(([assignRes, subRes]) => {
        setAssignments(assignRes?.data ?? []);
        setSubmissions(subRes?.data    ?? []);
      })
      .catch((err) => console.error("AssignmentsPage fetch failed:", err))
      .finally(() => setLoading(false));
  }, [token]);

  const solvedSet = new Set(
    submissions
      .filter((s) => s.status === "accepted")
      .map((s) => s.problemId),
  );

  const homework  = assignments.filter((a) => a.mode === "homework");
  const practice  = assignments.filter((a) => a.mode === "practice");
  const exams     = assignments.filter((a) => a.mode === "exam");

  const tabData = [
    { label: `Homework (${homework.length})`,  items: homework,  isExam: false },
    { label: `Practice (${practice.length})`,  items: practice,  isExam: false },
    { label: `Exams (${exams.length})`,        items: exams,     isExam: true  },
  ];

  const current = tabData[tab];
  const total   = current.items.length;
  const solved  = current.isExam
    ? 0
    : current.items.filter((a) => solvedSet.has(a.problem?.id)).length;
  const progress = total > 0 && !current.isExam ? (solved / total) * 100 : 0;

  return (
    <AppLayout
      title="AI Mentor"
      roleLabel="Student"
      userLabel={currentUser?.name || currentUser?.email}
      onLogout={handleLogout}
      navItems={navItems}
      maxWidth="lg"
      showPageTitle={false}
    >
      <SectionCard title="Assignments">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
          {tabData.map((t, i) => (
            <Tab key={i} label={t.label} />
          ))}
        </Tabs>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : current.items.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
            No {current.label.toLowerCase()} yet.
          </Typography>
        ) : (
          <>
            {!current.isExam && (
              <Box sx={{ mb: 2 }}>
                <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 4 }} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {solved} / {total} completed
                </Typography>
              </Box>
            )}

            <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                    <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Topics</TableCell>
                    {!current.isExam && <TableCell sx={{ fontWeight: 700 }}>Difficulty</TableCell>}
                    {!current.isExam && <TableCell sx={{ fontWeight: 700 }}>Languages</TableCell>}
                    <TableCell sx={{ fontWeight: 700 }}>{current.isExam ? "Time" : "Deadline"}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {current.items.map((a, idx) =>
                    current.isExam ? (
                      <ExamRow key={a.id} a={a} idx={idx} solvedSet={solvedSet} />
                    ) : (
                      <AssignmentRow key={a.id} a={a} idx={idx} solvedSet={solvedSet} />
                    )
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </SectionCard>
    </AppLayout>
  );
}
