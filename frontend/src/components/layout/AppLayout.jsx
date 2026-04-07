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

      <PageShell title={showPageTitle ? (subtitle ? undefined : title) : undefined}
        subtitle={showPageTitle ? subtitle : undefined} maxWidth={maxWidth}>
        {children}
      </PageShell>
    </Box>
  );
}
