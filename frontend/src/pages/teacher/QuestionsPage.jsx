import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@mui/material";

import AppLayout from "../../components/layout/AppLayout";
import QuestionBankPanel from "../../components/teacher/QuestionBankPanel";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

function buildQuestionBankItems(problems = [], analyticsMap = {}) {
  return problems.map((problem, index) => {
    const stats = analyticsMap[problem.id];
    return {
      id: problem.id ?? index + 1,
      title: problem.title ?? `Problem ${index + 1}`,
      difficulty: problem.difficulty ?? (index % 2 === 0 ? "Easy" : "Medium"),
      topic: problem.topic ?? problem.category ?? "General",
      usageCount: stats?.totalAttempts ?? 0,
      description: problem.description ?? "",
      example: problem.example ?? ["Input: ...", "Output: ..."],
    };
  });
}

export default function QuestionsPage({ currentUser, problems, token, handleLogout, navItems, onProblemsChanged }) {
  const [analyticsMap, setAnalyticsMap] = useState({});

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
    if (!token || !problems.length) return;
    Promise.all(
      problems.map((p) =>
        fetchJson(`/api/teacher/problems/${p.id}/analytics`)
          .then((body) => ({ id: p.id, ...(body.data?.analytics ?? {}) }))
          .catch(() => ({ id: p.id })),
      ),
    ).then((results) => {
      const map = {};
      for (const r of results) map[r.id] = r;
      setAnalyticsMap(map);
    });
  }, [token, problems, fetchJson]);

  const questionBankItems = useMemo(
    () => buildQuestionBankItems(problems, analyticsMap),
    [problems, analyticsMap],
  );

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
        <QuestionBankPanel items={questionBankItems} token={token} onProblemsChanged={onProblemsChanged} />
      </Stack>
    </AppLayout>
  );
}
