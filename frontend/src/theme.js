import { createTheme } from "@mui/material/styles";

export function createAppTheme(mode = "dark") {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary:   { main: "#6366f1" },
      secondary: { main: "#06b6d4" },
      success:   { main: "#22c55e" },
      warning:   { main: "#f59e0b" },
      error:     { main: "#ef4444" },
      background: isDark
        ? { default: "#0f172a", paper: "#111827" }
        : { default: "#f8fafc", paper: "#ffffff" },
      divider: isDark
        ? "rgba(148,163,184,0.12)"
        : "rgba(15,23,42,0.10)",
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
      h4: { fontWeight: 700 },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700 },
      button: { textTransform: "none", fontWeight: 600, letterSpacing: 0.2 },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 8 },
          containedPrimary: {
            background: "linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)",
            boxShadow: "0 2px 12px rgba(99,102,241,0.30)",
            "&:hover": {
              background: "linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)",
              boxShadow: "0 4px 16px rgba(99,102,241,0.40)",
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            border: isDark
              ? "1px solid rgba(148,163,184,0.12)"
              : "1px solid rgba(15,23,42,0.10)",
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": { borderRadius: 8 },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 6 },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 4 },
          bar:  { borderRadius: 4 },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: { fontWeight: 700 },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 14 },
        },
      },
    },
  });
}

// Default export kept for any legacy imports
export default createAppTheme("dark");
