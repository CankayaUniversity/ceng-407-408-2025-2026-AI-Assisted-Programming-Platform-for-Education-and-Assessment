import { Card, CardContent, Typography, Box } from "@mui/material";

export default function SectionCard({ title, action, children }) {
  return (
    <Card
      elevation={3}
      sx={{
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        backgroundImage: "none",
      }}
    >
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
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 3,
                    height: 20,
                    borderRadius: 2,
                    bgcolor: "primary.main",
                    flexShrink: 0,
                  }}
                />
                <Typography variant="h6" fontWeight={700}>
                  {title}
                </Typography>
              </Box>
            )}
            {action && <Box>{action}</Box>}
          </Box>
        )}
        {children}
      </CardContent>
    </Card>
  );
}