import { Routes, Route, Navigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Stack,
  Typography,
} from "@mui/material";
import SchoolIcon   from "@mui/icons-material/School";
import PersonIcon   from "@mui/icons-material/Person";

import { useAuth } from "./context/AuthContext";

import LoginForm    from "./components/auth/LoginForm";
import SectionCard  from "./components/common/SectionCard";
import StatusMessage from "./components/common/StatusMessage";
import PageShell    from "./components/layout/PageShell";

import ProblemPage              from "./pages/student/ProblemPage";
import AssignmentsPage          from "./pages/student/AssignmentsPage";
import AnalyticsPage            from "./pages/student/AnalyticsPage";
import TeacherDashboardPage     from "./pages/teacher/TeacherDashboardPage";
import StudentsPage             from "./pages/teacher/StudentsPage";
import QuestionsPage            from "./pages/teacher/QuestionsPage";
import GradingPage              from "./pages/teacher/GradingPage";
import TeacherAssignmentsPage   from "./pages/teacher/AssignmentsPage";

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
  { label: "Assignments",   path: "/assignments" },
  { label: "Students",      path: "/students" },
  { label: "Question Bank", path: "/questions" },
  { label: "Grading",       path: "/grading" },
];

// ── Role-selection landing screen ─────────────────────────────────────────────

function RoleSelectScreen({ onSelect }) {
  return (
    <PageShell
      title="AI-Assisted Programming Platform"
      subtitle="Choose your portal to continue."
      maxWidth="sm"
    >
      <Box sx={{ mt: { xs: 4, md: 8 } }}>
        <Stack spacing={2}>
          <Typography
            variant="h6"
            fontWeight={700}
            textAlign="center"
            color="text.secondary"
            sx={{ mb: 1 }}
          >
            Who are you?
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            {/* Student card */}
            <Card
              sx={{
                flex: 1,
                border: 2,
                borderColor: "primary.main",
                borderRadius: 3,
                transition: "box-shadow 0.2s",
                "&:hover": { boxShadow: 6 },
              }}
            >
              <CardActionArea
                onClick={() => onSelect("student")}
                sx={{ p: 1 }}
              >
                <CardContent>
                  <Stack spacing={1.5} alignItems="center">
                    <Box
                      sx={{
                        width: 60,
                        height: 60,
                        borderRadius: "50%",
                        bgcolor: "primary.main",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <PersonIcon sx={{ color: "#fff", fontSize: 32 }} />
                    </Box>
                    <Typography variant="h6" fontWeight={700}>
                      Student
                    </Typography>
                    <Typography variant="body2" color="text.secondary" textAlign="center">
                      Access assignments, submit code, and get AI mentor help.
                    </Typography>
                    <Button variant="contained" color="primary" fullWidth sx={{ mt: 1 }}>
                      Student Portal
                    </Button>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>

            {/* Teacher card */}
            <Card
              sx={{
                flex: 1,
                border: 2,
                borderColor: "secondary.main",
                borderRadius: 3,
                transition: "box-shadow 0.2s",
                "&:hover": { boxShadow: 6 },
              }}
            >
              <CardActionArea
                onClick={() => onSelect("teacher")}
                sx={{ p: 1 }}
              >
                <CardContent>
                  <Stack spacing={1.5} alignItems="center">
                    <Box
                      sx={{
                        width: 60,
                        height: 60,
                        borderRadius: "50%",
                        bgcolor: "secondary.main",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <SchoolIcon sx={{ color: "#fff", fontSize: 32 }} />
                    </Box>
                    <Typography variant="h6" fontWeight={700}>
                      Teacher
                    </Typography>
                    <Typography variant="body2" color="text.secondary" textAlign="center">
                      Manage assignments, grade submissions, and track progress.
                    </Typography>
                    <Button variant="contained" color="secondary" fullWidth sx={{ mt: 1 }}>
                      Teacher Portal
                    </Button>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Stack>
        </Stack>
      </Box>
    </PageShell>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

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

  // portalRole: null = role-select screen, "student" | "teacher" = login/register screen
  const [portalRole,  setPortalRole]  = useState(null);
  const [authMode,    setAuthMode]    = useState("login");
  const [name,        setName]        = useState("");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");

  function pickRole(role) {
    setPortalRole(role);
    setAuthError("");
    setAuthMode("login");
    setName("");
    // Pre-fill demo credentials only for the student portal
    setEmail(role === "student" ? DEMO_EMAIL    : "");
    setPassword(role === "student" ? DEMO_PASSWORD : "");
  }

  function backToRoleSelect() {
    setPortalRole(null);
    setAuthError("");
  }

  // ── Loading splash ──────────────────────────────────────────────────────────

  if (bootstrapping) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", px: 2 }}>
        <SectionCard title="Initializing platform">
          <StatusMessage loading loadingText="Loading platform..." />
        </SectionCard>
      </Box>
    );
  }

  // ── Auth screens ────────────────────────────────────────────────────────────

  if (!token) {
    const gradient = {
      background:
        "radial-gradient(circle at top left, rgba(99, 102, 241, 0.25) 0%, transparent 40%), radial-gradient(circle at top right, rgba(14, 165, 233, 0.2) 0%, transparent 35%)",
      bgcolor: "background.default",
      minHeight: "100vh",
    };

    // Step 1 — role selection
    if (!portalRole) {
      return (
        <Box sx={gradient}>
          <RoleSelectScreen onSelect={pickRole} />
        </Box>
      );
    }

    // Step 2 — login / register scoped to chosen portal
    return (
      <Box sx={gradient}>
        <PageShell
          title="AI-Assisted Programming Platform"
          subtitle={
            portalRole === "teacher"
              ? "Teacher portal — sign in or create a teacher account."
              : "Student portal — sign in or create a student account."
          }
          maxWidth="sm"
        >
          <Box sx={{ mt: { xs: 4, md: 8 } }}>
            <LoginForm
              portalRole={portalRole}
              onBackToRoleSelect={backToRoleSelect}
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
              handleSignIn={() => handleSignIn({ email, password, expectedRole: portalRole })}
              handleRegister={() => handleRegister({ name, email, password, role: portalRole })}
              demoEmail={portalRole === "student" ? DEMO_EMAIL    : null}
              demoPassword={portalRole === "student" ? DEMO_PASSWORD : null}
            />
          </Box>
        </PageShell>
      </Box>
    );
  }

  // ── Authenticated routing ───────────────────────────────────────────────────

  const commonProps = { currentUser, token, handleLogout, problems };

  if (currentUser?.role === "teacher") {
    return (
      <Routes>
        <Route path="/"           element={<TeacherDashboardPage {...commonProps} navItems={TEACHER_NAV} />} />
        <Route path="/students"   element={<StudentsPage         {...commonProps} navItems={TEACHER_NAV} />} />
        <Route
          path="/questions"
          element={
            <QuestionsPage
              {...commonProps}
              navItems={TEACHER_NAV}
              onProblemsChanged={refreshProblems}
            />
          }
        />
        <Route path="/assignments" element={<TeacherAssignmentsPage {...commonProps} navItems={TEACHER_NAV} />} />
        <Route path="/grading"     element={<GradingPage            {...commonProps} navItems={TEACHER_NAV} />} />
        <Route path="*"            element={<Navigate to="/" replace />} />
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
      <Route path="*"            element={<Navigate to="/" replace />} />
    </Routes>
  );
}
