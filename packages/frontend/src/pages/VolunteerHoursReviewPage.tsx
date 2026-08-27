import { useCallback, useEffect, useState } from 'react';
import { Title } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
} from '@mui/material';
import {
  ApproveVolunteerHoursRequest,
  formatMinutes,
  VolunteerHoursEntry,
} from '@redinfo/shared';
import { apiDownload, apiFetch } from '../api';
import { useT } from '../i18n/useT';
import { activityTypeLabel } from '../i18n/labels';
import { formatDate } from '../utils/dates';

/** First and last day of the current calendar month, as `YYYY-MM-DD`. */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * The coordinator's half of #164: entries auto-generated with an exception
 * flag, and everything logged by hand — clean, unflagged entries never reach
 * here at all, since they auto-approve after the grace period.
 */
export const VolunteerHoursReviewPage = () => {
  const t = useT();
  const [pending, setPending] = useState<VolunteerHoursEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reviewing, setReviewing] = useState<VolunteerHoursEntry | null>(null);
  const [minutesInput, setMinutesInput] = useState('0');
  const [reasonInput, setReasonInput] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [range, setRange] = useState(currentMonthRange());
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPending(await apiFetch<VolunteerHoursEntry[]>('/volunteer-hours/pending'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('volunteerHoursReview.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReview = (entry: VolunteerHoursEntry) => {
    setReviewing(entry);
    setMinutesInput(String(entry.proposedMinutes));
    setReasonInput('');
    setDialogError(null);
  };

  const handleApprove = async () => {
    if (!reviewing) return;
    const minutes = Number(minutesInput);
    const corrected = minutes !== reviewing.proposedMinutes;
    if (corrected && !reasonInput.trim()) {
      setDialogError(t('volunteerHoursReview.reviewDialogReasonRequired'));
      return;
    }
    setSaving(true);
    try {
      const body: ApproveVolunteerHoursRequest = corrected
        ? { minutes, correctionReason: reasonInput.trim() }
        : {};
      await apiFetch(`/volunteer-hours/${reviewing.id}/approve`, { method: 'POST', body });
      setReviewing(null);
      await load();
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : t('volunteerHoursReview.approveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await apiDownload(
        `/volunteer-hours/summary/csv?from=${range.from}&to=${range.to}`,
        `volunteer-hours-${range.from}-to-${range.to}.csv`,
      );
    } catch (e) {
      setExportError(e instanceof Error ? e.message : t('volunteerHoursReview.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card sx={{ mt: 2 }}>
      <Title title={t('volunteerHoursReview.pageTitle')} />
      <CardContent>
        <Typography variant="h6">{t('volunteerHoursReview.heading')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 640 }}>
          {t('volunteerHoursReview.subheading')}
        </Typography>

        {loading && <CircularProgress size={24} />}
        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {pending && pending.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('volunteerHoursReview.noneToReview')}
          </Typography>
        )}

        {pending && pending.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('volunteerHoursReview.columnPerson')}</TableCell>
                <TableCell>{t('volunteerHoursReview.columnActivity')}</TableCell>
                <TableCell>{t('volunteerHoursReview.columnDate')}</TableCell>
                <TableCell>{t('volunteerHoursReview.columnProposed')}</TableCell>
                <TableCell>{t('volunteerHoursReview.columnFlags')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {pending.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : entry.userId}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {activityTypeLabel(t, entry.activityType)}
                      {entry.source === 'MANUAL' && (
                        <Chip size="small" variant="outlined" label={t('myHours.manualBadge')} />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>{formatDate(t, entry.date)}</TableCell>
                  <TableCell>{formatMinutes(entry.proposedMinutes)}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {entry.flags.includes('RAN_OVER') && (
                        <Chip size="small" color="info" label={t('myHours.flagRanOver')} />
                      )}
                      {entry.flags.includes('POSSIBLY_LEFT_EARLY') && (
                        <Chip size="small" color="warning" label={t('myHours.flagPossiblyLeftEarly')} />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" onClick={() => openReview(entry)}>
                      {t('volunteerHoursReview.reviewButton')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Box sx={{ mt: 4 }}>
          <Typography variant="subtitle2">{t('volunteerHoursReview.exportHeading')}</Typography>
          {exportError && (
            <Alert severity="warning" sx={{ my: 1 }}>
              {exportError}
            </Alert>
          )}
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
            <TextField
              type="date"
              size="small"
              label={t('volunteerHoursReview.exportFrom')}
              value={range.from}
              onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              type="date"
              size="small"
              label={t('volunteerHoursReview.exportTo')}
              value={range.to}
              onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <Button variant="outlined" onClick={handleExport} disabled={exporting}>
              {t('volunteerHoursReview.exportButton')}
            </Button>
          </Stack>
        </Box>
      </CardContent>

      <Dialog open={reviewing !== null} onClose={() => setReviewing(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t('volunteerHoursReview.reviewDialogTitle')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            <TextField
              type="number"
              label={t('volunteerHoursReview.reviewDialogMinutes')}
              value={minutesInput}
              onChange={(e) => setMinutesInput(e.target.value)}
              inputProps={{ min: 0 }}
            />
            <TextField
              label={t('volunteerHoursReview.reviewDialogReason')}
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewing(null)} disabled={saving}>
            {t('volunteerHoursReview.reviewDialogCancel')}
          </Button>
          <Button onClick={handleApprove} variant="contained" disabled={saving}>
            {t('volunteerHoursReview.reviewDialogApprove')}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};
