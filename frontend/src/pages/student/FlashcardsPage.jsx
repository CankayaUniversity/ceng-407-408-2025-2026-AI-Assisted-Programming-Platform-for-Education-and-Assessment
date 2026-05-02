/**
 * FlashcardsPage.jsx
 *
 * Persistent library of all AI-generated feedback flashcards earned by the
 * student. Cards are fetched from GET /api/flashcards/library and displayed
 * in a filterable grid — no modal required.
 *
 * Filters:
 *   - Language   (chip group — derived from actual data)
 *   - Topic      (chip group — problem category, derived from actual data)
 *   - Card type  (All / Error / Shortcoming / Improvement)
 */

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import TipsAndUpdatesIcon from "@mui/icons-material/TipsAndUpdates";
import StyleIcon          from "@mui/icons-material/Style";

import AppLayout      from "../../components/layout/AppLayout";
import SectionCard    from "../../components/common/SectionCard";
import FlashcardCard, { TYPE_CONFIG } from "../../components/student/FlashcardCard";
import { API_BASE }   from "../../apiBase";

// ── Filter chip row ───────────────────────────────────────────────────────────

function FilterChips({ label, options, selected, onToggle, colorFn }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 52, fontWeight: 600 }}>
        {label}
      </Typography>
      {options.map((opt) => {
        const active = selected.includes(opt);
        const sx     = colorFn ? colorFn(opt, active) : {};
        return (
          <Chip
            key={opt}
            label={opt}
            size="small"
            variant={active ? "filled" : "outlined"}
            onClick={() => onToggle(opt)}
            sx={{ cursor: "pointer", transition: "all 0.15s", ...sx }}
          />
        );
      })}
    </Stack>
  );
}

// ── Language colour map ───────────────────────────────────────────────────────

const LANG_COLORS = {
  python:     "#3b82f6",
  javascript: "#f59e0b",
  java:       "#f97316",
  cpp:        "#8b5cf6",
  "c++":      "#8b5cf6",
  c:          "#6b7280",
  csharp:     "#a855f7",
  "c#":       "#a855f7",
};

function langChipSx(lang, active) {
  const color = LANG_COLORS[lang.toLowerCase()] ?? "#64748b";
  return active
    ? { bgcolor: color + "33", color, borderColor: color }
    : { color: "text.secondary", borderColor: "divider" };
}

// ── Type filter options ───────────────────────────────────────────────────────

const TYPE_OPTIONS = ["error", "shortcoming", "improvement"];

