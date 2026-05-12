/**
 * SubmissionHistory.jsx
 *
 * Shows a student's submission history for the current problem.
 * Each row is clickable — opens a timeline dialog with:
 *   - Read-only Monaco editor showing exactly what the student submitted
 *   - Status chip, language, execution time, timestamp
 *   - Stdout / stderr output from that run
 *   - Prev / Next navigation between attempts
 */
import { useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
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
import ChevronLeftIcon  from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon        from "@mui/icons-material/Close";
import CodeIcon         from "@mui/icons-material/Code";
import HistoryIcon      from "@mui/icons-material/History";

import SectionCard from "../common/SectionCard";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status) {
  const s = (status ?? "").toLowerCase();
  if (s === "accepted" || s === "pass") return "success";
  if (s.includes("error") || s === "fail") return "error";
  if (s === "wrong_answer") return "warning";
  return "default";
}

function monacoLang(lang) {
  const m = {
    python: "python", javascript: "javascript", js: "javascript",
    c: "c", cpp: "cpp", "c++": "cpp",
    csharp: "csharp", "c#": "csharp",
    java: "java",
  };
  return m[(lang ?? "").toLowerCase()] ?? "plaintext";
}

function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatStatus(status) {
  return (status ?? "Unknown").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Timeline dialog ───────────────────────────────────────────────────────────

export function SubmissionTimelineDialog({ open, onClose, submissions, initialIndex }) {
  const [idx, setIdx] = useState(initialIndex ?? 0);

  // Keep idx clamped whenever the list changes
  const clamp    = (i) => Math.max(0, Math.min(i, submissions.length - 1));
  const safeIdx  = clamp(idx);
  const sub      = submissions[safeIdx];

  if (!sub) return null;

  const total      = submissions.length;
  // Submissions arrive newest-first; display as "Attempt N of total" from oldest
  const attemptNum = total - safeIdx;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ sx: { bgcolor: "#0f172a", backgroundImage: "none" } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <HistoryIcon sx={{ color: "primary.main", fontSize: 20 }} />
            <Typography variant="h6" fontWeight={700}>
              Submission Timeline
            </Typography>
            <Chip
              label={`Attempt ${attemptNum} / ${total}`}
              size="small"
              variant="outlined"
              sx={{ fontSize: 11 }}
            />
          </Stack>
          <IconButton onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {/* ── Navigation bar ────────────────────────────────────────── */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1, bgcolor: "rgba(148,163,184,0.05)", borderBottom: "1px solid", borderColor: "divider" }}
        >
          <Tooltip title="Older attempt">
            <span>
              <IconButton
                size="small"
                onClick={() => setIdx(clamp(safeIdx + 1))}
                disabled={safeIdx >= total - 1}
              >
                <ChevronLeftIcon />
              </IconButton>
            </span>
          </Tooltip>

          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" justifyContent="center">
            <Chip
              label={formatStatus(sub.status)}
              size="small"
              color={statusColor(sub.status)}
              variant="filled"
              sx={{ fontWeight: 700 }}
            />
            <Typography variant="caption" color="text.secondary">
              {sub.language ?? "—"}
            </Typography>
            {sub.executionTime != null && (
              <Typography variant="caption" color="text.secondary">
                {sub.executionTime.toFixed(0)} ms
              </Typography>
            )}
            <Typography variant="caption" color="text.disabled">
              {formatDate(sub.createdAt)}
            </Typography>
          </Stack>

          <Tooltip title="Newer attempt">
            <span>
              <IconButton
                size="small"
                onClick={() => setIdx(clamp(safeIdx - 1))}
                disabled={safeIdx <= 0}
              >
                <ChevronRightIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        {/* ── Code viewer ───────────────────────────────────────────── */}
        <Box sx={{ height: 360, borderBottom: "1px solid", borderColor: "divider" }}>
          <Editor
            height="100%"
            language={monacoLang(sub.language)}
            value={sub.code ?? "// (no code recorded)"}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              lineNumbers: "on",
              renderLineHighlight: "none",
              contextmenu: false,
            }}
          />
        </Box>

        {/* ── Output / errors ───────────────────────────────────────── */}
        {(sub.stdout || sub.stderr) && (
          <Box sx={{ px: 2, py: 1.5 }}>
            {sub.stdout && (
              <>
                <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 700, letterSpacing: 0.5 }}>
                  STDOUT
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    mt: 0.5, mb: 1, p: 1, borderRadius: 1,
                    bgcolor: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)",
                    color: "#86efac", fontSize: 12, fontFamily: "monospace",
                    whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 120, overflow: "auto",
                  }}
                >
                  {sub.stdout}
                </Box>
              </>
            )}
            {sub.stderr && (
              <>
                <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 700, letterSpacing: 0.5 }}>
                  STDERR
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    mt: 0.5, p: 1, borderRadius: 1,
                    bgcolor: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
                    color: "#fca5a5", fontSize: 12, fontFamily: "monospace",
                    whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 120, overflow: "auto",
                  }}
                >
                  {sub.stderr}
                </Box>
              </>
            )}
          </Box>
        )}

        {/* ── Dot timeline scrubber ─────────────────────────────────── */}
        {total > 1 && (
          <>
            <Divider />
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                All attempts — oldest → newest
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {[...submissions].reverse().map((s, i) => {
                  // reversed: i=0 is oldest. safeIdx is newest-first, so map carefully.
                  const dotIdx = total - 1 - i; // back to newest-first index
                  const isActive = dotIdx === safeIdx;
                  const color =
                    s.status === "Accepted" || s.status === "accepted" ? "#22c55e"
                    : s.status?.toLowerCase().includes("error") ? "#ef4444"
                    : "#f59e0b";
                  return (
                    <Tooltip key={s.id} title={`#${i + 1} — ${formatStatus(s.status)} · ${formatDate(s.createdAt)}`}>
                      <Box
                        onClick={() => setIdx(dotIdx)}
                        sx={{
                          width: isActive ? 12 : 8,
                          height: isActive ? 12 : 8,
                          borderRadius: "50%",
                          bgcolor: color,
                          opacity: isActive ? 1 : 0.45,
                          cursor: "pointer",
                          transition: "all 0.15s",
                          border: isActive ? `2px solid ${color}` : "2px solid transparent",
                          boxShadow: isActive ? `0 0 0 2px ${color}44` : "none",
                          "&:hover": { opacity: 1 },
                        }}
                      />
                    </Tooltip>
                  );
                })}
              </Stack>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SubmissionHistory({ submissions, loading }) {
  const [dialogOpen,    setDialogOpen]    = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  function openAt(idx) {
    setSelectedIndex(idx);
    setDialogOpen(true);
  }

  return (
    <>
      <SectionCard
        title="Submission History"
        action={
          submissions.length > 0 && (
            <Chip
              icon={<CodeIcon sx={{ fontSize: "14px !important" }} />}
              label="Click any row to view code"
              size="small"
              variant="outlined"
              sx={{ fontSize: 10, height: 20, color: "text.secondary", borderColor: "divider" }}
            />
          )
        }
      >
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : submissions.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
            No submissions yet for this problem.
          </Typography>
        ) : (
          <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "rgba(148, 163, 184, 0.08)" }}>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Language</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Time</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {submissions.map((sub, idx) => (
                  <TableRow
                    key={sub.id}
                    hover
                    onClick={() => openAt(idx)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell sx={{ color: "text.secondary" }}>{submissions.length - idx}</TableCell>
                    <TableCell>
                      <Chip
                        label={formatStatus(sub.status)}
                        size="small"
                        color={statusColor(sub.status)}
                        variant="outlined"
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>{sub.language ?? "-"}</TableCell>
                    <TableCell>
                      {sub.executionTime != null ? `${sub.executionTime.toFixed(0)} ms` : "-"}
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary", fontSize: 13 }}>
                      {formatDate(sub.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      {dialogOpen && submissions.length > 0 && (
        <SubmissionTimelineDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          submissions={submissions}
          initialIndex={selectedIndex}
        />
      )}
    </>
  );
}
