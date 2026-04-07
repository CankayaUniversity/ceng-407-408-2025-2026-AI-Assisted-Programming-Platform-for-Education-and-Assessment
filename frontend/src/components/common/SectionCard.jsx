import { Card, CardContent, Typography, Box } from "@mui/material";

export default function SectionCard({ title, action, children }) {
  return (
    <Card elevation={2} sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: 3 }}>
        {(title || action) && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            {title && (
              <Typography variant="h6" fontWeight={600}>
                {title}
              </Typography>
            )}

            {action && <Box>{action}</Box>}
          </Box>
        )}

        {children}
      </CardContent>
    </Card>
  );
}