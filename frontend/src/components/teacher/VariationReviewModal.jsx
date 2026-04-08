import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";

function ExampleBlock({ lines = [] }) {
  return (
    <Box
      sx={{
        mt: 1.5,
        p: 2,
        borderRadius: 2,
        bgcolor: "rgba(255, 255, 255, 0.04)",
        border: 1,
        borderColor: "rgba(148, 163, 184, 0.14)",
      }}
    >
      {lines.map((line) => (
        <Typography
          key={line}
          variant="body2"
          sx={{ fontFamily: "monospace" }}
        >
          {line}
        </Typography>
      ))}
    </Box>
  );
}

function RubricList({ rubric = [] }) {
  return (
    <Stack spacing={1.25} sx={{ mt: 2 }}>
      {rubric.map((item) => (
        <Typography key={item.label} variant="body2">
          <Box
            component="span"
            sx={{ color: "success.main", fontWeight: 700, mr: 1 }}
          >
            ✓
          </Box>
          <Box component="span" sx={{ fontWeight: 700 }}>
            {item.label}
          </Box>
          : {item.text}
        </Typography>
      ))}
    </Stack>
  );
}

export default function VariationReviewModal({
  open,
  onClose,
  onSave,
  selectedProblem,
  variation,
  onModeChange,
}) {
  if (!selectedProblem || !variation) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      PaperProps={{
        sx: {
          height: "min(860px, calc(100vh - 32px))",
          maxHeight: "calc(100vh - 32px)",
          bgcolor: "background.paper",
          overflow: "hidden",
          borderRadius: 3,
        },
      }}
    >
      <DialogTitle sx={{ py: 2.5, px: 3, fontSize: 18, fontWeight: 700 }}>
        AI Generated Variation
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", right: 18, top: 18 }}
        >
          ×
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          px: 0,
          py: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          height: "100%",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          }}
        >
          <Box sx={{ p: 3.5 }}>
            <Typography variant="overline" sx={{ color: "text.secondary" }}>
              ORIGINAL PROBLEM
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
              {selectedProblem.title}
            </Typography>
            <Typography variant="body1" sx={{ mt: 2.5, lineHeight: 1.8 }}>
              {selectedProblem.description}
            </Typography>

            <Typography variant="h6" sx={{ mt: 3, fontWeight: 700 }}>
              Example:
            </Typography>
            <ExampleBlock lines={selectedProblem.example} />
          </Box>

          <Box
            sx={{
              p: 3.5,
              bgcolor: "background.default",
              borderLeft: { md: 1 },
              borderColor: "rgba(148, 163, 184, 0.14)",
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Chip
                label="AI GENERATED VARIATION"
                size="small"
                sx={{
                  bgcolor: "rgba(59, 130, 246, 0.16)",
                  color: "#93C5FD",
                  fontWeight: 700,
                  border: "1px solid rgba(59, 130, 246, 0.22)",
                }}
              />
              <Chip label={variation.label} size="small" variant="outlined" />
            </Stack>

            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
              {variation.title}
            </Typography>
            <Typography variant="body1" sx={{ mt: 2.5, lineHeight: 1.8 }}>
              {variation.description}
            </Typography>

            <Typography variant="h6" sx={{ mt: 3, fontWeight: 700 }}>
              Example:
            </Typography>
            <ExampleBlock lines={variation.example} />

            <Divider sx={{ my: 3 }} />

            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              AI-Generated Rubric
            </Typography>
            <RubricList rubric={variation.rubric} />
          </Box>
        </Box>

        <Box
          sx={{
            flexShrink: 0,
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            justifyContent: "space-between",
            alignItems: { xs: "stretch", md: "center" },
            gap: 2,
            px: 3,
            py: 2.5,
            borderTop: 1,
            borderColor: "rgba(148, 163, 184, 0.14)",
            bgcolor: "background.paper",
          }}
        >
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button
              variant="contained"
              color="success"
              onClick={() => onModeChange("easier")}
            >
              Suggest Easier
            </Button>
            <Button
              variant="contained"
              sx={{
                bgcolor: "#BFDBFE",
                color: "#1D4ED8",
                "&:hover": { bgcolor: "#93C5FD" },
              }}
              onClick={() => onModeChange("similar")}
            >
              Similar Difficulty
            </Button>
            <Button
              variant="contained"
              sx={{
                bgcolor: "#F97316",
                "&:hover": { bgcolor: "#EA580C" },
              }}
              onClick={() => onModeChange("harder")}
            >
              Suggest Harder
            </Button>
          </Stack>

          <Stack direction="row" spacing={1.5} justifyContent="flex-end">
            <Button variant="outlined" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="contained" onClick={onSave}>
              Save Variation to Question Bank
            </Button>
          </Stack>
        </Box>
      </DialogContent>
    </Dialog>
  );
}