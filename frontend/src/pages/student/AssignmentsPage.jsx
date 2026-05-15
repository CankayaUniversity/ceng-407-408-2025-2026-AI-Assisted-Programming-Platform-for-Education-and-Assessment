import { useEffect, useMemo, useState } from "react";
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
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import AccessTimeIcon        from "@mui/icons-material/AccessTime";
import LockIcon              from "@mui/icons-material/Lock";
import EventIcon             from "@mui/icons-material/Event";
import WarningIcon           from "@mui/icons-material/Warning";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import FilterListIcon        from "@mui/icons-material/FilterList";
import HistoryIcon           from "@mui/icons-material/History";
import CloseIcon             from "@mui/icons-material/Close";
import { useNavigate }       from "react-router-dom";

import AppLayout   from "../../components/layout/AppLayout";
import SectionCard from "../../components/common/SectionCard";
import { SubmissionTimelineDialog } from "../../components/student/SubmissionHistory";
import { API_BASE } from "../../apiBase";

// ── Helpers ───────────────────────────────────────────────────────────────────

function subStatusColor(status) {
  const s = (status ?? "").toLowerCase();
  if (s === "accepted" || s === "pass") return "success";
  if (s.includes("error") || s === "fail") return "error";
  if (s === "wrong_answer") return "warning";
  return "default";
}

