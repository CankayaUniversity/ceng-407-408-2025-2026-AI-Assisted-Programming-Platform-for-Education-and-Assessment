/**
 * AdminApprovalBell — notification bell for admin users.
 *
 * Renders a bell icon (with a badge showing the count of pending teacher
 * registrations) in the AppHeader, visible only to accounts with isAdmin=true.
 *
 * Clicking the bell opens a Popover that lists each pending teacher and
 * exposes Approve / Reject buttons. Approve activates the account; Reject
 * opens a small dialog for an optional rejection reason.
 *
 * All API calls are made directly using the token from AuthContext so this
 * component is self-contained and requires no extra props.
 */

import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import NotificationsIcon      from "@mui/icons-material/Notifications";
import NotificationsNoneIcon  from "@mui/icons-material/NotificationsNone";
import CheckCircleIcon        from "@mui/icons-material/CheckCircle";
import CancelIcon             from "@mui/icons-material/Cancel";
import HourglassBottomIcon    from "@mui/icons-material/HourglassBottom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api }     from "../../lib/api";

const POLL_INTERVAL_MS = 60_000; // refresh every 60 s

export default function AdminApprovalBell() {
  const { token, currentUser } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [pending,       setPending]       = useState([]);   // pending teacher records
  const [loading,       setLoading]       = useState(false);
  const [actionUserId,  setActionUserId]  = useState(null); // userId currently being processed
  const [anchorEl,      setAnchorEl]      = useState(null); // popover anchor
  const [rejectDialog,  setRejectDialog]  = useState(null); // { id, name } | null
  const [rejectReason,  setRejectReason]  = useState("");

  const authHeaders = useRef({});
  authHeaders.current = { Authorization: `Bearer ${token}` };

  // ── Data fetching ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!token || !currentUser?.isAdmin) return;
    try {
      setLoading(true);
      const res = await api("/api/admin/pending-teachers", { headers: authHeaders.current });
      setPending(res.data ?? []);
    } catch { /* silent — show stale badge rather than crashing */ }
    finally { setLoading(false); }
  }, [token, currentUser?.isAdmin]);

  useEffect(() => {
    load();
    if (!currentUser?.isAdmin) return;
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load, currentUser?.isAdmin]);

  // ── Don't render anything for non-admins ──────────────────────────────────
  if (!currentUser?.isAdmin) return null;

  // ── Approve ────────────────────────────────────────────────────────────────
  async function approve(userId) {
    setActionUserId(userId);
    try {
      await api(`/api/admin/approve/${userId}`, {
        method: "POST",
        headers: authHeaders.current,
      });
      setPending((prev) => prev.filter((u) => u.id !== userId));
    } catch { /* ignore */ }
    setActionUserId(null);
  }

  // ── Reject ─────────────────────────────────────────────────────────────────
  async function confirmReject() {
    if (!rejectDialog) return;
    const { id: userId } = rejectDialog;
    setActionUserId(userId);
    try {
      await api(`/api/admin/reject/${userId}`, {
        method: "POST",
        headers: { ...authHeaders.current, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason || undefined }),
      });
      setPending((prev) => prev.filter((u) => u.id !== userId));
    } catch { /* ignore */ }
    setActionUserId(null);
    setRejectDialog(null);
    setRejectReason("");
  }

  const count     = pending.length;
  const popoverOpen = Boolean(anchorEl);

  return (
    <>
      {/* ── Bell icon with badge ─────────────────────────────────────────── */}
      <Tooltip title={count > 0 ? `${count} pending teacher approval${count > 1 ? "s" : ""}` : "No pending approvals"}>
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            color: count > 0 ? "warning.main" : "action.disabled",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <Badge
            badgeContent={count}
            color="error"
            max={99}
            invisible={count === 0}
          >
            {count > 0
              ? <NotificationsIcon fontSize="small" />
              : <NotificationsNoneIcon fontSize="small" />}
          </Badge>
        </IconButton>
      </Tooltip>

      {/* ── Popover ──────────────────────────────────────────────────────── */}
      <Popover
        open={popoverOpen}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top",    horizontal: "right" }}
        PaperProps={{
          sx: {
            width: 380,
            maxHeight: 480,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            borderRadius: 2,
            boxShadow: 8,
          },
        }}
      >
        {/* Header */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}
        >
          <HourglassBottomIcon sx={{ color: "warning.main", fontSize: 20 }} />
          <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>
            Pending Approvals
          </Typography>
          {loading && <CircularProgress size={14} />}
          {count > 0 && (
            <Typography variant="caption" color="text.secondary">
              {count} waiting
            </Typography>
          )}
        </Stack>

        {/* Body */}
        <Box sx={{ overflowY: "auto", flexGrow: 1 }}>
          {!loading && count === 0 ? (
            <Stack alignItems="center" justifyContent="center" sx={{ py: 5, px: 2 }} spacing={1}>
              <CheckCircleIcon sx={{ color: "success.main", fontSize: 36 }} />
              <Typography variant="body2" color="text.secondary" textAlign="center">
                All teacher registrations have been reviewed.
              </Typography>
            </Stack>
          ) : (
            pending.map((u, idx) => (
              <Box key={u.id}>
                <Stack sx={{ px: 2, py: 1.5 }} spacing={0.5}>
                  <Typography variant="body2" fontWeight={600}>
                    {u.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {u.email}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Registered {new Date(u.createdAt).toLocaleDateString()}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    <Button
                      variant="contained"
                      color="success"
                      size="small"
                      sx={{ flex: 1, py: 0.5, fontSize: 12 }}
                      startIcon={
                        actionUserId === u.id
                          ? <CircularProgress size={12} color="inherit" />
                          : <CheckCircleIcon fontSize="small" />
                      }
                      disabled={actionUserId !== null}
                      onClick={() => approve(u.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      sx={{ flex: 1, py: 0.5, fontSize: 12 }}
                      startIcon={<CancelIcon fontSize="small" />}
                      disabled={actionUserId !== null}
                      onClick={() => { setRejectDialog({ id: u.id, name: u.name }); setRejectReason(""); }}
                    >
                      Reject
                    </Button>
                  </Stack>
                </Stack>
                {idx < pending.length - 1 && <Divider />}
              </Box>
            ))
          )}
        </Box>
      </Popover>

      {/* ── Reject reason dialog ─────────────────────────────────────────── */}
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
            onClick={confirmReject}
            disabled={actionUserId !== null}
          >
            {actionUserId !== null ? <CircularProgress size={18} color="inherit" /> : "Reject Account"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
