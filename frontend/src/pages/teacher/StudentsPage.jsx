import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack } from "@mui/material";

import AppLayout from "../../components/layout/AppLayout";
import StudentDetailModal from "../../components/teacher/StudentDetailModal";
import StudentProgressTable from "../../components/teacher/StudentProgressTable";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

export default function StudentsPage({ currentUser, token, handleLogout, navItems }) {
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentMetrics, setStudentMetrics] = useState(null);
  const [studentMetricsLoading, setStudentMetricsLoading] = useState(false);

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
      .catch((err) => console.error("students fetch failed:", err))
      .finally(() => setStudentsLoading(false));
  }, [token, fetchJson]);

  function handleStudentClick(student) {
    setSelectedStudent(student);
    setStudentMetrics(null);
    setStudentMetricsLoading(true);
    fetchJson(`/api/teacher/students/${student.id}/summary`)
      .then((body) => setStudentMetrics(body.data?.metrics ?? null))
      .catch((err) => {
        console.error("student summary failed:", err);
        setStudentMetrics(null);
      })
      .finally(() => setStudentMetricsLoading(false));
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
        <StudentProgressTable students={students} loading={studentsLoading} onStudentClick={handleStudentClick} />
      </Stack>

      <StudentDetailModal
        open={Boolean(selectedStudent)}
        onClose={() => { setSelectedStudent(null); setStudentMetrics(null); }}
        student={selectedStudent}
        metrics={studentMetrics}
        loading={studentMetricsLoading}
      />
    </AppLayout>
  );
}
