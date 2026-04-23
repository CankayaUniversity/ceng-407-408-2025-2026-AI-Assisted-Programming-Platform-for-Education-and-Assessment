import {
  Alert,
  Box,
  Chip,
  Divider,
  FormControlLabel,
  Checkbox,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import GroupsIcon from "@mui/icons-material/Groups";

import SectionCard from "../common/SectionCard";

export default function ExamModeCard({
  examMode,
  examGroupIds = [],
  groups = [],
  onToggle,
  loading,
}) {
  // onToggle(enabled, groupIds)
  function handleSwitch(e) {
    onToggle(e.target.checked, examGroupIds);
  }

  function handleGroupToggle(groupId) {
    const next = examGroupIds.includes(groupId)
      ? examGroupIds.filter((id) => id !== groupId)
      : [...examGroupIds, groupId];
    onToggle(examMode, next);
  }

  const scopeLabel =
    examGroupIds.length === 0
      ? "all students"
      : examGroupIds.length === 1
      ? "1 group"
      : `${examGroupIds.length} groups`;

  return (
    <SectionCard
      title="Exam Mode"
      action={
        <Stack direction="row" spacing={1.5} alignItems="center">
          {examMode && (
            <Chip
              label="ACTIVE"
              size="small"
              sx={{
                bgcolor: "rgba(239,68,68,0.12)",
                color: "error.main",
                fontWeight: 700,
                letterSpacing: 0.5,
              }}
            />
          )}
          <Switch
            checked={examMode}
            disabled={loading}
            onChange={handleSwitch}
            sx={{
              "& .MuiSwitch-switchBase.Mui-checked": { color: "#fff" },
              "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                bgcolor: "error.main",
                opacity: 1,
              },
            }}
          />
        </Stack>
      }
    >
      <Typography variant="body1" color="text.secondary">
        When enabled, AI Mentor assistance will be disabled for the selected students.
      </Typography>

      {/* ── Group selector ──────────────────────────────────────────── */}
      {groups.length > 0 && (
        <Box sx={{ mt: 2.5 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <GroupsIcon fontSize="small" color="action" />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Apply to
            </Typography>
          </Stack>

          <Stack spacing={0.5}>
            {/* "All students" pseudo-option */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={examGroupIds.length === 0}
                  onChange={() => onToggle(examMode, [])}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  All students{" "}
                  <Typography component="span" variant="caption" color="text.secondary">
                    (no group filter)
                  </Typography>
                </Typography>
              }
            />

            <Divider sx={{ my: 0.5 }} />

            {groups.map((g) => (
              <FormControlLabel
                key={g.id}
                control={
                  <Checkbox
                    checked={examGroupIds.includes(g.id)}
                    onChange={() => handleGroupToggle(g.id)}
                    size="small"
                    disabled={examGroupIds.length === 0 && !examGroupIds.includes(g.id) && false}
                  />
                }
                label={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2">{g.name}</Typography>
                    <Chip
                      label={`${g.members?.length ?? 0} students`}
                      size="small"
                      variant="outlined"
                      sx={{ height: 18, fontSize: 11 }}
                    />
                  </Stack>
                }
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* ── Active banner ───────────────────────────────────────────── */}
      {examMode && (
        <Alert
          severity="warning"
          icon={false}
          sx={{
            mt: 2,
            borderRadius: 2,
            border: 1,
            borderColor: "rgba(239, 68, 68, 0.28)",
            bgcolor: "rgba(254, 242, 242, 0.95)",
            color: "error.main",
            alignItems: "center",
          }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1}
            alignItems={{ xs: "flex-start", md: "center" }}
          >
            <Chip
              label="Restricted"
              size="small"
              sx={{ bgcolor: "rgba(239, 68, 68, 0.12)", color: "error.main", fontWeight: 700 }}
            />
            <Box>
              Exam Mode is active for{" "}
              <strong>{scopeLabel}</strong>. AI Mentor is disabled — students can only access
              problem descriptions and the code editor.
            </Box>
          </Stack>
        </Alert>
      )}
    </SectionCard>
  );
}
