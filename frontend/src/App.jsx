import { Routes, Route, Navigate } from "react-router-dom";
import { Box } from "@mui/material";

import { useAuth } from "./context/AuthContext";

import LoginForm from "./components/auth/LoginForm";
import SectionCard from "./components/common/SectionCard";
import StatusMessage from "./components/common/StatusMessage";
import PageShell from "./components/layout/PageShell";

import ProblemPage from "./pages/student/ProblemPage";
import AssignmentsPage from "./pages/student/AssignmentsPage";
import AnalyticsPage from "./pages/student/AnalyticsPage";
import TeacherDashboardPage from "./pages/teacher/TeacherDashboardPage";
import StudentsPage          from "./pages/teacher/StudentsPage";
import QuestionsPage         from "./pages/teacher/QuestionsPage";
import GradingPage           from "./pages/teacher/GradingPage";

import { useState } from "react";

const DEMO_EMAIL    = import.meta.env.VITE_DEMO_EMAIL    ?? "student1@demo.com";
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? "123456";

const STUDENT_NAV = [
  { label: "Dashboard",   path: "/" },
  { label: "Assignments", path: "/assignments" },
  { label: "Analytics",   path: "/analytics" },
];

const TEACHER_NAV = [
  { label: "Dashboard",     path: "/" },
  { label: "Students",      path: "/students" },
  { label: "Question Bank", path: "/questions" },
  { label: "Grading",       path: "/grading" },
];

export default function App() {
  const {
    token,
    currentUser,
    problems,
    bootstrapping,
    authLoading,
    authError,
    setAuthError,
    handleSignIn,
    handleRegister,
    handleLogout,
    refreshProblems,
  } = useAuth();

  // Local form state lives here (doesn't need to be in context)
  const [authMode,      setAuthMode]      = useState("login");
  const [name,          setName]          = useState("Demo Student");
  const [email,         setEmail]         = useState(DEMO_EMAIL);
  const [password,      setPassword]      = useState(DEMO_PASSWORD);
  const [registerRole,  setRegisterRole]  = useState("student");

  // ── Loading splash ────────────────────────────────────────────────────────

  if (bootstrapping) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", px: 2 }}>
        <SectionCard title="Initializing platform">
          <StatusMessage loading loadingText="Loading platform..." />
        </SectionCard>
      </Box>
    );
  }

  // ── Auth screen ───────────────────────────────────────────────────────────

  if (!token) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top left, rgba(99, 102, 241, 0.25) 0%, transparent 40%), radial-gradient(circle at top right, rgba(14, 165, 233, 0.2) 0%, transparent 35%)",
          bgcolor: "background.default",
        }}
      >
        <PageShell
          title="AI-Assisted Programming Platform"
          subtitle="Sign in to continue or create a new account."
          maxWidth="sm"
        >
          <Box sx={{ mt: { xs: 4, md: 8 } }}>
            <LoginForm
              authMode={authMode}
              setAuthMode={(m) => { setAuthMode(m); setAuthError(""); }}
              authError={authError}
              authLoading={authLoading}
              name={name}
              setName={setName}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              registerRole={registerRole}
              setRegisterRole={setRegisterRole}
              handleSignIn={() => handleSignIn({ email, password })}
              handleRegister={() => handleRegister({ name, email, password, role: registerRole })}
              demoEmail={DEMO_EMAIL}
              demoPassword={DEMO_PASSWORD}
            />
          </Box>
        </PageShell>
      </Box>
    );
  }

  // ── Authenticated routing ─────────────────────────────────────────────────

  const commonProps = { currentUser, token, handleLogout, problems };

  if (currentUser?.role === "teacher") {
    return (
      <Routes>
        <Route path="/"         element={<TeacherDashboardPage {...commonProps} navItems={TEACHER_NAV} />} />
        <Route path="/students" element={<StudentsPage         {...commonProps} navItems={TEACHER_NAV} />} />
        <Route path="/questions"
          element={
            <QuestionsPage
              {...commonProps}
              navItems={TEACHER_NAV}
              onProblemsChanged={refreshProblems}
            />
          }
        />
        <Route path="/grading" element={<GradingPage {...commonProps} navItems={TEACHER_NAV} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          problems.length > 0
            ? <Navigate to={`/problem/${problems[0].id}`} replace />
            : <AssignmentsPage {...commonProps} navItems={STUDENT_NAV} />
        }
      />
      <Route path="/problem/:id" element={<ProblemPage />} />
      <Route path="/assignments" element={<AssignmentsPage {...commonProps} navItems={STUDENT_NAV} />} />
      <Route path="/analytics"   element={<AnalyticsPage  {...commonProps} navItems={STUDENT_NAV} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
