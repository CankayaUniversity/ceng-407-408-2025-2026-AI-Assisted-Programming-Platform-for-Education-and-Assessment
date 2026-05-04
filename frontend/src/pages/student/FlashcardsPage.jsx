/**
 * FlashcardsPage.jsx
 *
 * Flashcard library grouped by problem.
 *
 * Layout:
 *   - Classic dropdown filters (language, topic, card type)
 *   - Problems listed newest-first as collapsible accordion rows
 *   - Only problem titles visible by default; clicking expands cards below
 *   - Clicking a card opens FlashcardDetailDialog with full content
 */

import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon     from "@mui/icons-material/ExpandMore";
import TipsAndUpdatesIcon from "@mui/icons-material/TipsAndUpdates";
import StyleIcon          from "@mui/icons-material/Style";

import AppLayout             from "../../components/layout/AppLayout";
import FlashcardCard, { TYPE_CONFIG } from "../../components/student/FlashcardCard";
import FlashcardDetailDialog from "../../components/student/FlashcardDetailDialog";
import { API_BASE }          from "../../apiBase";

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <Box
      sx={{
        textAlign: "center", py: 10,
        border: "1px dashed", borderColor: "divider", borderRadius: 3,
      }}
    >
      <StyleIcon sx={{ fontSize: 52, color: "text.disabled", mb: 2 }} />
      <Typography variant="h6" color="text.secondary" gutterBottom>
        No flashcards yet
      </Typography>
      <Typography variant="body2" color="text.disabled" sx={{ maxWidth: 380, mx: "auto" }}>
        Solve a problem correctly and click the "Create Flashcards" button to earn
        your first AI-generated feedback cards.
      </Typography>
    </Box>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FlashcardsPage({ currentUser, token, handleLogout, navItems }) {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Detail dialog
  const [dialogOpen,      setDialogOpen]      = useState(false);
  const [selectedCard,    setSelectedCard]    = useState(null);
  const [selectedProblem, setSelectedProblem] = useState(null);

  // Filters
  const [langFilter,  setLangFilter]  = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [typeFilter,  setTypeFilter]  = useState("all");

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/api/flashcards/library`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((body) => setLibrary(body.data ?? []))
      .catch((e)  => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // ── Derived filter options ────────────────────────────────────────────────
  const languages = useMemo(() => {
    const s = new Set(library.map((r) => r.language).filter(Boolean));
    return [...s].sort();
  }, [library]);

  const topics = useMemo(() => {
    const s = new Set(library.map((r) => r.category).filter(Boolean));
    return [...s].sort();
  }, [library]);

  // ── Filtered + grouped rows ───────────────────────────────────────────────
  // Each row = one problem with its filtered cards. Problems are already
  // ordered newest-first by the API (orderBy: createdAt desc).
  const groups = useMemo(() => {
    const out = [];
    for (const row of library) {
      if (langFilter  !== "all" && row.language !== langFilter)  continue;
      if (topicFilter !== "all" && row.category !== topicFilter) continue;

      const cards = (row.cards ?? []).filter(
        (c) => typeFilter === "all" || c.type === typeFilter,
      );
      if (cards.length === 0) continue;

      out.push({
        id:           row.id,
        problemTitle: row.problemTitle,
        language:     row.language,
        difficulty:   row.difficulty,
        category:     row.category,
        cards,
      });
    }
    return out;
  }, [library, langFilter, topicFilter, typeFilter]);

  const totalCards = useMemo(
    () => library.reduce((n, r) => n + (r.cards?.length ?? 0), 0),
    [library],
  );

  const hasFilters = langFilter !== "all" || topicFilter !== "all" || typeFilter !== "all";

  function openCard(card, problemTitle) {
    setSelectedCard(card);
    setSelectedProblem(problemTitle);
    setDialogOpen(true);
  }

  function clearFilters() {
    setLangFilter("all");
    setTopicFilter("all");
    setTypeFilter("all");
  }

  return (
    <AppLayout
      title="AI Mentor"
      roleLabel="Student"
      userLabel={currentUser?.name || currentUser?.email}
      onLogout={handleLogout}
      navItems={navItems}
      maxWidth="xl"
      showPageTitle={false}
    >
      <Stack spacing={3}>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <TipsAndUpdatesIcon sx={{ color: "primary.light", fontSize: 28 }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>Feedback Flashcards</Typography>
            <Typography variant="body2" color="text.secondary">
              {loading
                ? "Loading…"
                : `${totalCards} card${totalCards !== 1 ? "s" : ""} across ${library.length} problem${library.length !== 1 ? "s" : ""}`}
            </Typography>
          </Box>
        </Stack>

        {/* ── Filters ───────────────────────────────────────────────────────── */}
        {!loading && library.length > 0 && (
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            {/* Language */}
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Language</InputLabel>
              <Select
                value={langFilter}
                label="Language"
                onChange={(e) => setLangFilter(e.target.value)}
              >
                <MenuItem value="all">All languages</MenuItem>
                {languages.map((l) => (
                  <MenuItem key={l} value={l}>{l}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Topic */}
            {topics.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Topic</InputLabel>
                <Select
                  value={topicFilter}
                  label="Topic"
                  onChange={(e) => setTopicFilter(e.target.value)}
                >
                  <MenuItem value="all">All topics</MenuItem>
                  {topics.map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Card type */}
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Card type</InputLabel>
              <Select
                value={typeFilter}
                label="Card type"
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <MenuItem value="all">All types</MenuItem>
                <MenuItem value="error">Error</MenuItem>
                <MenuItem value="shortcoming">Shortcoming</MenuItem>
                <MenuItem value="improvement">Improvement</MenuItem>
              </Select>
            </FormControl>

            {/* Clear */}
            {hasFilters && (
              <Chip
                label="Clear filters"
                size="small"
                variant="outlined"
                onClick={clearFilters}
                sx={{ cursor: "pointer", color: "text.secondary", borderColor: "divider" }}
              />
            )}
          </Stack>
        )}

        {/* ── Loading / error / empty ────────────────────────────────────────── */}
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {!loading && !error && library.length === 0 && <EmptyState />}

        {/* ── Grouped accordion list ─────────────────────────────────────────── */}
        {!loading && !error && groups.length > 0 && (
          <Stack spacing={1}>
            {groups.map((group) => (
              <Accordion
                key={group.id}
                disableGutters
                elevation={0}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: "10px !important",
                  bgcolor: "background.paper",
                  "&:before": { display: "none" },
                  overflow: "hidden",
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    px: 2.5,
                    py: 0.5,
                    "&:hover": { bgcolor: "rgba(255,255,255,0.03)" },
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexGrow: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>
                      {group.problemTitle}
                    </Typography>
                    {group.difficulty && (
                      <Chip label={group.difficulty} size="small" variant="outlined" />
                    )}
                    {group.language && (
                      <Chip label={group.language} size="small" variant="outlined" />
                    )}
                    <Typography variant="caption" color="text.disabled">
                      {group.cards.length} card{group.cards.length !== 1 ? "s" : ""}
                    </Typography>
                  </Stack>
                </AccordionSummary>

                <AccordionDetails sx={{ px: 2.5, pb: 2.5, pt: 0 }}>
                  <Grid container spacing={2}>
                    {group.cards.map((card, ci) => (
                      <Grid item xs={12} sm={6} lg={4} key={ci}>
                        <FlashcardCard
                          card={card}
                          problemTitle={group.problemTitle}
                          onClick={() => openCard(card, group.problemTitle)}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        )}

        {/* No results from filter */}
        {!loading && !error && library.length > 0 && groups.length === 0 && (
          <Box sx={{ textAlign: "center", py: 6 }}>
            <Typography color="text.secondary">
              No cards match the selected filters.
            </Typography>
            <Chip
              label="Clear filters"
              size="small"
              variant="outlined"
              onClick={clearFilters}
              sx={{ mt: 1.5, cursor: "pointer" }}
            />
          </Box>
        )}

      </Stack>

      {/* ── Detail dialog ────────────────────────────────────────────────────── */}
      <FlashcardDetailDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        card={selectedCard}
        problemTitle={selectedProblem}
      />
    </AppLayout>
  );
}
