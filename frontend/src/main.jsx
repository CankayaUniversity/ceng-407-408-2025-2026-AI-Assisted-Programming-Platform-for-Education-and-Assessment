import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider, Box, Button, Typography } from "@mui/material";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ThemeModeProvider, useThemeMode } from "./context/ThemeContext";
import { createAppTheme } from "./theme";
import "./styles.css";

// ── Error Boundary ────────────────────────────────────────────────────────────
// Catches render-phase errors so the entire app doesn't go blank.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Uncaught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            p: 4,
            bgcolor: "#0d1117",
            color: "text.primary",
          }}
        >
          <Typography variant="h5" fontWeight={700} color="error">
            Something went wrong
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520, textAlign: "center" }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </Typography>
          <Button
            variant="contained"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = "/";
            }}
          >
            Reload App
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

function ThemedApp() {
  const { mode } = useThemeMode();
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeModeProvider>
        <ThemedApp />
      </ThemeModeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
