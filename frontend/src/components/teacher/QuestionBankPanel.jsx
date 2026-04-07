import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import SectionCard from "../common/SectionCard";
import VariationReviewModal from "./VariationReviewModal";

const VARIATION_COPY = {
  easier: {
    label: 'Easier',
    title: 'Find Pair with Given Sum',
    description:
      'Given a list of numbers and a target value, return the positions of two different numbers whose sum equals the target value. Focus on readability and handling the first valid pair you find.',
    example: [
      'Input: numbers = [3, 6, 9, 12], targetSum = 15',
      'Output: [1,2]',
      'Explanation: numbers[1] + numbers[2] = 6 + 9 = 15',
    ],
    rubric: [
      { label: 'Correctness (40%)', text: 'Returns a valid pair of indices for the target sum.' },
      { label: 'Approach (25%)', text: 'Uses a straightforward and understandable solution.' },
      { label: 'Code Quality (20%)', text: 'Readable code with clear variable names.' },
      { label: 'Edge Cases (15%)', text: 'Handles empty lists and missing-pair cases.' },
    ],
  },
  similar: {
    label: 'Similar Difficulty',
    title: 'Find Pair with Target Sum',
    description:
      'You are given a list of numbers and a target value. Your task is to find the positions (indices) of two different numbers in the list that, when added together, equal the target value.',
    example: [
      'Input: numbers = [3, 6, 9, 12], targetSum = 15',
      'Output: [1,2]',
      'Explanation: numbers[1] + numbers[2] = 6 + 9 = 15',
    ],
    rubric: [
      { label: 'Correctness (40%)', text: 'Solution returns correct indices.' },
      { label: 'Time Complexity (30%)', text: 'Near O(n) solution using a hash map.' },
      { label: 'Code Quality (20%)', text: 'Clean, readable code with proper naming.' },
      { label: 'Edge Cases (10%)', text: 'Handles empty arrays and no solution cases.' },
    ],
  },
  harder: {
    label: 'Harder',
    title: 'All Unique Index Pairs for Target Sum',
    description:
      'Given an array of integers and a target sum, return all unique index pairs whose values add up to the target. Avoid duplicate pairs and keep the output ordered by index.',
    example: [
      'Input: numbers = [2, 7, 11, 15, -2, 9], targetSum = 9',
      'Output: [[0,1], [4,5]]',
      'Explanation: 2 + 7 = 9 and -2 + 11 = 9',
    ],
    rubric: [
      { label: 'Correctness (35%)', text: 'Returns all valid unique index pairs.' },
      { label: 'Complexity (30%)', text: 'Efficiently tracks complements and duplicates.' },
      { label: 'Output Rules (20%)', text: 'Maintains pair uniqueness and stable ordering.' },
      { label: 'Robustness (15%)', text: 'Handles repeated values and empty results.' },
    ],
  },
};

function normalizeDifficulty(value = 'Easy') {
  const label = String(value).toLowerCase();
  if (label.includes('hard')) return { label: 'Hard', tone: '#FEE2E2', color: '#DC2626' };
  if (label.includes('medium')) return { label: 'Medium', tone: '#FEF3C7', color: '#D97706' };
  return { label: 'Easy', tone: '#DCFCE7', color: '#16A34A' };
}

export default function QuestionBankPanel({ items = [] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [variationMode, setVariationMode] = useState('similar');
  const [form, setForm] = useState({ title: '', topic: '', difficulty: 'Easy', description: '' });

  const variation = selectedProblem ? VARIATION_COPY[variationMode] : null;

  const mergedItems = useMemo(() => items, [items]);

  return (
    <>
      <SectionCard
        title="Question Bank Management"
        action={
          <Button variant="contained" onClick={() => setCreateOpen((prev) => !prev)}>
            {createOpen ? 'Close Form' : 'Create New Problem'}
          </Button>
        }
      >
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5 }}>
          Manage and create problem variations using AI
        </Typography>

        <Collapse in={createOpen} unmountOnExit>
          <Box
            sx={{
              mb: 3,
              p: { xs: 2, md: 3 },
              borderRadius: 3,
              bgcolor: 'transparent',
              border: 1,
              borderColor: 'rgba(148, 163, 184, 0.20)',
            }}
          >
            <Stack spacing={2}>
              <TextField
                label="Problem Title"
                placeholder="Enter problem title..."
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                fullWidth
              />

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="Topic"
                  placeholder="Arrays, Linked Lists, Graphs..."
                  value={form.topic}
                  onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))}
                  fullWidth
                />
                <TextField
                  select
                  label="Difficulty"
                  value={form.difficulty}
                  onChange={(event) => setForm((prev) => ({ ...prev, difficulty: event.target.value }))}
                  sx={{ minWidth: { md: 180 } }}
                >
                  <MenuItem value="Easy">Easy</MenuItem>
                  <MenuItem value="Medium">Medium</MenuItem>
                  <MenuItem value="Hard">Hard</MenuItem>
                </TextField>
              </Stack>

              <TextField
                label="Description"
                placeholder="Enter problem description..."
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                multiline
                minRows={5}
                fullWidth
              />

              <Stack direction="row" spacing={1.5}>
                <Button variant="contained">Save Problem</Button>
                <Button variant="outlined" onClick={() => setCreateOpen(false)}>Cancel</Button>
              </Stack>
            </Stack>
          </Box>
        </Collapse>

        <Stack divider={<Divider flexItem />}>
          {mergedItems.map((item) => {
            const difficulty = normalizeDifficulty(item.difficulty);
            return (
              <Box key={item.id} sx={{ py: 3, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>{item.title}</Typography>
                    <Chip label={difficulty.label} size="small" sx={{ bgcolor: difficulty.tone, color: difficulty.color }} />
                    <Chip label={item.topic} size="small" variant="outlined" />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Used {item.usageCount} times across all classes
                  </Typography>
                </Box>

                <Button variant="contained" onClick={() => { setSelectedProblem(item); setVariationMode('similar'); }}>
                  AI Generate Variation
                </Button>
              </Box>
            );
          })}
        </Stack>
      </SectionCard>

      <VariationReviewModal
        open={Boolean(selectedProblem)}
        onClose={() => setSelectedProblem(null)}
        onSave={() => setSelectedProblem(null)}
        selectedProblem={selectedProblem}
        variation={variation}
        onModeChange={setVariationMode}
      />
    </>
  );
}
