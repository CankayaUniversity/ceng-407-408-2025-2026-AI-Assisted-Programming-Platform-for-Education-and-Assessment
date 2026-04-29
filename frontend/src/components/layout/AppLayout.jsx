import { Box } from "@mui/material";

import AppHeader from "./AppHeader";
import PageShell from "./PageShell";

export default function AppLayout({
  title,
  subtitle,
  userLabel,
  onLogout,
  navItems,
  maxWidth = "xl",
  children,
  headerVariant = "default",
  roleLabel, 
  showPageTitle = true,
}) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        color: "text.primary",
      }}
    >
      <AppHeader
        title={title}
        userLabel={userLabel}
        onLogout={onLogout}
        navItems={navItems}
        variant={headerVariant}
        roleLabel={roleLabel}
      />

      {/* 60px spacer — compensates for position="fixed" AppBar height */}
      <Box sx={{ height: 60 }} />

      <PageShell
        title={showPageTitle ? (subtitle ? undefined : title) : undefined}
        subtitle={showPageTitle ? subtitle : undefined}
        maxWidth={maxWidth}
      >
        {children}
      </PageShell>
    </Box>
  );
}
