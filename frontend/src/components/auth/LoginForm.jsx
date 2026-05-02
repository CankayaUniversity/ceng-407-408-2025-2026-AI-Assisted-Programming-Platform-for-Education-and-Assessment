import {
  Box,
  Button,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Alert,
} from "@mui/material";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useState } from "react";

import SectionCard   from "../common/SectionCard";
import StatusMessage from "../common/StatusMessage";
import { useAuth }   from "../../context/AuthContext";

// LoginForm receives portalRole + field state from parent (App.jsx) but
// calls auth context directly for the multi-step OTP flow.

// ── OTP verification step ─────────────────────────────────────────────────────

function OtpStep({ userId, roleLabel, onBack, onSuccess }) {
  const { handleVerifyEmail, handleResendOtp, authLoading, authError, setAuthError } = useAuth();
  const [code, setCode]           = useState("");
  const [resent, setResent]       = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function verify() {
    setVerifying(true);
    const result = await handleVerifyEmail({ userId, code });
    setVerifying(false);
    if (result?.requiresApproval) onSuccess("pending_approval");
  }

  async function resend() {
    setAuthError("");
    await handleResendOtp(userId);
    setResent(true);
    setTimeout(() => setResent(false), 5000);
  }

  return (
    <SectionCard
      title="Verify Your Email"
      action={
        <Button size="small" startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ color: "text.secondary" }}>
          Back
        </Button>
      }
    >
      <Stack spacing={2.5} alignItems="center">
        <MarkEmailReadIcon sx={{ fontSize: 56, color: "primary.main", opacity: 0.85 }} />

        <Typography variant="body1" textAlign="center" color="text.secondary">
          We sent a 6-digit code to your email address. Enter it below to verify your account.
        </Typography>

        <StatusMessage error={authError} />
        {resent && <Alert severity="success" sx={{ width: "100%" }}>A new code has been sent!</Alert>}

        <TextField
          label="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputProps={{ inputMode: "numeric", maxLength: 6, style: { textAlign: "center", fontSize: 28, letterSpacing: 8 } }}
          onKeyDown={(e) => { if (e.key === "Enter") verify(); }}
          fullWidth
        />

        <Button
          variant="contained"
          size="large"
          onClick={verify}
          disabled={code.length !== 6 || authLoading || verifying}
          fullWidth
        >
          {authLoading || verifying ? "Verifying…" : "Verify Email"}
        </Button>

        <Typography variant="body2" color="text.secondary">
          Didn't receive a code?{" "}
          <Box
            component="span"
            onClick={resend}
            sx={{ color: "primary.main", cursor: "pointer", textDecoration: "underline" }}
          >
            Resend
          </Box>
        </Typography>
      </Stack>
    </SectionCard>
  );
}

// ── Pending approval step (teachers only) ─────────────────────────────────────

function PendingApprovalStep({ onBack }) {
  return (
    <SectionCard title="Account Pending Approval">
      <Stack spacing={2.5} alignItems="center">
        <HourglassBottomIcon sx={{ fontSize: 56, color: "warning.main", opacity: 0.85 }} />

        <Typography variant="h6" textAlign="center" fontWeight={700}>
          You're on the waitlist!
        </Typography>

        <Typography variant="body1" textAlign="center" color="text.secondary">
          Your email has been verified. A platform administrator will review your teacher
          account shortly. You'll receive an email as soon as it's approved.
        </Typography>

        <Alert severity="info" sx={{ width: "100%" }}>
          Teacher accounts require manual approval to maintain platform quality.
        </Alert>

        <Button variant="outlined" onClick={onBack} sx={{ mt: 1 }}>
          Back to Sign In
        </Button>
      </Stack>
    </SectionCard>
  );
}

// ── Main LoginForm ─────────────────────────────────────────────────────────────

export default function LoginForm({
  portalRole,
  onBackToRoleSelect,
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
  handleSignIn,    // () => void (from App — wraps context with local field values)
  handleRegister,  // not used directly; LoginForm calls context
  demoEmail,
  demoPassword,
}) {
  const { handleRegister: ctxHandleRegister } = useAuth();
  const roleLabel   = portalRole === "teacher" ? "Teacher" : "Student";
  const accentColor = portalRole === "teacher" ? "secondary" : "primary";

  // Multi-step state
  const [step, setStep]               = useState("form"); // "form" | "otp" | "pending_approval"
  const [pendingUserId, setPendingUserId] = useState(null);
  const [classYear, setClassYear]     = useState("");     // student registration only

  async function onSignInClick() {
    const result = await handleSignIn();
    if (result?.requiresVerification) {
      setPendingUserId(result.userId);
      setStep("otp");
    }
  }

  async function onRegisterClick() {
    const result = await ctxHandleRegister({
      name,
      email,
      password,
      role: portalRole,
      classYear: portalRole === "student" && classYear ? Number(classYear) : undefined,
    });
    if (result?.requiresVerification) {
      setPendingUserId(result.userId);
      setStep("otp");
    }
  }

  function handleOtpSuccess(next) {
    // next === "pending_approval" for teachers
    if (next === "pending_approval") setStep("pending_approval");
    // else navigation handled inside handleVerifyEmail
  }

  if (step === "otp") {
    return (
      <OtpStep
        userId={pendingUserId}
        roleLabel={roleLabel}
        onBack={() => setStep("form")}
        onSuccess={handleOtpSuccess}
      />
    );
  }

  if (step === "pending_approval") {
    return <PendingApprovalStep onBack={() => { setStep("form"); setAuthMode("login"); }} />;
  }

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

        {authMode === "register" && (
          <TextField
            label="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            fullWidth
          />
        )}

        {authMode === "register" && portalRole === "student" && (
          <TextField
            select
            label="University Year"
            value={classYear}
            onChange={(e) => setClassYear(e.target.value)}
            fullWidth
          >
            <MenuItem value="">— Select year —</MenuItem>
            <MenuItem value="1">1st Year</MenuItem>
            <MenuItem value="2">2nd Year</MenuItem>
            <MenuItem value="3">3rd Year</MenuItem>
            <MenuItem value="4">4th Year</MenuItem>
            <MenuItem value="5">Graduate</MenuItem>
          </TextField>
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
              authMode === "login" ? onSignInClick() : onRegisterClick();
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
              onClick={onSignInClick}
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
              onClick={onRegisterClick}
              disabled={authLoading}
            >
              {authLoading ? "Creating account…" : `Create ${roleLabel} Account`}
            </Button>
            <Typography variant="caption" color="text.secondary" textAlign="center">
              Registering as: <strong>{roleLabel}</strong>
              {portalRole === "teacher" && " — requires email verification & admin approval"}
            </Typography>
          </>
        )}
      </Stack>
    </SectionCard>
  );
}
