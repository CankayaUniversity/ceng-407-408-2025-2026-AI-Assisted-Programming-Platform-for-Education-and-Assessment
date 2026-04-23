import { useMemo, useState } from "react";
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import GroupIcon  from "@mui/icons-material/Group";

import SectionCard from "../common/SectionCard";

function progressColor(progress) {
  if (progress >= 80) return '#22C55E';
  if (progress >= 65) return '#EAB308';
  return '#EF4444';
}

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function StudentProgressTable({ students, loading, onStudentClick, studentGroupMap = {} }) {
  const [search,      setSearch]      = useState("");
  const [filterRange, setFilterRange] = useState("all");

  const visibleStudents = useMemo(() => {
    let result = [...students];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q) ||
          (studentGroupMap[s.id] ?? []).some((g) => g.toLowerCase().includes(q)),
      );
    }
    if (filterRange === "high")   result = result.filter((s) => s.progress >= 80);
    if (filterRange === "medium") result = result.filter((s) => s.progress >= 65 && s.progress < 80);
    if (filterRange === "low")    result = result.filter((s) => s.progress < 65);
    return result;
  }, [students, search, filterRange]);

  return (
    <SectionCard title="Student Progress">
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Overview of all students in your class
      </Typography>

      {/* ── Search / filter toolbar ─────────────────────────────────── */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }} alignItems="center">
        <TextField
          size="small"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          select size="small" label="Progress" value={filterRange}
          onChange={(e) => setFilterRange(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">All students</MenuItem>
          <MenuItem value="high">High (&ge;80%)</MenuItem>
          <MenuItem value="medium">Medium (65–79%)</MenuItem>
          <MenuItem value="low">Low (&lt;65%)</MenuItem>
        </TextField>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : students.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          No students found.
        </Typography>
      ) : visibleStudents.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          No students match your filters.
        </Typography>
      ) : (
        <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'rgba(148, 163, 184, 0.08)' }}>
                <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>STUDENT</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>EMAIL</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>GROUPS</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>PROBLEMS COMPLETED</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>PROGRESS</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {visibleStudents.map((student) => (
                <TableRow
                  key={student.id}
                  hover
                  onClick={() => onStudentClick?.(student)}
                  sx={{ cursor: onStudentClick ? "pointer" : "default" }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 34, height: 34, bgcolor: 'rgba(91, 77, 255, 0.12)', color: '#4F46E5', fontWeight: 700, fontSize: 14 }}>
                        {initials(student.name)}
                      </Avatar>
                      <Typography sx={{ fontWeight: 600 }}>{student.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{student.email}</TableCell>
                  <TableCell>
                    {(studentGroupMap[student.id] ?? []).length === 0 ? (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    ) : (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {(studentGroupMap[student.id] ?? []).map((gName) => (
                          <Chip
                            key={gName}
                            label={gName}
                            size="small"
                            icon={<GroupIcon style={{ fontSize: 12 }} />}
                            variant="outlined"
                            color="primary"
                            sx={{ height: 20, fontSize: 11, "& .MuiChip-label": { px: 0.75 } }}
                          />
                        ))}
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell>{student.completed} / {student.total}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 160 }}>
                      <LinearProgress
                        variant="determinate"
                        value={student.progress}
                        sx={{
                          flexGrow: 1,
                          height: 8,
                          borderRadius: 999,
                          bgcolor: 'rgba(148, 163, 184, 0.22)',
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 999,
                            bgcolor: progressColor(student.progress),
                          },
                        }}
                      />
                      <Typography variant="body2" sx={{ minWidth: 40 }}>{student.progress}%</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionCard>
  );
}
