import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import SectionCard from "../common/SectionCard";

function StatBox({ label, value, color = "text.primary" }) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 140,
        textAlign: "center",
        py: 2,
        px: 1,
        borderRadius: 2,
        bgcolor: "rgba(148, 163, 184, 0.06)",
      }}
    >
      <Typography variant="h4" sx={{ fontWeight: 700, color }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {label}
      </Typography>
    </Box>
  );
}

export default function ClassOverviewCard({ data, loading }) {
  return (
    <SectionCard title="Class Overview">
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ mt: 1 }}
        >
          <StatBox label="Total Students" value={data.totalStudents ?? 0} color="#4F46E5" />
          <StatBox label="Total Attempts" value={data.totalAttempts ?? 0} />
          <StatBox label="Accepted" value={data.acceptedAttempts ?? 0} color="#22C55E" />
          <StatBox label="Hints Used" value={data.totalHints ?? 0} color="#EAB308" />
        </Stack>
      )}
    </SectionCard>
  );
}
