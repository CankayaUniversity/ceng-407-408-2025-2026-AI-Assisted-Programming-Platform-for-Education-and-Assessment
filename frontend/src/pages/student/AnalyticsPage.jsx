import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";

import AppLayout               from "../../components/layout/AppLayout";
import StudentAnalyticsContent from "../../components/common/StudentAnalyticsContent";
import { API_BASE }            from "../../apiBase";

export default function AnalyticsPage({ currentUser, token, handleLogout, navItems }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/api/student/analytics`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then((r) => r.json())
      .then((body) => setData(body.data ?? null))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <AppLayout
      title="AI Mentor" roleLabel="Student"
      userLabel={currentUser?.name || currentUser?.email}
      onLogout={handleLogout} navItems={navItems}
      maxWidth="lg" showPageTitle={false}
    >
      {/* Page title */}
      <Box sx={{ mb: 3, textAlign: "center" }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>My Analytics</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Your personal progress, activity, and error patterns
        </Typography>
      </Box>

      <StudentAnalyticsContent data={data} loading={loading} error={error} />
    </AppLayout>
  );
}