function typeChipSx(type, active) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.improvement;
  return active
    ? { bgcolor: cfg.border + "22", color: cfg.border, borderColor: cfg.border }
    : { color: "text.secondary", borderColor: "divider" };
}

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
      <Typography variant="body2" color="text.disabled" sx={{ maxWidth: 360, mx: "auto" }}>
        Feedback cards are generated automatically when you solve a problem.
        Submit a correct solution to earn your first card.
      </Typography>
    </Box>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FlashcardsPage({ currentUser, token, handleLogout, navItems }) {
  const [library,  setLibrary]  = useState([]);   // raw rows from API
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // Active filters — each is a Set of selected values (empty = show all)
  const [langFilter,  setLangFilter]  = useState([]);
  const [topicFilter, setTopicFilter] = useState([]);
  const [typeFilter,  setTypeFilter]  = useState([]);

  // ── Fetch ────────────────────────────────────────────────────────────────
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

  // ── Derive filter options from actual data ────────────────────────────────
  const languages = useMemo(() => {
    const s = new Set(library.map((r) => r.language).filter(Boolean));
    return [...s].sort();
  }, [library]);

  const topics = useMemo(() => {
    const s = new Set(library.map((r) => r.category).filter(Boolean));
    return [...s].sort();
  }, [library]);

  // ── Toggle helpers ────────────────────────────────────────────────────────
  function toggle(setter, value) {
    setter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  // ── Build flat list of { card, meta } items to display ───────────────────
  const items = useMemo(() => {
    const out = [];
    for (const row of library) {
      // Language filter
      if (langFilter.length  && !langFilter.includes(row.language))   continue;
      // Topic filter
      if (topicFilter.length && !topicFilter.includes(row.category))  continue;

      for (let ci = 0; ci < (row.cards ?? []).length; ci++) {
        const card = row.cards[ci];
        // Card type filter
        if (typeFilter.length && !typeFilter.includes(card.type)) continue;
        out.push({
          card,
          badge: `${row.problemTitle}${row.difficulty ? " · " + row.difficulty : ""}${row.language ? " · " + row.language : ""}`,
          key:   `${row.id}-${ci}`,
        });
      }
    }
    return out;
  }, [library, langFilter, topicFilter, typeFilter]);

  // ── Total card count (unfiltered) ─────────────────────────────────────────
  const totalCards = useMemo(
    () => library.reduce((n, r) => n + (r.cards?.length ?? 0), 0),
    [library],
  );

  const hasFilters = langFilter.length > 0 || topicFilter.length > 0 || typeFilter.length > 0;

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

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <TipsAndUpdatesIcon sx={{ color: "primary.light", fontSize: 28 }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>Feedback Flashcards</Typography>
            <Typography variant="body2" color="text.secondary">
              {loading ? "Loading…" : `${totalCards} card${totalCards !== 1 ? "s" : ""} across ${library.length} problem${library.length !== 1 ? "s" : ""}`}
            </Typography>
          </Box>
        </Stack>

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        {!loading && library.length > 0 && (
          <SectionCard title="Filter">
            <Stack spacing={1.5}>
              {languages.length > 0 && (
                <FilterChips
                  label="Language"
                  options={languages}
                  selected={langFilter}
                  onToggle={(v) => toggle(setLangFilter, v)}
                  colorFn={langChipSx}
                />
              )}
              {topics.length > 0 && (
                <>
                  <Divider />
                  <FilterChips
                    label="Topic"
                    options={topics}
                    selected={topicFilter}
                    onToggle={(v) => toggle(setTopicFilter, v)}
                    colorFn={null}
                  />
                </>
              )}
              <Divider />
              <FilterChips
                label="Type"
                options={TYPE_OPTIONS}
                selected={typeFilter}
                onToggle={(v) => toggle(setTypeFilter, v)}
                colorFn={typeChipSx}
              />
            </Stack>

            {hasFilters && (
              <Box sx={{ mt: 1.5 }}>
                <Chip
                  label="Clear all filters"
                  size="small"
                  variant="outlined"
                  onClick={() => { setLangFilter([]); setTopicFilter([]); setTypeFilter([]); }}
                  sx={{ color: "text.secondary", borderColor: "divider", cursor: "pointer" }}
                />
              </Box>
            )}
          </SectionCard>
        )}

        {/* ── States ──────────────────────────────────────────────────────── */}
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {!loading && !error && library.length === 0 && <EmptyState />}

        {/* ── Card grid ───────────────────────────────────────────────────── */}
        {!loading && items.length > 0 && (
          <>
            <Typography variant="caption" color="text.secondary">
              Showing {items.length} card{items.length !== 1 ? "s" : ""}
              {hasFilters ? " (filtered)" : ""}
            </Typography>
            <Grid container spacing={2}>
              {items.map(({ card, badge, key }) => (
                <Grid item xs={12} sm={6} lg={4} key={key}>
                  <FlashcardCard card={card} problemBadge={badge} minHeight={200} />
                </Grid>
              ))}
            </Grid>
          </>
        )}

        {/* No results from active filter */}
        {!loading && !error && library.length > 0 && items.length === 0 && (
          <Box sx={{ textAlign: "center", py: 6 }}>
            <Typography color="text.secondary">
              No cards match the selected filters.
            </Typography>
            <Chip
              label="Clear filters"
              size="small"
              variant="outlined"
              onClick={() => { setLangFilter([]); setTopicFilter([]); setTypeFilter([]); }}
              sx={{ mt: 1.5, cursor: "pointer" }}
            />
          </Box>
        )}

      </Stack>
    </AppLayout>
  );
}
