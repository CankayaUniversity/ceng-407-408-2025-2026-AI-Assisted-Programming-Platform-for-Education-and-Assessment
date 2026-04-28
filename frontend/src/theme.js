import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary:    { main: "#6366f1" },
    secondary:  { main: "#06b6d4" },
    success:    { main: "#22c55e" },
    warning:    { main: "#f59e0b" },
    error:      { main: "#ef4444" },
    background: { default: "#0f172a", paper: "#111827" },
    divider:    "rgba(148,163,184,0.12)",
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
          border: "1px solid rgba(148,163,184,0.12)",
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

export default theme;