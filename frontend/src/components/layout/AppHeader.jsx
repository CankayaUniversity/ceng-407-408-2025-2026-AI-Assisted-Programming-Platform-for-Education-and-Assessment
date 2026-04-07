import { AppBar, Avatar, Box, Button, Chip, Stack, Toolbar, Typography } from "@mui/material";

function getInitials(value = "") {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function normalizeNavItems(navItems = []) {
  return navItems.map((item) => {
    if (typeof item === "string") {
      return { label: item, active: false };
    }
    return { label: item.label, active: Boolean(item.active) };
  });
}

export default function AppHeader({
  title,
  userLabel,
  onLogout,
  navItems = [],
  navDisabled = true,
  variant = "default",
  roleLabel,
}) {
  const items = normalizeNavItems(navItems);

  if (variant === "teacher") {
  return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{
        borderBottom: "1px solid rgba(148, 163, 184, 0.14)",
        bgcolor: "rgba(15, 23, 42, 0.72)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "none",
      }}
    >
      <Toolbar sx={{ minHeight: 60, gap: 2, px: { xs: 2, md: 3 } }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              display: "grid",
              placeItems: "center",
              color: "common.white",
              fontSize: 13,
              fontWeight: 700,
              background: "linear-gradient(135deg, #5B4DFF 0%, #4F46E5 100%)",
              boxShadow: "0 8px 18px rgba(91, 77, 255, 0.22)",
            }}
          >
            AI
          </Box>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: "#F8FAFC", fontSize: 18 }}>
              {title}
            </Typography>
            {roleLabel ? (
              <Chip
                label={roleLabel}
                size="small"
                sx={{
                  height: 24,
                  bgcolor: "rgba(99, 102, 241, 0.18)",
                  color: "#C7D2FE",
                  fontWeight: 600,
                  borderRadius: 1,
                  border: "1px solid rgba(99, 102, 241, 0.22)",
                }}
              />
            ) : null}
          </Stack>
        </Stack>

        {items.length > 0 ? (
          <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1, display: { xs: "none", md: "flex" } }}>
            {items.map((item) => (
              <Box
                key={item.label}
                sx={{
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 1.5,
                  color: item.active ? "#F8FAFC" : "#CBD5E1",
                  bgcolor: item.active ? "rgba(99, 102, 241, 0.16)" : "transparent",
                  fontSize: 15,
                  fontWeight: item.active ? 600 : 500,
                  cursor: navDisabled ? "default" : "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {item.label}
              </Box>
            ))}
          </Stack>
        ) : (
          <Box sx={{ flexGrow: 1 }} />
        )}

        <Stack direction="row" spacing={1.25} alignItems="center">
          {userLabel ? (
            <Avatar
              sx={{
                width: 36,
                height: 36,
                bgcolor: "#5B4DFF",
                color: "common.white",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {getInitials(userLabel)}
            </Avatar>
          ) : null}

          {onLogout ? (
            <Button
              variant="text"
              onClick={onLogout}
              sx={{
                color: "#E2E8F0",
                minWidth: 0,
                "&:hover": {
                  bgcolor: "rgba(255,255,255,0.06)",
                },
              }}
            >
              Logout
            </Button>
          ) : null}
        </Stack>
      </Toolbar>
    </AppBar>
  );
}

return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{
        borderBottom: "1px solid rgba(148, 163, 184, 0.14)",
        bgcolor: "rgba(15, 23, 42, 0.72)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "none",
      }}
    >
      <Toolbar sx={{ minHeight: 60, gap: 2, px: { xs: 2, md: 3 } }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              display: "grid",
              placeItems: "center",
              color: "common.white",
              fontSize: 13,
              fontWeight: 700,
              background: "linear-gradient(135deg, #5B4DFF 0%, #4F46E5 100%)",
              boxShadow: "0 8px 18px rgba(91, 77, 255, 0.22)",
            }}
          >
            AI
          </Box>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: "#F8FAFC", fontSize: 18 }}>
              {title}
            </Typography>
            {roleLabel ? (
              <Chip
                label={roleLabel}
                size="small"
                sx={{
                  height: 24,
                  bgcolor: "rgba(99, 102, 241, 0.18)",
                  color: "#C7D2FE",
                  fontWeight: 600,
                  borderRadius: 1,
                  border: "1px solid rgba(99, 102, 241, 0.22)",
                }}
              />
            ) : null}
          </Stack>
        </Stack>

        {items.length > 0 ? (
          <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1, display: { xs: "none", md: "flex" } }}>
            {items.map((item) => (
              <Box
                key={item.label}
                sx={{
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 1.5,
                  color: item.active ? "#F8FAFC" : "#CBD5E1",
                  bgcolor: item.active ? "rgba(99, 102, 241, 0.16)" : "transparent",
                  fontSize: 15,
                  fontWeight: item.active ? 600 : 500,
                  cursor: navDisabled ? "default" : "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {item.label}
              </Box>
            ))}
          </Stack>
        ) : (
          <Box sx={{ flexGrow: 1 }} />
        )}

        <Stack direction="row" spacing={1.25} alignItems="center">
          {userLabel ? (
            <Avatar
              sx={{
                width: 36,
                height: 36,
                bgcolor: "#5B4DFF",
                color: "common.white",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {getInitials(userLabel)}
            </Avatar>
          ) : null}

          {onLogout ? (
            <Button
              variant="text"
              onClick={onLogout}
              sx={{
                color: "#E2E8F0",
                minWidth: 0,
                "&:hover": {
                  bgcolor: "rgba(255,255,255,0.06)",
                },
              }}
            >
              Logout
            </Button>
          ) : null}
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
