/**
 * StudentDetailModal.jsx
 *
 * Full-screen dialog shown when a teacher clicks a student in the Students tab.
 * Fetches rich analytics from GET /api/teacher/students/:id/analytics and
 * renders the same charts used on the student's own Analytics page.
 */
import { useEffect, useState } from "react";
import {
  Avatar,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
  Stack,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

import StudentAnalyticsContent from "../common/StudentAnalyticsContent";
import { API_BASE } from "../../apiBase";

function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function StudentDetailModal({ open, onClose, student, token }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!open || !student?.id || !token) return;
    setData(null);
    setError(null);
    setLoading(true);
    fetch(`${API_BASE}/api/teacher/students/${student.id}/analytics`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then((r) => r.json())
      .then((body) => setData(body.data ?? null))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, student?.id, token]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "background.default",
          backgroundImage: "none",
          maxHeight: "92vh",
        },
      }}
    >
      {/* Header */}
      <DialogTitle sx={{ p: 0 }}>
        <Stack
          direction="row" alignItems="center" spacing={2}
          sx={{ px: 3, py: 2, borderBottom: "1px solid", borderColor: "divider" }}
        >
          <Avatar sx={{ bgcolor: "primary.main", fontWeight: 700 }}>
            {initials(student?.name)}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {student?.name ?? "Student Analytics"}
            </Typography>
            <Typography variant="body2" color="text.secondary">{student?.email}</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      {/* Body */}
      <DialogContent sx={{ p: 3, overflowY: "auto" }}>
        <StudentAnalyticsContent data={data} loading={loading} error={error} />
      </DialogContent>
    </Dialog>
  );
}
