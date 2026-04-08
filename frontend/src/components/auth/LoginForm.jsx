import { Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";

import SectionCard from "../common/SectionCard";
import StatusMessage from "../common/StatusMessage";

export default function LoginForm({
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
  registerRole,
  setRegisterRole,
  handleSignIn,
  handleRegister,
  demoEmail,
  demoPassword,
}) {
  return (
    <SectionCard
      title={authMode === "login" ? "Sign in" : "Create account"}
      action={
        <Stack direction="row" spacing={1}>
          <Button variant={authMode === "login" ? "contained" : "outlined"} onClick={() => setAuthMode("login")}>
            Sign in
          </Button>
          <Button variant={authMode === "register" ? "contained" : "outlined"} onClick={() => setAuthMode("register")}>
            Register
          </Button>
        </Stack>
      }
    >
      <Stack spacing={2.5}>
        <StatusMessage error={authError} />

        {authMode === "register" ? (
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            fullWidth
          />
        ) : null}

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
          fullWidth
        />

        {authMode === "register" ? (
          <FormControl fullWidth>
            <InputLabel id="register-role-label">Role</InputLabel>
            <Select
              labelId="register-role-label"
              value={registerRole}
              label="Role"
              onChange={(e) => setRegisterRole(e.target.value)}
            >
              <MenuItem value="student">Student</MenuItem>
              <MenuItem value="teacher">Teacher</MenuItem>
            </Select>
          </FormControl>
        ) : null}

        {authMode === "login" ? (
          <>
            <Button variant="contained" size="large" onClick={handleSignIn} disabled={authLoading}>
              {authLoading ? "Signing in..." : "Sign in"}
            </Button>
            <Typography variant="body2" color="text.secondary">
              Demo user: <strong>{demoEmail}</strong> / <strong>{demoPassword}</strong>
            </Typography>
          </>
        ) : (
          <Button variant="contained" size="large" onClick={handleRegister} disabled={authLoading}>
            {authLoading ? "Creating..." : "Register"}
          </Button>
        )}
      </Stack>
    </SectionCard>
  );
}
