import { AppBar, Avatar, Box, Button, Chip, IconButton, Stack, Toolbar, Tooltip, Typography } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import DarkModeIcon  from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { useThemeMode } from "../../context/ThemeContext";
import AdminApprovalBell from "./AdminApprovalBell";

function getInitials(value = "") {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function normalizeNavItems(navItems = [], currentPath = "/") {
  return navItems.map((item) => {
    if (typeof item === "string") {
      return { label: item, path: "/", active: false };
    }
    return {
      label: item.label,
      path: item.path ?? "/",
      active: item.path
        ? currentPath === item.path ||
          (item.matchPaths ?? []).some((p) => currentPath.startsWith(p))
        : Boolean(item.active),
    };
  });
}

export default function AppHeader({
  title,
  userLabel,
  onLogout,
  navItems = [],
  variant = "default",
  roleLabel,
}) {
  const location    = useLocation();
  const navigate    = useNavigate();
  const muiTheme    = useTheme();
  const { mode, toggleMode } = useThemeMode();
  const isDark      = mode === "dark";
  const items       = normalizeNavItems(navItems, location.pathname);

  // ── Color tokens (dark vs light) ──────────────────────────────────────────
  const headerBg     = isDark ? "rgba(15, 23, 42, 0.92)"  : "rgba(255, 255, 255, 0.95)";
  const borderColor  = isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(15, 23, 42, 0.10)";
  const titleColor   = isDark ? "#F8FAFC" : "#1e293b";
  const navActive    = isDark ? "#F8FAFC" : "#1e293b";
  const navInactive  = isDark ? "#CBD5E1" : "#64748b";
  const navActiveBg  = isDark ? "rgba(99, 102, 241, 0.16)" : "rgba(99, 102, 241, 0.10)";
  const navHoverBg   = isDark ? "rgba(99, 102, 241, 0.10)" : "rgba(99, 102, 241, 0.07)";
  const logoutColor  = isDark ? "#E2E8F0" : "#334155";
  const toggleColor  = isDark ? "#94a3b8" : "#64748b";

  // ── Shared AppBar sx ──────────────────────────────────────────────────────
  const appBarSx = {
    borderBottom: `1px solid ${borderColor}`,
    bgcolor: headerBg,
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    boxShadow: isDark ? "none" : "0 1px 8px rgba(0,0,0,0.06)",
    zIndex: (theme) => theme.zIndex.drawer + 1,
  };

  // ── Theme toggle button ───────────────────────────────────────────────────
  const ThemeToggle = (
    <Tooltip title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
      <IconButton
        onClick={toggleMode}
        size="small"
        sx={{ color: toggleColor, "&:hover": { bgcolor: navHoverBg } }}
      >
        {isDark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );

  // ── Nav items ─────────────────────────────────────────────────────────────
  const NavItems = items.length > 0 ? (
    <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1, display: { xs: "none", md: "flex" } }}>
      {items.map((item) => (
        <Box
          key={item.label}
          onClick={() => { if (!item.active) navigate(item.path); }}
          sx={{
            px: 1.25, py: 0.75,
            borderRadius: 1.5,
            color: item.active ? navActive : navInactive,
            bgcolor: item.active ? navActiveBg : "transparent",
            fontSize: 15,
            fontWeight: item.active ? 600 : 500,
            cursor: item.active ? "default" : "pointer",
            transition: "all 0.2s ease",
            "&:hover": { bgcolor: item.active ? navActiveBg : navHoverBg },
          }}
        >
          {item.label}
        </Box>
      ))}
    </Stack>
  ) : (
    <Box sx={{ flexGrow: 1 }} />
  );

  // ── Right-side controls ───────────────────────────────────────────────────
  const RightControls = (
    <Stack direction="row" spacing={1} alignItems="center">
      {ThemeToggle}
      {/* Admin-only notification bell — self-hides for non-admin users */}
      <AdminApprovalBell />
      {userLabel ? (
        <Avatar sx={{ width: 36, height: 36, bgcolor: "#5B4DFF", color: "common.white", fontWeight: 700, fontSize: 14 }}>
          {getInitials(userLabel)}
        </Avatar>
      ) : null}
      {onLogout ? (
        <Button
          variant="text"
          onClick={onLogout}
          sx={{ color: logoutColor, minWidth: 0, "&:hover": { bgcolor: navHoverBg } }}
        >
          Logout
        </Button>
      ) : null}
    </Stack>
  );

  // ── Logo + title ──────────────────────────────────────────────────────────
  const LogoTitle = (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
      <Box
        sx={{
          width: 32, height: 32, borderRadius: 1.5,
          display: "grid", placeItems: "center",
          color: "common.white", fontSize: 13, fontWeight: 700,
          background: "linear-gradient(135deg, #5B4DFF 0%, #4F46E5 100%)",
          boxShadow: "0 8px 18px rgba(91, 77, 255, 0.22)",
        }}
      >
        AI
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: titleColor, fontSize: 18 }}>
          {title}
        </Typography>
        {roleLabel ? (
          <Chip
            label={roleLabel}
            size="small"
            sx={{
              height: 24,
              bgcolor: isDark ? "rgba(99, 102, 241, 0.18)" : "rgba(99, 102, 241, 0.12)",
              color: isDark ? "#C7D2FE" : "#4f46e5",
              fontWeight: 600, borderRadius: 1,
              border: isDark ? "1px solid rgba(99, 102, 241, 0.22)" : "1px solid rgba(99, 102, 241, 0.20)",
            }}
          />
        ) : null}
      </Stack>
    </Stack>
  );

  return (
    <AppBar position="fixed" color="transparent" elevation={0} sx={appBarSx}>
      <Toolbar sx={{ minHeight: 60, gap: 2, px: { xs: 2, md: 3 } }}>
        {LogoTitle}
        {NavItems}
        {RightControls}
      </Toolbar>
    </AppBar>
  );
}
