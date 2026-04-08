import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@mui/material";

import AppLayout from "../../components/layout/AppLayout";
import ClassOverviewCard from "../../components/teacher/ClassOverviewCard";
import ExamModeCard from "../../components/teacher/ExamModeCard";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

export default function TeacherDashboardPage({ currentUser, token, handleLogout, navItems }) {
  const [examMode, setExamMode] = useState(false);
  const [examLoading, setExamLoading] = useState(true);
  const [classOverview, setClassOverview] = useState({});
  const [classOverviewLoading, setClassOverviewLoading] = useState(true);

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  }), [token]);

  const fetchJson = useCallback(
    (path) => fetch(`${API_BASE}${path}`, { headers: authHeaders }).then((r) => r.json()),
    [authHeaders],
  );

  useEffect(() => {
    if (!token) return;

    setExamLoading(true);
    fetchJson("/api/admin/exam-mode")
      .then((body) => setExamMode(Boolean(body.data?.enabled)))
      .catch((err) => console.error("exam-mode fetch failed:", err))
      .finally(() => setExamLoading(false));

    setClassOverviewLoading(true);
    fetchJson("/api/teacher/class/overview")
      .then((body) => setClassOverview(body.data ?? {}))
      .catch((err) => console.error("class overview fetch failed:", err))
      .finally(() => setClassOverviewLoading(false));
  }, [token, fetchJson]);

  function handleExamToggle(enabled) {
    setExamMode(enabled);
    fetch(`${API_BASE}/api/admin/exam-mode`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ enabled }),
    })
      .then((res) => res.json())
      .then((body) => setExamMode(Boolean(body.data?.enabled)))
      .catch((err) => {
        console.error("exam-mode toggle failed:", err);
        setExamMode(!enabled);
      });
  }

  return (
    <AppLayout
      title="AI Mentor"
      userLabel={currentUser?.name || currentUser?.email || "Teacher"}
      onLogout={handleLogout}
      navItems={navItems}
      maxWidth="xl"
      headerVariant="teacher"
      roleLabel="Teacher"
      showPageTitle={false}
    >
      <Stack spacing={3.25}>
        <ClassOverviewCard data={classOverview} loading={classOverviewLoading} />
        <ExamModeCard examMode={examMode} onToggle={handleExamToggle} loading={examLoading} />
      </Stack>
    </AppLayout>
  );
}
