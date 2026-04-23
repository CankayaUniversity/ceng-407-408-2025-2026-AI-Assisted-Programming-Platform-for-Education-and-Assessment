import {
  Box,
  Button,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import SectionCard   from "../common/SectionCard";
import StatusMessage from "../common/StatusMessage";

export default function LoginForm({
  portalRole,          // "student" | "teacher"
  onBackToRoleSelect,  // () => void
  authMode,
  setAuthMode,
  authError,
  authLoading,
  name,
  setName,
  email,
  setEmail,
  password,
  setPassword,
  handleSignIn,
  handleRegister,
  demoEmail,
  demoPassword,
}) {
  const roleLabel = portalRole === "teacher" ? "Teacher" : "Student";
  const accentColor = portalRole === "teacher" ? "secondary" : "primary";

  return (
    <SectionCard
      title={authMode === "login" ? `${roleLabel} Sign In` : `${roleLabel} Registration`}
      action={
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={onBackToRoleSelect}
            sx={{ color: "text.secondary" }}
          >
            Change portal
          </Button>
        </Stack>
      }
    >
      <Stack spacing={2.5}>
        <StatusMessage error={authError} />

        {/* Sign in / Register toggle */}
        <Stack direction="row" spacing={1}>
          <Button
            fullWidth
            variant={authMode === "login" ? "contained" : "outlined"}
            color={accentColor}
            onClick={() => setAuthMode("login")}
          >
            Sign In
          </Button>
          <Button
            fullWidth
            variant={authMode === "register" ? "contained" : "outlined"}
            color={accentColor}
            onClick={() => setAuthMode("register")}
          >
            Register
          </Button>
        </Stack>

        <Divider />

        {/* Name field — only on register */}
        {authMode === "register" && (
          <TextField
            label="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            fullWidth
          />
        )}

        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          fullWidth
        />

        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={authMode === "login" ? "current-password" : "new-password"}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              authMode === "login" ? handleSignIn() : handleRegister();
            }
          }}
          fullWidth
        />

        {authMode === "login" ? (
          <>
            <Button
              variant="contained"
              color={accentColor}
              size="large"
              onClick={handleSignIn}
              disabled={authLoading}
            >
              {authLoading ? "Signing in…" : "Sign In"}
            </Button>
            {demoEmail && (
              <Typography variant="body2" color="text.secondary">
                Demo: <strong>{demoEmail}</strong> / <strong>{demoPassword}</strong>
              </Typography>
            )}
          </>
        ) : (
          <>
            <Button
              variant="contained"
              color={accentColor}
              size="large"
              onClick={handleRegister}
              disabled={authLoading}
            >
              {authLoading ? "Creating account…" : `Create ${roleLabel} Account`}
            </Button>
            <Typography variant="caption" color="text.secondary" textAlign="center">
              Registering as: <strong>{roleLabel}</strong>
            </Typography>
          </>
        )}
      </Stack>
    </SectionCard>
  );
}