function subFormatStatus(status) {
  return (status ?? "Unknown").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function subFormatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

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
  const due  = dueDate      ? new Date(dueDate).getTime()      : null;
  const late = lateDeadline ? new Date(lateDeadline).getTime() : null;

  if (!due) return null;

  const msRemaining = due - now;

  if (msRemaining > 0) {
    const totalMins = Math.floor(msRemaining / 60000);
    const days      = Math.floor(totalMins / 1440);
    const hours     = Math.floor((totalMins % 1440) / 60);
    const mins      = totalMins % 60;

    if (days > 1)      return { label: `${days}d ${hours}h left`,  status: "ok",   urgent: false };
    if (days === 1)    return { label: `1d ${hours}h left`,         status: "ok",   urgent: false };
    if (hours > 1)     return { label: `${hours}h ${mins}m left`,  status: "warn", urgent: true  };
    if (totalMins > 0) return { label: `${totalMins}m left`,       status: "warn", urgent: true  };
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

  const dueStr = new Date(assignment.dueDate).toLocaleDateString(undefined, {
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
    if (a.dueDate   && now > new Date(a.dueDate).getTime())   return "ended";
    return "active";
  }
  // unscheduled exam
  if (a.dueDate && now > new Date(a.dueDate).getTime()) return "ended";
  return "active";
}

// ── Exam assignment row ───────────────────────────────────────────────────────

function ExamRow({ a, idx, solvedSet, onHistoryClick }) {
  const navigate = useNavigate();
  const [dialogOpen,       setDialogOpen]       = useState(false);
  // "Are you sure you want to start the exam?" confirmation. Fires when a
  // student clicks a published, currently-active exam — gives them one
  // last chance to back out before the lockdown UI takes over.
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
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
    // Active exam → confirm before entering the lockdown UI.
    setStartConfirmOpen(true);
  }

  function enterExam() {
    setStartConfirmOpen(false);
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
              {!endLabel && (
                <Typography variant="caption" color="text.secondary">No time limit</Typography>
              )}
            </Stack>
          )}
          {state === "ended" && endLabel && (
            <Typography variant="caption" color="text.secondary">Ended: {endLabel}</Typography>
          )}
          {state === "open" && <DeadlineCell assignment={a} />}
        </TableCell>

        <TableCell>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            {statusChip}
            <Tooltip title="View submission history">
              <span>
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onHistoryClick(a); }}
                  sx={{ opacity: 0.6, "&:hover": { opacity: 1, color: "primary.main" } }}
                >
                  <HistoryIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </TableCell>
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

      {/* "Are you sure you want to start the exam?" confirmation.
          Fires when a student clicks a currently-active exam. Gives them
          one last chance to back out before the lockdown UI takes over. */}
      <Dialog
        open={startConfirmOpen}
        onClose={() => setStartConfirmOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LockIcon color="warning" />
          Start exam?
        </DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            You are about to start <strong>{a.title}</strong>.
          </Typography>
          <Alert severity="warning" icon={<WarningIcon />} sx={{ mt: 1 }}>
            Once you start, the navigation will be locked. Only the editor and
            terminal will be visible until you submit or time runs out. The AI
            mentor is disabled during exams.
          </Alert>
          {endLabel && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              Exam deadline: <strong>{endLabel}</strong>
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setStartConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={enterExam}
            startIcon={<LockIcon />}
          >
            Start exam
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// ── Assignment / Practice row ─────────────────────────────────────────────────

function AssignmentRow({ a, idx, solvedSet, onHistoryClick }) {
  const navigate = useNavigate();
  const problem   = a.problem ?? {};
  const solved    = solvedSet.has(problem.id);
  const langs     = a.allowedLanguages ?? [];
  const published = a.isPublished ?? false;
  const isLate    = (() => {
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
      <TableCell sx={{ borderLeft: 4, borderLeftColor: `${difficultyColor(problem.difficulty)}.main`, pl: 1.5 }}>
        {idx + 1}
      </TableCell>

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
        <Stack direction="row" alignItems="center" spacing={0.5}>
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
          <Tooltip title="View submission history">
            <span>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onHistoryClick(a); }}
                sx={{ opacity: 0.6, "&:hover": { opacity: 1, color: "primary.main" } }}
              >
                <HistoryIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </TableCell>
    </TableRow>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssignmentsPage({ currentUser, token, handleLogout, navItems }) {
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState(0);        // 0=homework, 1=practice, 2=exams
  const [filterLang,  setFilterLang]  = useState("all");    // language filter
  const [modeAnchor,  setModeAnchor]  = useState(null);     // mode-selector menu anchor

  // ── Submission history dialog ────────────────────────────────────────────
  // "List" dialog: shows the submission table for one assignment
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [historyTitle,   setHistoryTitle]   = useState("");
  const [historySubs,    setHistorySubs]    = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // "Detail" dialog: SubmissionTimelineDialog opened from a list row
  const [timelineOpen,   setTimelineOpen]   = useState(false);
  const [timelineIdx,    setTimelineIdx]    = useState(0);

  async function openHistory(a) {
    const problemId = a.problem?.id;
    if (!problemId) return;
    setHistoryTitle(a.title || a.problem?.title || "Submission History");
    setHistorySubs([]);
    setHistoryLoading(true);
    setHistoryOpen(true);
    try {
      const res  = await fetch(`${API_BASE}/api/student/history?problemId=${problemId}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const body = await res.json();
      setHistorySubs(body?.data ?? []);
    } catch {
      setHistorySubs([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  function openTimeline(idx) {
    setTimelineIdx(idx);
    setTimelineOpen(true);
  }

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

    Promise.all([
      fetch(`${API_BASE}/api/assignments`,     { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/api/student/history`, { headers }).then((r) => r.json()),
    ])
      .then(([assignRes, subRes]) => {
        const data = assignRes?.data ?? [];
        setAssignments(data);
        setSubmissions(subRes?.data ?? []);
        setFilterLang("all");

        // Auto-switch to the first non-empty tab so students don't land on a
        // blank "No homework yet" screen when only practice/exam assignments exist.
        const hw = data.filter((a) => a.mode === "homework");
        const pr = data.filter((a) => a.mode === "practice");
        const ex = data.filter((a) => a.mode === "exam");
        if (hw.length === 0 && pr.length > 0) setTab(1);
        else if (hw.length === 0 && pr.length === 0 && ex.length > 0) setTab(2);
      })
      .catch((err) => console.error("AssignmentsPage fetch failed:", err))
      .finally(() => setLoading(false));
  }, [token]);

  const solvedSet = new Set(
    submissions
      .filter((s) => s.status === "accepted")
      .map((s) => s.problemId),
  );

  const homework = assignments.filter((a) => a.mode === "homework");
  const practice = assignments.filter((a) => a.mode === "practice");
  const exams    = assignments.filter((a) => a.mode === "exam");

  const tabData = [
    { label: `Homework (${homework.length})`,  shortLabel: "Homework",  items: homework,  isExam: false },
    { label: `Practice (${practice.length})`,  shortLabel: "Practice",  items: practice,  isExam: false },
    { label: `Exams (${exams.length})`,        shortLabel: "Exams",     items: exams,     isExam: true  },
  ];

  const current = tabData[tab];

  // ── Available languages for current tab ──────────────────────────────────
  const availableLangs = useMemo(() => {
    const langs = new Set();
    current.items.forEach((a) => {
      (a.allowedLanguages ?? []).forEach((l) => langs.add(l));
    });
    return [...langs].sort();
  }, [current.items]);

  // ── Language filter: empty allowedLanguages = "any" → shown in all filters ─
  const filteredItems = useMemo(() => {
    if (filterLang === "all") return current.items;
    return current.items.filter((a) => {
      const langs = a.allowedLanguages ?? [];
      return langs.length === 0 || langs.includes(filterLang);
    });
  }, [current.items, filterLang]);

  // Reset language filter when mode tab changes
  function switchTab(idx) {
    setTab(idx);
    setFilterLang("all");
    setModeAnchor(null);
  }

  const total   = filteredItems.length;
  const solved  = current.isExam ? 0 : filteredItems.filter((a) => solvedSet.has(a.problem?.id)).length;
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
      <SectionCard>
        {/* ── Interactive header ──────────────────────────────────────────── */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
          {/* Clickable mode selector */}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Box sx={{ width: 3, height: 20, borderRadius: 2, bgcolor: "primary.main", flexShrink: 0 }} />
            <Button
              endIcon={<KeyboardArrowDownIcon />}
              onClick={(e) => setModeAnchor(e.currentTarget)}
              sx={{ fontWeight: 700, fontSize: "1.1rem", textTransform: "none", color: "text.primary", pl: 0.5 }}
            >
              {current.shortLabel}
            </Button>
          </Stack>

          {/* Language filter chips (only when there are multiple languages) */}
          {availableLangs.length > 0 && (
            <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
              <FilterListIcon fontSize="small" sx={{ color: "text.secondary" }} />
              <Chip
                label="All"
                size="small"
                variant={filterLang === "all" ? "filled" : "outlined"}
                color={filterLang === "all" ? "primary" : "default"}
                onClick={() => setFilterLang("all")}
                sx={{ cursor: "pointer" }}
              />
              {availableLangs.map((lang) => (
                <Chip
                  key={lang}
                  label={lang}
                  size="small"
                  variant={filterLang === lang ? "filled" : "outlined"}
                  color={filterLang === lang ? "primary" : "default"}
                  onClick={() => setFilterLang(lang)}
                  sx={{ cursor: "pointer", textTransform: "capitalize" }}
                />
              ))}
            </Stack>
          )}
        </Box>

        {/* Mode-selector dropdown menu */}
        <Menu
          anchorEl={modeAnchor}
          open={Boolean(modeAnchor)}
          onClose={() => setModeAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          {tabData.map((t, i) => (
            <MenuItem
              key={i}
              selected={tab === i}
              onClick={() => switchTab(i)}
              sx={{ fontWeight: tab === i ? 700 : 400 }}
            >
              {t.label}
            </MenuItem>
          ))}
        </Menu>

        {/* ── Content ────────────────────────────────────────────────────── */}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : current.items.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
            No {current.shortLabel.toLowerCase()} yet.
          </Typography>
        ) : filteredItems.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
            No {current.shortLabel.toLowerCase()} for language "{filterLang}".
          </Typography>
        ) : (
          <>
            {!current.isExam && (
              <Box sx={{ mb: 2 }}>
                <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 4 }} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {solved} / {total} completed
                  {filterLang !== "all" && ` · filtered by ${filterLang}`}
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
                  {filteredItems.map((a, idx) =>
                    current.isExam ? (
                      <ExamRow key={a.id} a={a} idx={idx} solvedSet={solvedSet} onHistoryClick={openHistory} />
                    ) : (
                      <AssignmentRow key={a.id} a={a} idx={idx} solvedSet={solvedSet} onHistoryClick={openHistory} />
                    )
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </SectionCard>

      {/* ── Submission history list dialog ──────────────────────────────── */}
      <Dialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <HistoryIcon color="primary" fontSize="small" />
            <Typography fontWeight={700} fontSize={16}>
              Submission History
            </Typography>
            {historyTitle && (
              <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 220 }}>
                — {historyTitle}
              </Typography>
            )}
          </Stack>
          <IconButton size="small" onClick={() => setHistoryOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0 }}>
          {historyLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : historySubs.length === 0 ? (
            <Typography
              color="text.secondary"
              variant="body2"
              sx={{ py: 4, textAlign: "center" }}
            >
              No submissions yet for this assignment.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "rgba(148,163,184,0.08)" }}>
                    <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Language</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Time</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historySubs.map((sub, idx) => (
                    <TableRow
                      key={sub.id}
                      hover
                      onClick={() => openTimeline(idx)}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell sx={{ color: "text.secondary" }}>
                        {historySubs.length - idx}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={subFormatStatus(sub.status)}
                          size="small"
                          color={subStatusColor(sub.status)}
                          variant="outlined"
                          sx={{ fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell>{sub.language ?? "—"}</TableCell>
                      <TableCell>
                        {sub.executionTime != null ? `${sub.executionTime.toFixed(0)} ms` : "—"}
                      </TableCell>
                      <TableCell sx={{ color: "text.secondary", fontSize: 13 }}>
                        {subFormatDate(sub.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Submission code viewer (opens from a row click above) ────────── */}
      {timelineOpen && historySubs.length > 0 && (
        <SubmissionTimelineDialog
          open={timelineOpen}
          onClose={() => setTimelineOpen(false)}
          submissions={historySubs}
          initialIndex={timelineIdx}
        />
      )}
    </AppLayout>
  );
}
