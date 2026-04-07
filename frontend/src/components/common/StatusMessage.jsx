import { Alert, CircularProgress, Stack, Typography } from "@mui/material";

export default function StatusMessage({
  loading = false,
  error = "",
  success = "",
  loadingText = "Loading...",
}) {
  if (loading) {
    return (
      <Stack direction="row" spacing={2} alignItems="center">
        <CircularProgress size={22} />
        <Typography>{loadingText}</Typography>
      </Stack>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (success) {
    return <Alert severity="success">{success}</Alert>;
  }

  return null;
}