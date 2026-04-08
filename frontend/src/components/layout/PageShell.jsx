import { Box, Container, Typography } from "@mui/material";

export default function PageShell({ title, subtitle, children, maxWidth = "lg" }) {
  return (
    <Box sx={{ minHeight: "100vh", py: 4 }}>
      <Container maxWidth={maxWidth}>
        {title && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h4" fontWeight={700} gutterBottom>
              {title}
            </Typography>

            {subtitle && (
              <Typography variant="body1" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
        )}

        {children}
      </Container>
    </Box>
  );
}