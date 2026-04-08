import {
  Avatar,
  Box,
  CircularProgress,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

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

export default function StudentProgressTable({ students, loading, onStudentClick }) {
  return (
    <SectionCard title="Student Progress">
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5 }}>
        Overview of all students in your class
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : students.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          No students found.
        </Typography>
      ) : (
        <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'rgba(148, 163, 184, 0.08)' }}>
                <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>STUDENT</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>EMAIL</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>PROBLEMS COMPLETED</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }}>PROGRESS</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {students.map((student) => (
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
