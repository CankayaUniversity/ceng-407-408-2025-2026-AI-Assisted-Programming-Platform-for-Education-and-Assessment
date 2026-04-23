import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@mui/material";

import AppLayout from "../../components/layout/AppLayout";
import QuestionBankPanel from "../../components/teacher/QuestionBankPanel";
import { API_BASE } from "../../apiBase";

function buildQuestionBankItems(problems = [], analyticsMap = {}) {
  return problems.map((problem, index) => {
    const stats = analyticsMap[problem.id];
    // Derive languages array: prefer the new `languages` field, fall back to single `language`
    const languages =
      Array.isArray(problem.languages) && problem.languages.length > 0
        ? problem.languages
        : problem.language
        ? [problem.language]
        : [];
    // Derive tags array: prefer the new `tags` field, fall back to single `category`
    const tags =
      Array.isArray(problem.tags) && problem.tags.length > 0
        ? problem.tags
        : problem.category
        ? [problem.category]
        : [];
    return {
      id: problem.id ?? index + 1,
      title: problem.title ?? `Problem ${index + 1}`,
      difficulty: problem.difficulty ?? (index % 2 === 0 ? "Easy" : "Medium"),
      topic: tags[0] ?? "General",
      languages,
      tags,
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
