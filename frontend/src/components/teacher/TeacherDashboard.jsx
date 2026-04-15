import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Stack } from "@mui/material";

import AppLayout from "../layout/AppLayout";
import ClassOverviewCard from "./ClassOverviewCard";
import ExamModeCard from "./ExamModeCard";
import QuestionBankPanel from "./QuestionBankPanel";
import StudentDetailModal from "./StudentDetailModal";
import StudentProgressTable from "./StudentProgressTable";
import { API_BASE } from "../../apiBase";

function buildQuestionBankItems(problems = [], analyticsMap = {}) {
  return problems.map((problem, index) => {
    const stats = analyticsMap[problem.id];
    return {
      id: problem.id ?? index + 1,
      title: problem.title ?? `Problem ${index + 1}`,
      difficulty: problem.difficulty ?? (index % 2 === 0 ? 'Easy' : 'Medium'),
      topic: problem.topic ?? problem.category ?? 'General',
      usageCount: stats?.totalAttempts ?? 0,
      description: problem.description ?? '',
      example: problem.example ?? ['Input: ...', 'Output: ...'],
    };
  });
}

const TEACHER_NAV = [];

export default function TeacherDashboard({ currentUser, problems, handleLogout, token }) {
  const [examMode, setExamMode] = useState(false);
  const [examLoading, setExamLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [classOverview, setClassOverview] = useState({});
  const [classOverviewLoading, setClassOverviewLoading] = useState(true);
  const [analyticsMap, setAnalyticsMap] = useState({});

  const questionBankItems = useMemo(
    () => buildQuestionBankItems(problems, analyticsMap),
    [problems, analyticsMap],
  );

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  }), [token]);

  const fetchJson = useCallback((path) =>
    fetch(`${API_BASE}${path}`, { headers: authHeaders }).then((r) => r.json()),
  [authHeaders]);

  useEffect(() => {
    if (!token) return;

    setStudentsLoading(true);
    fetchJson("/api/teacher/students")
      .then((body) => {
        const totalProblems = body.meta?.totalProblems ?? 1;
        const rows = (body.data ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          completed: s.distinctProblemsSolved ?? 0,
          total: totalProblems,
          progress: totalProblems > 0
            ? Math.round(((s.distinctProblemsSolved ?? 0) / totalProblems) * 100)
            : 0,
        }));
        setStudents(rows);
      })
      .catch((err) => console.error("[TeacherDashboard] student fetch failed:", err))
      .finally(() => setStudentsLoading(false));

    setExamLoading(true);
    fetchJson("/api/admin/exam-mode")
      .then((body) => setExamMode(Boolean(body.data?.enabled)))
      .catch((err) => console.error("[TeacherDashboard] exam-mode fetch failed:", err))
      .finally(() => setExamLoading(false));

    setClassOverviewLoading(true);
    fetchJson("/api/teacher/class/overview")
      .then((body) => setClassOverview(body.data ?? {}))
      .catch((err) => console.error("[TeacherDashboard] class overview failed:", err))
      .finally(() => setClassOverviewLoading(false));
  }, [token, authHeaders, fetchJson]);

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

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentMetrics, setStudentMetrics] = useState(null);
  const [studentMetricsLoading, setStudentMetricsLoading] = useState(false);

  function handleStudentClick(student) {
    setSelectedStudent(student);
    setStudentMetrics(null);
    setStudentMetricsLoading(true);
    fetchJson(`/api/teacher/students/${student.id}/summary`)
      .then((body) => setStudentMetrics(body.data?.metrics ?? null))
      .catch((err) => {
        console.error("[TeacherDashboard] student summary failed:", err);
        setStudentMetrics(null);
      })
      .finally(() => setStudentMetricsLoading(false));
  }

  function handleStudentModalClose() {
    setSelectedStudent(null);
    setStudentMetrics(null);
  }

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
        console.error("[TeacherDashboard] exam-mode toggle failed:", err);
        setExamMode(!enabled);
      });
  }

  return (
    <AppLayout
      title="AI Mentor"
      userLabel={currentUser?.name || currentUser?.email || 'Teacher'}
      onLogout={handleLogout}
      navItems={TEACHER_NAV}
      maxWidth="xl"
      headerVariant="teacher"
      roleLabel="Teacher" 
      showPageTitle={false}
    >
      <Stack spacing={3.25}>
        <ClassOverviewCard data={classOverview} loading={classOverviewLoading} />

        <ExamModeCard examMode={examMode} onToggle={handleExamToggle} loading={examLoading} />

        <StudentProgressTable students={students} loading={studentsLoading} onStudentClick={handleStudentClick} />

        <QuestionBankPanel items={questionBankItems} />
      </Stack>

      <StudentDetailModal
        open={Boolean(selectedStudent)}
        onClose={handleStudentModalClose}
        student={selectedStudent}
        metrics={studentMetrics}
        loading={studentMetricsLoading}
      />
    </AppLayout>
  );
}
