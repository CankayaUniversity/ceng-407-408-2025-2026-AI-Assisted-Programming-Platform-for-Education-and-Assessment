import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon  from "@mui/icons-material/CheckCircleOutline";
import LightbulbIcon           from "@mui/icons-material/Lightbulb";
import AddCommentIcon          from "@mui/icons-material/AddComment";
import BugReportIcon           from "@mui/icons-material/BugReport";
import PrintIcon               from "@mui/icons-material/Print";
import AccessTimeIcon          from "@mui/icons-material/AccessTime";
import ArrowBackIcon           from "@mui/icons-material/ArrowBack";
import ChevronLeftIcon         from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon        from "@mui/icons-material/ChevronRight";
import MenuBookIcon            from "@mui/icons-material/MenuBook";
import OpenInFullIcon          from "@mui/icons-material/OpenInFull";
import CloseFullscreenIcon     from "@mui/icons-material/CloseFullscreen";
import ExpandMoreIcon          from "@mui/icons-material/ExpandMore";
import ExpandLessIcon          from "@mui/icons-material/ExpandLess";
import FilterListIcon          from "@mui/icons-material/FilterList";
import LockIcon                from "@mui/icons-material/Lock";
import WarningAmberIcon        from "@mui/icons-material/WarningAmber";
import CheckIcon               from "@mui/icons-material/Check";
import { API_BASE }       from "../../apiBase";

import SectionCard         from "../common/SectionCard";
import AppLayout           from "../layout/AppLayout";
import SubmissionHistory   from "./SubmissionHistory";
import EditorTabBar        from "./EditorTabBar";
import InteractiveTerminal from "./InteractiveTerminal";
import { wsUrl }           from "../../wsBase";

function monacoLanguage(value) {
  if (value === "csharp") return "csharp";
  if (value === "cpp") return "cpp";
  return value || "python";
}

function useChatScroll(chat) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);
  return ref;
}

// ── exam state helper (mirrors AssignmentsPage) ───────────────────────────────
function examState(a) {
  if (a.mode !== "exam") return "open";
  const now = Date.now();
  if (a.examType === "scheduled") {
    if (a.startDate && now < new Date(a.startDate).getTime()) return "not_started";
    if (a.dueDate   && now > new Date(a.dueDate).getTime())   return "ended";
    return "active";
  }
  if (a.dueDate && now > new Date(a.dueDate).getTime()) return "ended";
  return "active";
}

