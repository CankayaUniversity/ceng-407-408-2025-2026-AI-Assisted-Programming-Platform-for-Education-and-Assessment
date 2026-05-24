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
  // When `lockdown` is true (exam mode), the header hides all navigation
  // and the admin notification bell. Theme toggle + logout stay visible so
  // the student can still exit in an emergency.
  lockdown = false,
}) {
  const location    = useLocation();
  const navigate    = useNavigate();
  const muiTheme    = useTheme();
  const { mode, toggleMode } = useThemeMode();
  const isDark      = mode === "dark";
  const items       = lockdown ? [] : normalizeNavItems(navItems, location.pathname);

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
      {/* Admin-only notification bell — self-hides for non-admin users.
          Also hidden completely in exam-lockdown mode. */}
      {!lockdown && <AdminApprovalBell />}
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
  // Inline SVG icon — graduation cap + terminal cursor.
  // Concept: academic platform for coding. Designed at 64×64 viewBox and
  // rendered at 32×32 in the header for sharp anti-aliasing at small sizes.
  const SiteIcon = (
    <Box
      component="svg"
      viewBox="0 0 64 64"
      sx={{
        width: 32, height: 32, borderRadius: 1.5,
        boxShadow: "0 8px 18px rgba(91, 77, 255, 0.22)",
        flexShrink: 0,
      }}
    >
      <defs>
        <linearGradient id="siteIconBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#0F172A" />
          <stop offset="100%" stopColor="#1E293B" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="64" height="64" rx="14" fill="url(#siteIconBg)" />
      {/* Mortarboard */}
      <path d="M32 18 L52 26 L32 34 L12 26 Z"
            fill="#6366F1" stroke="#A5B4FC" strokeWidth="1" />
      {/* Tassel */}
      <line x1="50" y1="26" x2="50" y2="36" stroke="#FBBF24" strokeWidth="2" />
      <circle cx="50" cy="37" r="2" fill="#FBBF24" />
      {/* Cap base */}
      <path d="M22 30 L22 38 Q32 44 42 38 L42 30" fill="none"
            stroke="#A5B4FC" strokeWidth="2" strokeLinecap="round" />
      {/* ">" cursor (terminal prompt) */}
      <path d="M22 48 L28 52 L22 56" stroke="#22D3EE" strokeWidth="3" fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
      <line x1="32" y1="56" x2="44" y2="56" stroke="#22D3EE" strokeWidth="3"
            strokeLinecap="round" />
    </Box>
  );

  const LogoTitle = (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
      {SiteIcon}
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
