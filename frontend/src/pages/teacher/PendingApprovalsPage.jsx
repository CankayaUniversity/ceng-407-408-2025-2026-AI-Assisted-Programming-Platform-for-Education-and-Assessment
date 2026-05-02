import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleIcon  from "@mui/icons-material/CheckCircle";
import CancelIcon       from "@mui/icons-material/Cancel";
import HourglassIcon    from "@mui/icons-material/HourglassBottom";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api }    from "../../lib/api";

export default function PendingApprovalsPage() {
  const { token }                 = useAuth();
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [actionLoading, setAction] = useState(null);   // userId being acted on
  const [rejectDialog, setRejectDialog] = useState(null); // { userId, name } | null
  const [rejectReason, setRejectReason] = useState("");

  const authHeaders = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/api/admin/pending-teachers", { headers: authHeaders });
      setRows(res.data ?? []);
    } catch { /* show empty */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function approve(userId) {
    setAction(userId);
    try {
      await api(`/api/admin/approve/${userId}`, { method: "POST", headers: authHeaders });
      setRows((r) => r.filter((u) => u.id !== userId));
    } catch { /* ignore */ }
    setAction(null);
  }

  async function reject() {
    if (!rejectDialog) return;
    const { userId } = rejectDialog;
    setAction(userId);
    try {
      await api(`/api/admin/reject/${userId}`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason || undefined }),
      });
      setRows((r) => r.filter((u) => u.id !== userId));
    } catch { /* ignore */ }
    setAction(null);
    setRejectDialog(null);
    setRejectReason("");
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
        <HourglassIcon sx={{ color: "warning.main", fontSize: 28 }} />
        <Typography variant="h5" fontWeight={700}>
          Pending Teacher Approvals
        </Typography>
        {!loading && (
          <Chip
            label={rows.length}
            color={rows.length > 0 ? "warning" : "default"}
            size="small"
            sx={{ fontWeight: 700 }}
          />
        )}
      </Stack>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : rows.length === 0 ? (
        <Box
          sx={{
            textAlign: "center", py: 8, color: "text.secondary",
            border: "1px dashed", borderColor: "divider", borderRadius: 2,
          }}
        >
          <CheckCircleIcon sx={{ fontSize: 48, color: "success.main", mb: 1 }} />
          <Typography variant="h6">No pending approvals</Typography>
          <Typography variant="body2">All teacher registrations have been reviewed.</Typography>
        </Box>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Registered</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: 13 }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button
                      variant="contained"
                      color="success"
                      size="small"
                      startIcon={
                        actionLoading === u.id
                          ? <CircularProgress size={14} color="inherit" />
                          : <CheckCircleIcon />
                      }
                      onClick={() => approve(u.id)}
                      disabled={actionLoading !== null}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      startIcon={<CancelIcon />}
                      onClick={() => { setRejectDialog(u); setRejectReason(""); }}
                      disabled={actionLoading !== null}
                    >
                      Reject
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Reject reason dialog */}
      <Dialog
        open={Boolean(rejectDialog)}
        onClose={() => setRejectDialog(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Reject {rejectDialog?.name}?</DialogTitle>
        <DialogContent>
          <TextField
            label="Reason (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            multiline
            rows={3}
            fullWidth
            sx={{ mt: 1 }}
            placeholder="This will be included in the rejection email sent to the teacher."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={reject}
            disabled={actionLoading !== null}
          >
            Reject Account
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