export default function StudentWorkspace({
  currentUser,
  selectedProblem,
  navItems,
  handleLogout,
  problems,
  assignments = [],
  assignmentsLoading = false,
  onAssignmentSelect,
  selectedId,
  selectProblem,
  selectedLanguage,
  setSelectedLanguage,
  languageOptions,
  runRaw,
  running,
  runTests,
  // Phase 7 — multi-file
  files,
  activeFileId,
  onFileSelect,
  onFileAdd,
  onFileClose,
  onFileRename,
  code,
  setCode,
  // Phase 6 — xterm writer ref (owned by ProblemPage)
  termWriterRef,
  onTerminalRunResult,
  chat,
  chatInput,
  setChatInput,
  sendChat,
  sendHint,
  sendDebugPrints,
  hintCount = 0,
  chatLoading,
  submissions,
  submissionsLoading,
  examMode,
  examTimeLeft = null,
  fmtExamTime,
  lateDeduction = 0,
  // Exam security props
  examLocked = false,
  examViolations = 0,
  violationSnackbarOpen = false,
  violationSnackbarMsg = "",
  onViolationSnackbarClose,
  finishExamDialogOpen = false,
  onFinishExamRequest,
  onFinishExamConfirm,
  onFinishExamCancel,
  // Flashcard (manual trigger) props
  hasSolvedProblem = false,
  flashcardExists = false,
  flashcardGenerating = false,
  flashcardToastOpen = false,
  onCreateFlashcards,
  onFlashcardToastClose,
  token,
  tutorialLanguage = "c",
  onNewChat,
}) {
  const chatBottomRef = useChatScroll(chat);

  // ── Layout state ──────────────────────────────────────────────────────────
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [mentorZoomed,  setMentorZoomed]  = useState(false);

  // ── Monaco editor ref (Phase 6 — debug improvements) ──────────────────────
  // Captured via the Editor's onMount. Used by:
  //   (a) Clickable error-line links — jump the cursor to a specific line
  //       when the user clicks `line 17` / `main.c:17:` in the terminal.
  //   (c) "Add debug prints" — read the current cursor line and a window of
  //       code around it to send as editor context to the mentor.
  const monacoEditorRef = useRef(null);

  function jumpToLine(lineNumber) {
    const editor = monacoEditorRef.current;
    if (!editor || !Number.isFinite(lineNumber) || lineNumber <= 0) return;
    try {
      editor.revealLineInCenter(lineNumber);
      editor.setPosition({ lineNumber, column: 1 });
      editor.focus();
    } catch { /* editor may have unmounted between callback and click */ }
  }

  /**
   * Build a small code window around the cursor, prefixing the cursor line
   * with "> " so both the mentor prompt and the quality-check module can
   * spot which line is the focus of attention.
   *
   * Returns { activeLineNumber, selectedCodeContext } or null if the editor
   * isn't ready.
   */
  function getCursorContext(windowLines = 5) {
    const editor = monacoEditorRef.current;
    if (!editor) return null;
    const position = editor.getPosition?.();
    const model    = editor.getModel?.();
    if (!position || !model) return null;
    const cursorLine = position.lineNumber;
    const totalLines = model.getLineCount();
    const start = Math.max(1, cursorLine - windowLines);
    const end   = Math.min(totalLines, cursorLine + windowLines);
    const widthN = String(end).length;
    const lines = [];
    for (let n = start; n <= end; n++) {
      const prefix = n === cursorLine ? "> " : "  ";
      lines.push(`${prefix}${String(n).padStart(widthN, " ")}: ${model.getLineContent(n)}`);
    }
    return {
      activeLineNumber:    cursorLine,
      selectedCodeContext: lines.join("\n"),
    };
  }

  // Lock body scroll while the mentor zoom overlay is active so the page
  // behind it doesn't jump when the user scrolls inside the overlay.
  useEffect(() => {
    document.body.style.overflow = mentorZoomed ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mentorZoomed]);

  // ── Left panel tabs ───────────────────────────────────────────────────────
  const [leftTab,          setLeftTab]          = useState(0); // 0=assignments 1=tutorials
  const [tutorialList,     setTutorialList]     = useState(null);

  // ── Assignment panel: mode selector + language filter ────────────────────
  const [assignMode,       setAssignMode]       = useState(0);    // 0=homework 1=practice 2=exams
  const [assignLang,       setAssignLang]       = useState("all");
  const [assignModeAnchor, setAssignModeAnchor] = useState(null);

  const assignModeDefs = useMemo(() => {
    const hw  = assignments.filter((a) => a.mode === "homework");
    const pr  = assignments.filter((a) => a.mode === "practice");
    const ex  = assignments.filter((a) => a.mode === "exam");
    return [
      { label: `Homework (${hw.length})`,  short: "Homework",  items: hw  },
      { label: `Practice (${pr.length})`,  short: "Practice",  items: pr  },
      { label: `Exams (${ex.length})`,     short: "Exams",     items: ex  },
    ];
  }, [assignments]);

  const currentMode     = assignModeDefs[assignMode];
  const assignLangList  = useMemo(() => {
    const set = new Set();
    currentMode.items.forEach((a) => (a.allowedLanguages ?? []).forEach((l) => set.add(l)));
    return [...set].sort();
  }, [currentMode]);

  const filteredAssignments = useMemo(() => {
    if (assignLang === "all") return currentMode.items;
    return currentMode.items.filter((a) => {
      const langs = a.allowedLanguages ?? [];
      return langs.length === 0 || langs.includes(assignLang);
    });
  }, [currentMode, assignLang]);

  function switchAssignMode(idx) {
    setAssignMode(idx);
    setAssignLang("all");
    setAssignModeAnchor(null);
  }
  const [selectedTutorial, setSelectedTutorial] = useState(null); // { tag, title }
  const [tutorialContent,  setTutorialContent]  = useState(null); // full content object
  const [tutorialStatus,   setTutorialStatus]   = useState("idle");
  const [selectedSection,  setSelectedSection]  = useState(null); // single section object
  const [tutorialExpanded, setTutorialExpanded] = useState(false);
  const [descOpen,         setDescOpen]         = useState(true);

  // Load tutorial index when Tutorials tab is first opened
  useEffect(() => {
    if (leftTab !== 1 || tutorialList !== null) return;
    fetch(`${API_BASE}/api/tutorials/index/${tutorialLanguage}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((body) => setTutorialList(body?.data ?? []))
      .catch(() => setTutorialList([]));
  }, [leftTab, tutorialList, token, tutorialLanguage]);

  // Level 1 → Level 2: open topic, load sections list
  function openTutorial(tag, title) {
    setSelectedTutorial({ tag, title });
    setSelectedSection(null);
    setTutorialContent(null);
    setTutorialStatus("loading");
    fetch(`${API_BASE}/api/tutorials/${encodeURIComponent(tag)}/${encodeURIComponent(tutorialLanguage)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((body) => { setTutorialContent(body?.data?.content ?? null); setTutorialStatus("ready"); })
      .catch(() => setTutorialStatus("error"));
  }

  // Level 2 → Level 1: back to topic list
  function backToList() {
    setSelectedTutorial(null);
    setSelectedSection(null);
    setTutorialContent(null);
    setTutorialStatus("idle");
  }

  // Level 3 → Level 2: back to section list
  function backToSections() {
    setSelectedSection(null);
  }

  return (
    <AppLayout
      title="AI Mentor"
      roleLabel="Student"
      userLabel={currentUser?.name || currentUser?.email}
      onLogout={handleLogout}
      navItems={navItems}
      maxWidth="xl"
      showPageTitle={false}
      // Exam-mode lockdown — strips the top nav so students can't click
      // away from the current problem until they submit or time runs out.
      lockdown={Boolean(examMode)}
    >
      {/* ── Exam countdown banner ─────────────────────────────────────────── */}
      {examMode && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1,
            py: 0.75,
            px: 2,
            mb: 1.5,
            borderRadius: 2,
            bgcolor: examLocked
              ? "error.dark"
              : examTimeLeft === null
              ? "warning.main"
              : examTimeLeft < 300000
              ? "error.main"
              : examTimeLeft < 1800000
              ? "warning.main"
              : "primary.main",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          {/* Left: timer */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {examLocked ? <LockIcon fontSize="small" /> : <AccessTimeIcon fontSize="small" />}
            {examLocked ? (
              <span>Exam Locked — submission recorded</span>
            ) : examTimeLeft !== null ? (
              <span>Exam — Time Remaining: {fmtExamTime(examTimeLeft)}</span>
            ) : (
              <span>Exam Mode — No time limit set</span>
            )}
          </Box>

          {/* Right: violation indicator */}
          {!examLocked && examViolations > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: 13, opacity: 0.95 }}>
              <WarningAmberIcon sx={{ fontSize: 16 }} />
              <span>Violations: {examViolations}/3</span>
            </Box>
          )}
        </Box>
      )}

      <Box
        sx={{
          display: "grid",
          gap: mentorZoomed ? 2 : 3,
          ...(mentorZoomed
            ? {
                position: "fixed",
                top: "60px",   // clear the fixed AppBar (minHeight: 60, zIndex: 1201)
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1200,
                bgcolor: "background.default",
                p: 2,
                gridTemplateColumns: "58fr 42fr",
                gridTemplateRows: "1fr",
                overflow: "hidden",
              }
            : examMode
              // Exam-mode lockdown — single column, editor takes the full width.
              // The assignments panel + AI mentor chat are both hidden so only
              // the problem description, editor, and terminal are visible.
              ? {
                  gridTemplateColumns: "1fr",
                  alignItems: "start",
                }
              : {
                  gridTemplateColumns: leftPanelOpen
                    ? { xs: "1fr", md: "minmax(260px, 320px) minmax(0, 1fr) minmax(280px, 360px)" }
                    : { xs: "1fr", md: "40px minmax(0, 1fr) minmax(320px, 440px)" },
                  alignItems: "start",
                }
          ),
        }}
      >
        {/* ── Left panel: Assignments / Tutorials tabs ──────────────────
            Hidden completely in exam mode so the student can't navigate
            to other assignments mid-exam. */}
        <Box
          sx={
            (mentorZoomed || examMode)
              ? { display: "none" }
              : leftPanelOpen
                ? { border: 1, borderColor: "divider", borderRadius: 3, overflow: "hidden", bgcolor: "background.paper" }
                : { display: "flex", flexDirection: "column", alignItems: "center", border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "background.paper", py: 1 }
          }
        >
          {leftPanelOpen ? (
            <>
              {/* Tab bar + collapse button */}
              <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
                <Tabs
                  value={leftTab}
                  onChange={(_, v) => setLeftTab(v)}
                  variant="fullWidth"
                  sx={{ flex: 1, minHeight: 40 }}
                >
                  <Tab label="Assignments" sx={{ fontSize: 12, minHeight: 40, py: 0 }} />
                  <Tab
                    label="Tutorials"
                    sx={{ fontSize: 12, minHeight: 40, py: 0 }}
                    icon={<MenuBookIcon sx={{ fontSize: 14 }} />}
                    iconPosition="start"
                  />
                </Tabs>
                <Tooltip title="Collapse panel">
                  <IconButton
                    size="small"
                    onClick={() => { setLeftPanelOpen(false); setAssignModeAnchor(null); }}
                    sx={{ mr: 0.5, flexShrink: 0 }}
                  >
                    <ChevronLeftIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>

              <Box sx={{ p: 1.5 }}>
            {/* ── Assignments ── */}
            {leftTab === 0 && (
              assignmentsLoading ? (
                /* Loading state — prevents flicker from empty→populated */
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : assignments.length === 0 ? (
                /* Fallback: no enrolled assignments — show raw problem list */
                problems.length === 0
                  ? <Typography color="text.secondary" sx={{ p: 1 }}>No assignments available.</Typography>
                  : <List disablePadding>
                      {problems.map((p) => {
                        const isSelected = p.id === selectedId;
                        const diffColor = p.difficulty === "Easy" ? "#22c55e" : p.difficulty === "Medium" ? "#f59e0b" : p.difficulty === "Hard" ? "#ef4444" : "#64748b";
                        return (
                          <ListItemButton key={p.id} selected={isSelected} onClick={() => selectProblem(p.id)}
                            sx={{ mb: 1, border: 1, borderColor: isSelected ? "primary.main" : "divider", borderRadius: 2, alignItems: "flex-start", bgcolor: isSelected ? "rgba(99,102,241,0.08)" : "transparent" }}>
                            <ListItemText primary={p.title} secondary={p.language || "n/a"} primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: diffColor, flexShrink: 0, mt: 1.2, ml: 1 }} />
                          </ListItemButton>
                        );
                      })}
                    </List>
              ) : (
                /* Grouped assignment panel */
                <Box>
                  {/* Mode selector — three side-by-side toggle buttons so all
                      modes (Homework / Practice / Exams) are visible at once
                      without opening a dropdown. */}
                  <ToggleButtonGroup
                    value={assignMode}
                    exclusive
                    onChange={(_, v) => { if (v !== null) switchAssignMode(v); }}
                    size="small"
                    fullWidth
                    sx={{
                      mb: 1.25,
                      "& .MuiToggleButton-root": {
                        py: 0.5,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "none",
                        lineHeight: 1.2,
                      },
                    }}
                  >
                    {assignModeDefs.map((m, i) => (
                      <ToggleButton key={i} value={i}>
                        {m.short}
                        <Box
                          component="span"
                          sx={{
                            ml: 0.5,
                            opacity: 0.6,
                            fontWeight: 500,
                          }}
                        >
                          ({m.items.length})
                        </Box>
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>

                  {/* Language filter chips */}
                  {assignLangList.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1.25 }} alignItems="center">
                      <FilterListIcon sx={{ fontSize: 13, color: "text.secondary" }} />
                      <Chip
                        label="All"
                        size="small"
                        variant={assignLang === "all" ? "filled" : "outlined"}
                        color={assignLang === "all" ? "primary" : "default"}
                        onClick={() => setAssignLang("all")}
                        sx={{ cursor: "pointer", height: 18, fontSize: 10, "& .MuiChip-label": { px: 0.75 } }}
                      />
                      {assignLangList.map((lang) => (
                        <Chip
                          key={lang}
                          label={lang}
                          size="small"
                          variant={assignLang === lang ? "filled" : "outlined"}
                          color={assignLang === lang ? "primary" : "default"}
                          onClick={() => setAssignLang(lang)}
                          sx={{ cursor: "pointer", height: 18, fontSize: 10, "& .MuiChip-label": { px: 0.75 } }}
                        />
                      ))}
                    </Stack>
                  )}

                  {/* Assignment list */}
                  {filteredAssignments.length === 0 ? (
                    <Typography color="text.secondary" variant="caption" sx={{ px: 0.5 }}>
                      {assignLang !== "all"
                        ? `No ${currentMode.short.toLowerCase()} for "${assignLang}".`
                        : `No ${currentMode.short.toLowerCase()} yet.`}
                    </Typography>
                  ) : (
                    <List disablePadding sx={{ maxHeight: 480, overflowY: "auto" }}>
                      {filteredAssignments.map((a) => {
                        const problem    = a.problem ?? {};
                        const isSelected = problem.id === selectedId;
                        const state      = examState(a);
                        const isLocked   = a.mode === "exam" && state === "not_started";
                        const isEnded    = a.mode === "exam" && state === "ended";
                        const langs      = a.allowedLanguages ?? [];

                        return (
                          <ListItemButton
                            key={a.id}
                            selected={isSelected}
                            disabled={isLocked || isEnded}
                            onClick={() => onAssignmentSelect?.(a)}
                            sx={{
                              mb: 0.75,
                              border: 1,
                              borderColor: isSelected ? "primary.main" : "divider",
                              borderRadius: 2,
                              alignItems: "flex-start",
                              bgcolor: isSelected ? "rgba(99,102,241,0.08)" : "transparent",
                              opacity: isEnded ? 0.5 : 1,
                            }}
                          >
                            <ListItemText
                              primary={
                                <Stack direction="row" alignItems="center" spacing={0.5}>
                                  {isLocked && <LockIcon sx={{ fontSize: 12, color: "text.disabled" }} />}
                                  <Typography variant="body2" fontWeight={600} fontSize={13} noWrap>
                                    {a.title}
                                  </Typography>
                                </Stack>
                              }
                              secondary={
                                langs.length > 0
                                  ? langs.join(", ")
                                  : (problem.language || "Any")
                              }
                              secondaryTypographyProps={{ fontSize: 11 }}
                            />
                          </ListItemButton>
                        );
                      })}
                    </List>
                  )}
                </Box>
              )
            )}

            {/* ── Tutorials ── */}
            {leftTab === 1 && (
              <Box>
                {/* Topic list */}
                {!selectedTutorial && (
                  <>
                    {/* Language label */}
                    <Box sx={{ mb: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                      <Chip
                        label="C"
                        size="small"
                        color="primary"
                        sx={{ fontWeight: 700, fontSize: 12 }}
                      />
                      <Typography variant="caption" color="text.secondary">Language</Typography>
                    </Box>

                    {tutorialList === null && <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress size={24} /></Box>}
                    {tutorialList !== null && tutorialList.length === 0 && <Typography color="text.secondary" sx={{ p: 1 }}>No tutorials available.</Typography>}
                    {tutorialList !== null && tutorialList.length > 0 && (
                      <Box sx={{ maxHeight: 520, overflowY: "auto", pr: 0.5 }}>
                        {tutorialList.map((group) => (
                          <Box key={group.category} sx={{ mb: 1.5 }}>
                            {/* Main category — e.g. "C Tutorial", "C Functions" */}
                            <Typography
                              variant="caption"
                              fontWeight={700}
                              color="primary.main"
                              sx={{ display: "block", mb: 0.5, px: 0.5, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10 }}
                            >
                              {group.category}
                            </Typography>

                            {/* Sub-categories (e.g. "C Data Types") and their topics */}
                            {(group.subCategories ?? []).map((sub, sIdx) => (
                              <Box key={sub.subCategory ?? `__none__-${sIdx}`} sx={{ mb: 0.5 }}>
                                {/* Show the sub-category label only when present.
                                    Topics under a null sub-category are rendered
                                    directly under the main category. */}
                                {sub.subCategory && (
                                  <Typography
                                    variant="caption"
                                    fontWeight={600}
                                    sx={{
                                      display: "block",
                                      mt: 0.75, mb: 0.25, px: 1,
                                      color: "text.secondary",
                                      fontSize: 11,
                                    }}
                                  >
                                    {sub.subCategory}
                                  </Typography>
                                )}
                                <List disablePadding sx={{ pl: sub.subCategory ? 0.5 : 0 }}>
                                  {sub.topics.map((t) => (
                                    <ListItemButton
                                      key={t.tag}
                                      onClick={() => openTutorial(t.tag, t.title)}
                                      sx={{
                                        mb: 0.25,
                                        borderRadius: 1.5,
                                        border: 1,
                                        borderColor: "divider",
                                        py: 0.5,
                                      }}
                                    >
                                      <ListItemText
                                        primary={t.title}
                                        primaryTypographyProps={{ fontSize: 12, fontWeight: 500 }}
                                      />
                                    </ListItemButton>
                                  ))}
                                </List>
                              </Box>
                            ))}
                          </Box>
                        ))}
                      </Box>
                    )}
                  </>
                )}

                {/* ── Level 2: section list ── */}
                {selectedTutorial && !selectedSection && (
                  <Box>
                    {/* Header */}
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                      <Button startIcon={<ArrowBackIcon />} size="small" onClick={backToList} sx={{ fontSize: 12 }}>
                        Topics
                      </Button>
                      <Tooltip title={tutorialExpanded ? "Collapse" : "Expand"}>
                        <IconButton size="small" onClick={() => setTutorialExpanded((v) => !v)}>
                          {tutorialExpanded ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </Stack>

                    {/* Topic title */}
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, px: 0.5 }}>
                      {selectedTutorial.title}
                    </Typography>

                    {tutorialStatus === "loading" && (
                      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress size={24} /></Box>
                    )}
                    {tutorialStatus === "error" && (
                      <Alert severity="error" sx={{ borderRadius: 2 }}>Failed to load tutorial.</Alert>
                    )}

                    {/* Section list */}
                    {tutorialStatus === "ready" && tutorialContent && (
                      <List disablePadding sx={{ maxHeight: 480, overflowY: "auto", pr: 0.5 }}>
                        {(tutorialContent.sections ?? []).map((section, idx) => (
                          <ListItemButton
                            key={idx}
                            onClick={() => setSelectedSection(section)}
                            sx={{ mb: 0.25, borderRadius: 1.5, border: 1, borderColor: "divider", py: 0.75, pl: 1.5 }}
                          >
                            <ListItemText
                              primary={section.heading || `Section ${idx + 1}`}
                              primaryTypographyProps={{ fontSize: 12, fontWeight: 500 }}
                            />
                          </ListItemButton>
                        ))}
                      </List>
                    )}
                  </Box>
                )}

                {/* ── Level 3: section content ── */}
                {selectedTutorial && selectedSection && (
                  <Box>
                    {/* Header */}
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                      <Button startIcon={<ArrowBackIcon />} size="small" onClick={backToSections} sx={{ fontSize: 12 }}>
                        {selectedTutorial.title}
                      </Button>
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Export as PDF">
                          <IconButton
                            size="small"
                            onClick={() => {
                              // Store title for the print header, then trigger browser print
                              document.title = `${selectedTutorial.title} — ${selectedSection.heading}`;
                              window.print();
                              // Restore title after a short delay
                              setTimeout(() => { document.title = "AI Programming Platform"; }, 2000);
                            }}
                          >
                            <PrintIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={tutorialExpanded ? "Collapse" : "Expand"}>
                          <IconButton size="small" onClick={() => setTutorialExpanded((v) => !v)}>
                            {tutorialExpanded ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>

                    {/* Section heading */}
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, px: 0.5 }}>
                      {selectedSection.heading}
                    </Typography>

                    {/* Content — data-print-tutorial marks it for @media print */}
                    <Box
                      data-print-tutorial="true"
                      sx={{ maxHeight: tutorialExpanded ? "none" : 480, overflowY: tutorialExpanded ? "visible" : "auto", pr: 0.5 }}
                    >
                      {selectedSection.body && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", mb: selectedSection.code ? 1.5 : 0, lineHeight: 1.8, whiteSpace: "pre-wrap" }}
                        >
                          {selectedSection.body}
                        </Typography>
                      )}
                      {selectedSection.code && (
                        <Box sx={{ borderRadius: 1.5, overflow: "hidden", border: 1, borderColor: "divider" }}>
                          <Editor
                            height={`${Math.min(Math.max(selectedSection.code.split("\n").length * 19 + 16, 60), 320)}px`}
                            language={tutorialLanguage ?? "c"}
                            value={selectedSection.code}
                            theme="vs-dark"
                            options={{
                              readOnly: true,
                              minimap: { enabled: false },
                              fontSize: 12,
                              lineNumbers: "off",
                              scrollBeyondLastLine: false,
                              padding: { top: 8, bottom: 8 },
                              automaticLayout: true,
                            }}
                          />
                        </Box>
                      )}
                      {!selectedSection.body && !selectedSection.code && (
                        <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>
                          No content available for this section.
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}
              </Box>
            )}
              </Box>
            </>
          ) : (
            /* Collapsed state — just the expand button */
            <Tooltip title="Open panel" placement="right">
              <IconButton size="small" onClick={() => setLeftPanelOpen(true)}>
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Scrollable wrapper — only active in zoom mode so content is never clipped */}
        <Box sx={mentorZoomed ? { overflow: "auto" } : {}}>
        <SectionCard
          title={selectedProblem?.title || "Code Editor"}
          action={
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              {/* Exam: "Finish Exam" button appears when all tests pass (not locked) */}
              {examMode && hasSolvedProblem && !examLocked && (
                <Button
                  variant="contained"
                  size="small"
                  color="success"
                  startIcon={<CheckIcon />}
                  onClick={onFinishExamRequest}
                  sx={{ fontWeight: 700, whiteSpace: "nowrap" }}
                >
                  Finish Exam
                </Button>
              )}
              {/* Non-exam: Create Flashcards button — shown after solving, hidden once generated */}
              {!examMode && hasSolvedProblem && !flashcardExists && (
                <Button
                  variant="outlined"
                  size="small"
                  color="secondary"
                  disabled={flashcardGenerating}
                  startIcon={flashcardGenerating ? <CircularProgress size={14} color="inherit" /> : <span>🃏</span>}
                  onClick={onCreateFlashcards}
                  sx={{ fontWeight: 600, whiteSpace: "nowrap" }}
                >
                  {flashcardGenerating ? "Creating flashcards…" : "Create Flashcards"}
                </Button>
              )}
              {/* Hide selector when assignment locks to a single language */}
              {languageOptions.length === 1 ? (
                <Chip
                  label={languageOptions[0].label}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 600, px: 1 }}
                />
              ) : (
                <FormControl size="small" sx={{ minWidth: 160 }} disabled={examLocked}>
                  <InputLabel id="language-select-label">Language</InputLabel>
                  <Select
                    labelId="language-select-label"
                    value={selectedLanguage}
                    label="Language"
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                  >
                    {languageOptions.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              <Button variant="contained" onClick={runRaw} disabled={running || examLocked}>
                {running ? "Running..." : "Run"}
              </Button>
              <Button variant="contained" onClick={runTests} disabled={running || !selectedProblem || examLocked}>
                Submit
              </Button>
            </Stack>
          }
        >
          {/* Exam locked banner */}
          {examMode && examLocked && (
            <Alert
              severity="error"
              icon={<LockIcon fontSize="inherit" />}
              sx={{ mb: 1.5, borderRadius: 2, fontWeight: 600 }}
            >
              This exam has been locked. No further edits are allowed.
            </Alert>
          )}

          {/* Late submission warning */}
          {lateDeduction > 0 && (
            <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2 }}>
              You are submitting late. A <strong>{lateDeduction}%</strong> point deduction will be applied to your score.
            </Alert>
          )}

          {/* Difficulty / language chips + description toggle */}
          <Box sx={{ mb: 1, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            {selectedProblem?.difficulty && <Chip label={selectedProblem.difficulty} size="small" />}
            {selectedProblem?.language   && <Chip label={selectedProblem.language}   size="small" variant="outlined" />}
            {selectedProblem?.description && (
              <Chip
                label={descOpen ? "Hide Description" : "Show Description"}
                size="small"
                variant="outlined"
                icon={descOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                onClick={() => setDescOpen((v) => !v)}
                sx={{ cursor: "pointer", ml: "auto" }}
              />
            )}
          </Box>

          {/* Problem description — collapsible, markdown-rendered */}
          {selectedProblem?.description && descOpen && (
            <Box
              sx={{
                mb: 2, p: 2,
                bgcolor: "rgba(99,102,241,0.06)",
                border: 1, borderColor: "rgba(99,102,241,0.2)", borderRadius: 2,
                // Markdown prose styles
                "& p":        { margin: "0 0 0.6em", lineHeight: 1.8 },
                "& p:last-child": { mb: 0 },
                "& strong":   { fontWeight: 700 },
                "& em":       { fontStyle: "italic" },
                "& code":     { fontFamily: "monospace", fontSize: "0.85em", bgcolor: "rgba(0,0,0,0.12)", px: 0.5, borderRadius: 0.5 },
                "& pre":      { bgcolor: "rgba(0,0,0,0.16)", p: 1.5, borderRadius: 1, overflowX: "auto", "& code": { bgcolor: "transparent", p: 0 } },
                "& ul, & ol": { pl: 2.5, mb: 0.5 },
                "& li":       { mb: 0.25 },
                "& h1, & h2, & h3": { fontWeight: 700, mt: 1, mb: 0.5 },
              }}
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(/** @type {string} */ (marked.parse(selectedProblem.description))),
              }}
            />
          )}

          {/* Extra Run / Submit toolbar — directly above the editor.
              Mirrors the pair in the top-of-page action stack so students
              don't have to scroll up when the description is expanded.
              Includes "Debug prints" — asks the mentor to insert temporary
              print/log statements around the cursor line. Hidden in exam
              mode because AI assistance is restricted during exams. */}
          <Stack
            direction="row"
            spacing={1}
            sx={{ mb: 1.5, justifyContent: "flex-end" }}
          >
            {!examMode && sendDebugPrints && (
              <Tooltip title="Ask the mentor to add temporary debug prints around your cursor line">
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    const ctx = getCursorContext();
                    sendDebugPrints(ctx ?? {});
                  }}
                  disabled={chatLoading || examLocked}
                  startIcon={<BugReportIcon />}
                >
                  Debug prints
                </Button>
              </Tooltip>
            )}
            <Button
              variant="contained"
              size="small"
              onClick={runRaw}
              disabled={running || examLocked}
            >
              {running ? "Running..." : "Run"}
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={runTests}
              disabled={running || !selectedProblem || examLocked}
            >
              Submit
            </Button>
          </Stack>

          {/* Phase 7 — multi-file tab bar (locked during exam lock) */}
          <EditorTabBar
            files={files}
            activeId={activeFileId}
            onSelect={onFileSelect}
            onAdd={examLocked    ? undefined       : onFileAdd}
            onClose={examLocked  ? () => {}        : onFileClose}
            onRename={examLocked ? () => {}        : onFileRename}
          />

          {/* Monaco editor — rounded bottom corners only */}
          <Box sx={{ height: mentorZoomed ? "52vh" : 460, overflow: "hidden", border: 1, borderTop: 0, borderColor: "divider", borderRadius: "0 0 12px 12px" }}>
            <Editor
              key={`${monacoLanguage(selectedLanguage)}-${activeFileId}`}
              height="100%"
              language={monacoLanguage(selectedLanguage)}
              value={code}
              onChange={(v) => setCode(v ?? "")}
              onMount={(editor) => { monacoEditorRef.current = editor; }}
              theme="vs-dark"
              options={{
                minimap:              { enabled: false },
                fontSize:             13,
                automaticLayout:      true,
                scrollBeyondLastLine: false,
                readOnly:             examLocked,
              }}
            />
          </Box>

          {/* Extra Run / Submit toolbar — directly below the editor, above
              the terminal. So students always have a button within reach. */}
          <Stack
            direction="row"
            spacing={1}
            sx={{ mt: 1.5, mb: 1.5, justifyContent: "flex-end" }}
          >
            <Button
              variant="contained"
              size="small"
              onClick={runRaw}
              disabled={running || examLocked}
            >
              {running ? "Running..." : "Run"}
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={runTests}
              disabled={running || !selectedProblem || examLocked}
            >
              Submit
            </Button>
          </Stack>

          {/* Phase 6 — xterm.js interactive terminal */}
          <Box
            sx={{
              mt: 2,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "#0f172a",
            }}
          >
            {/* Terminal control bar — always visible so users know the controls */}
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{
                px: 1.5, py: 0.75,
                bgcolor: "rgba(255,255,255,0.04)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <Typography variant="caption" sx={{ color: "#64748b", flexGrow: 1, fontSize: 11 }}>
                {running ? "● Running — type input + Enter" : "Terminal"}
              </Typography>
              <Tooltip title="Send EOF (Ctrl+D) — signals end of input for programs that read until EOF">
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!running}
                    onClick={() => termWriterRef.current?.sendEof?.()}
                    sx={{
                      fontSize: 11, py: 0.25, px: 1, minWidth: 0,
                      color: "warning.main", borderColor: "warning.dark",
                      "&:hover": { borderColor: "warning.main" },
                      "&.Mui-disabled": { opacity: 0.3 },
                    }}
                  >
                    EOF (Ctrl+D)
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="Stop process (Ctrl+C)">
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!running}
                    onClick={() => termWriterRef.current?.kill?.()}
                    sx={{
                      fontSize: 11, py: 0.25, px: 1, minWidth: 0,
                      color: "error.main", borderColor: "error.dark",
                      "&:hover": { borderColor: "error.main" },
                      "&.Mui-disabled": { opacity: 0.3 },
                    }}
                  >
                    Stop (Ctrl+C)
                  </Button>
                </span>
              </Tooltip>
            </Stack>
            <Box sx={{ height: mentorZoomed ? "20vh" : 220 }}>
              <InteractiveTerminal
                wsUrl={wsUrl("/ws/terminal")}
                onReady={(writer) => { termWriterRef.current = writer; }}
                onRunResult={onTerminalRunResult}
                onErrorLineClick={jumpToLine}
              />
            </Box>
          </Box>

          {!mentorZoomed && !examMode && (
            <Box sx={{ mt: 2 }}>
              <SubmissionHistory submissions={submissions} loading={submissionsLoading} />
            </Box>
          )}
        </SectionCard>
        </Box>{/* end editor scroll wrapper */}

        {/* AI Mentor Chat — hidden entirely in exam mode per project spec
            (AI assistance is restricted in exam mode for academic integrity). */}
        {!examMode && (
        <Box sx={mentorZoomed ? { overflow: "auto" } : {}}>
        <SectionCard
          title="AI Mentor Chat"
          action={
            <Stack direction="row" spacing={1} alignItems="center">
              {onNewChat && !examMode && (
                <Tooltip title="Start a new conversation — AI will forget previous messages for this problem">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddCommentIcon />}
                    onClick={onNewChat}
                    disabled={chatLoading}
                  >
                    New Chat
                  </Button>
                </Tooltip>
              )}
              <Tooltip title={mentorZoomed ? "Exit full-screen focus" : "Full-screen focus mode"}>
                <IconButton size="small" onClick={() => setMentorZoomed((v) => !v)}>
                  {mentorZoomed
                    ? <CloseFullscreenIcon fontSize="small" />
                    : <OpenInFullIcon fontSize="small" />
                  }
                </IconButton>
              </Tooltip>
            </Stack>
          }
        >
          {examMode ? (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              Exam mode is active. AI Mentor is currently disabled.
            </Alert>
          ) : (
            <>
              <Box
                ref={chatBottomRef}
                sx={{
                  minHeight: mentorZoomed ? "calc(100vh - 280px)" : 420,
                  maxHeight: mentorZoomed ? "calc(100vh - 280px)" : 520,
                  overflow: "auto",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 2,
                  p: 2,
                  bgcolor: "background.default",
                }}
              >
                <Stack spacing={1}>
                  {chat.map((m, i) => {
                    const isUser = m.role === "user";
                    return (
                      <Box
                        key={i}
                        sx={{
                          display: "flex",
                          justifyContent: isUser ? "flex-end" : "flex-start",
                        }}
                      >
                        <Box
                          sx={{
                            maxWidth: "88%",
                            px: 1.5,
                            py: 1,
                            borderRadius: isUser
                              ? "14px 14px 4px 14px"
                              : "14px 14px 14px 4px",
                            bgcolor: isUser
                              ? "rgba(14,165,233,0.16)"
                              : "rgba(99,102,241,0.14)",
                            border: "1px solid",
                            borderColor: isUser
                              ? "rgba(14,165,233,0.28)"
                              : "rgba(99,102,241,0.22)",
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              display: "block",
                              fontWeight: 700,
                              mb: 0.25,
                              color: isUser ? "#38bdf8" : "#a5b4fc",
                            }}
                          >
                            {isUser ? "You" : "AI Mentor"}
                          </Typography>
                          <Typography
                            variant="body2"
                            component="div"
                            sx={{
                              "& p": { mt: 0, mb: 0.5 },
                              "& pre": { overflowX: "auto" },
                              "& code": { fontSize: 12 },
                            }}
                          >
                            {isUser ? (
                              <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
                            ) : m.streaming && !m.content ? (
                              <span style={{ opacity: 0.5 }}>
                                Thinking
                                <span style={{ display: "inline-block", animation: "blink 1s step-start infinite" }}>▋</span>
                              </span>
                            ) : (
                              <span>
                                <span
                                  dangerouslySetInnerHTML={{
                                    __html: DOMPurify.sanitize(/** @type {string} */ (marked.parse(m.content || ""))),
                                  }}
                                />
                                {m.streaming && (
                                  <span style={{ display: "inline-block", animation: "blink 1s step-start infinite", marginLeft: 1 }}>▋</span>
                                )}
                              </span>
                            )}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Stack spacing={1.5}>
                <TextField
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      // Bug #2 fix: don't submit empty messages via keyboard
                      if (!chatLoading && selectedProblem && chatInput.trim()) sendChat();
                    }
                  }}
                  placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
                  multiline
                  minRows={3}
                  fullWidth
                />
                <Stack direction="row" spacing={1}>
                  {/* Hint button */}
                  <Tooltip title={
                    hintCount === 0
                      ? "Get a Socratic hint for your next step"
                      : `Get another hint (${hintCount} used this session)`
                  }>
                    <span>
                      <Button
                        variant="outlined"
                        color="warning"
                        startIcon={
                          <Badge
                            badgeContent={hintCount > 0 ? hintCount : null}
                            color="warning"
                            sx={{ "& .MuiBadge-badge": { fontSize: 10, minWidth: 16, height: 16 } }}
                          >
                            <LightbulbIcon fontSize="small" />
                          </Badge>
                        }
                        onClick={sendHint}
                        disabled={chatLoading || !selectedProblem}
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        {hintCount === 0 ? "Hint" : "Another Hint"}
                      </Button>
                    </span>
                  </Tooltip>

                  {/* Send button — Bug #2 fix: also disabled when input is empty */}
                  <Button
                    variant="contained"
                    onClick={() => sendChat()}
                    disabled={chatLoading || !selectedProblem || !chatInput.trim()}
                    sx={{ flex: 1 }}
                  >
                    {chatLoading ? "Sending…" : "Send"}
                  </Button>
                </Stack>
              </Stack>
            </>
          )}
        </SectionCard>
        </Box>
        )}
      </Box>

      {/* ── Expanded tutorial overlay ────────────────────────────────────────── */}
      {tutorialExpanded && selectedTutorial && (
        <Box sx={{
          position: "fixed", inset: 0, zIndex: 1300,
          bgcolor: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          p: 3,
        }}
          onClick={() => setTutorialExpanded(false)}
        >
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{
              bgcolor: "background.paper",
              borderRadius: 3,
              border: 1,
              borderColor: "divider",
              width: "100%",
              maxWidth: 860,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <Stack direction="row" alignItems="center" justifyContent="space-between"
              sx={{ px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <MenuBookIcon color="primary" />
                <Typography variant="h6" fontWeight={700}>{selectedTutorial.title}</Typography>
                <Chip label="C" size="small" variant="outlined" sx={{ fontSize: 11 }} />
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button startIcon={<ArrowBackIcon />} size="small" onClick={() => { backToList(); setTutorialExpanded(false); }}>
                  Topics
                </Button>
                <Tooltip title="Collapse">
                  <IconButton size="small" onClick={() => setTutorialExpanded(false)}>
                    <CloseFullscreenIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>

            {/* Content */}
            <Box sx={{ overflowY: "auto", p: 3 }}>
              <Stack spacing={2.5}>
                {(tutorialContent?.sections ?? []).map((section, idx) => (
                  <Box key={idx}>
                    {section.heading && (
                      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.75 }}>{section.heading}</Typography>
                    )}
                    {section.body && (
                      <Typography variant="body2" color="text.secondary"
                        sx={{ mb: section.code ? 1.5 : 0, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                        {section.body}
                      </Typography>
                    )}
                    {section.code && (
                      <Box sx={{ borderRadius: 2, overflow: "hidden", border: 1, borderColor: "divider" }}>
                        <Editor
                          height={`${Math.min(Math.max(section.code.split("\n").length * 20 + 20, 70), 320)}px`}
                          language={tutorialLanguage ?? "c"}
                          value={section.code}
                          theme="vs-dark"
                          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, lineNumbers: "off", scrollBeyondLastLine: false, padding: { top: 10, bottom: 10 }, automaticLayout: true }}
                        />
                      </Box>
                    )}
                  </Box>
                ))}
              </Stack>
            </Box>
          </Box>
        </Box>
      )}
      {/* ── Flashcard ready toast ─────────────────────────────────────────── */}
      <Snackbar
        open={flashcardToastOpen}
        autoHideDuration={8000}
        onClose={onFlashcardToastClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={onFlashcardToastClose}
          severity="success"
          icon={<CheckCircleOutlineIcon fontSize="inherit" />}
          sx={{
            width: "100%",
            alignItems: "center",
            "& .MuiAlert-message": { display: "flex", alignItems: "center", gap: 1.5 },
          }}
        >
          <span>Your flashcards are ready!</span>
          <Button
            size="small"
            color="inherit"
            href="/flashcards"
            sx={{ fontWeight: 700, textDecoration: "underline", ml: 0.5 }}
          >
            View on Flashcards page →
          </Button>
        </Alert>
      </Snackbar>

      {/* ── Exam violation warning snackbar ──────────────────────────────── */}
      <Snackbar
        open={violationSnackbarOpen}
        autoHideDuration={8000}
        onClose={onViolationSnackbarClose}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={onViolationSnackbarClose}
          severity={violationSnackbarMsg.startsWith("3rd") || violationSnackbarMsg.startsWith("Time") ? "error" : "warning"}
          icon={<WarningAmberIcon fontSize="inherit" />}
          sx={{ width: "100%", fontWeight: 600 }}
        >
          {violationSnackbarMsg}
        </Alert>
      </Snackbar>

      {/* ── Finish Exam confirmation dialog ──────────────────────────────── */}
      <Dialog
        open={finishExamDialogOpen}
        onClose={onFinishExamCancel}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Finish Exam?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to finish the exam? Once confirmed, the editor will be
            locked and no further changes can be made.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onFinishExamCancel} variant="outlined">
            No, continue
          </Button>
          <Button
            onClick={onFinishExamConfirm}
            variant="contained"
            color="success"
            startIcon={<CheckIcon />}
            autoFocus
          >
            Yes, finish exam
          </Button>
        </DialogActions>
      </Dialog>
    </AppLayout>
  );
}
