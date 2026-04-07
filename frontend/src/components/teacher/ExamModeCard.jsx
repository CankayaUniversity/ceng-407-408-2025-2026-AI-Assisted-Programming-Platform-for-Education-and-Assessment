import { Alert, Box, Chip, Stack, Switch, Typography } from "@mui/material";

import SectionCard from "../common/SectionCard";

export default function ExamModeCard({ examMode, onToggle }) {
  return (
    <SectionCard
      title="Exam Mode Control"
      action={
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: examMode ? "error.main" : "text.secondary",
              letterSpacing: 0.2,
            }}
          >
            {examMode ? "EXAM MODE ACTIVE" : "REGULAR MODE"}
          </Typography>
          <Switch
            checked={examMode}
            onChange={(event) => onToggle(event.target.checked)}
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': { color: '#fff' },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                bgcolor: 'error.main',
                opacity: 1,
              },
            }}
          />
        </Stack>
      }
    >
      <Typography variant="body1" color="text.secondary" sx={{ mb: examMode ? 2 : 0 }}>
        When enabled, AI Mentor assistance will be disabled for all students.
      </Typography>

      {examMode ? (
        <Alert
          severity="warning"
          icon={false}
          sx={{
            mt: 2,
            borderRadius: 2,
            border: 1,
            borderColor: 'rgba(239, 68, 68, 0.28)',
            bgcolor: 'rgba(254, 242, 242, 0.95)',
            color: 'error.main',
            alignItems: 'center',
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', md: 'center' }}>
            <Chip
              label="Restricted"
              size="small"
              sx={{ bgcolor: 'rgba(239, 68, 68, 0.12)', color: 'error.main', fontWeight: 700 }}
            />
            <Box>
              AI Mentor is now disabled for all students. Students can only access problem descriptions and the code editor.
            </Box>
          </Stack>
        </Alert>
      ) : null}
    </SectionCard>
  );
}
