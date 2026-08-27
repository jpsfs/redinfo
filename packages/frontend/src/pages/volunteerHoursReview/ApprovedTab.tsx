import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { formatMinutes, VolunteerHoursEntry, VolunteerHoursStatus } from '@redinfo/shared';
import { apiFetch } from '../../api';
import { useT } from '../../i18n/useT';
import { activityTypeLabel } from '../../i18n/labels';
import { formatDate, addIsoDays, toIsoDate } from '../../utils/dates';
import { useReviewQueue } from './useReviewQueue';
import { ReviewFilters } from './ReviewFilters';
import { DismissEntryDialog } from './DismissEntryDialog';

function defaultRange() {
  const to = toIsoDate(new Date());
  return { from: addIsoDays(to, -30), to };
}

/**
 * History tab: same filters as Pending, no checkboxes, `status=APPROVED`,
 * defaulting to the last 30 days. Row actions are Reabrir and Descartar —
 * `restore` is wired but reachable only from the dismiss snackbar's undo.
 */
export const ApprovedTab = () => {
  const t = useT();
  const range = defaultRange();
  const queue = useReviewQueue(VolunteerHoursStatus.APPROVED, { from: range.from, to: range.to });
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<VolunteerHoursEntry | null>(null);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [dismissSaving, setDismissSaving] = useState(false);

  const reopen = async (entry: VolunteerHoursEntry) => {
    setActingId(entry.id);
    setActionError(null);
    try {
      await apiFetch(`/volunteer-hours/${entry.id}/reopen`, { method: 'POST' });
      await queue.refetch();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('volunteerHoursReview.reopenFailed'));
    } finally {
      setActingId(null);
    }
  };

  const confirmDismiss = async (reason: string) => {
    if (!dismissing) return;
    setDismissSaving(true);
    setDismissError(null);
    try {
      await apiFetch(`/volunteer-hours/${dismissing.id}/dismiss`, { method: 'POST', body: { reason } });
      setDismissing(null);
      await queue.refetch();
    } catch (e) {
      setDismissError(e instanceof Error ? e.message : t('volunteerHoursReview.dismissFailed'));
    } finally {
      setDismissSaving(false);
    }
  };

  return (
    <Box sx={{ mt: 1 }}>
      {queue.data && <ReviewFilters filters={queue.query} counts={queue.data.counts} onChange={queue.setFilters} />}
      {actionError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      )}
      {queue.loading && !queue.data && <CircularProgress size={24} />}
      {queue.error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {queue.error}
        </Alert>
      )}
      {queue.data && queue.data.data.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('volunteerHoursReview.noneAfterFilter')}
        </Typography>
      )}
      {queue.data && queue.data.data.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('volunteerHoursReview.colVolunteer')}</TableCell>
              <TableCell>{t('volunteerHoursReview.colActivity')}</TableCell>
              <TableCell>{t('volunteerHoursReview.colDate')}</TableCell>
              <TableCell>{t('volunteerHoursReview.colCredited')}</TableCell>
              <TableCell>{t('volunteerHoursReview.colApprovedBy')}</TableCell>
              <TableCell>{t('volunteerHoursReview.colWhen')}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {queue.data.data.map((entry) => (
              <TableRow key={entry.id} sx={{ opacity: actingId === entry.id ? 0.6 : 1 }}>
                <TableCell>{entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : entry.userId}</TableCell>
                <TableCell>{activityTypeLabel(t, entry.activityType)}</TableCell>
                <TableCell>{formatDate(t, entry.date)}</TableCell>
                <TableCell>
                  <Typography variant="body2">{formatMinutes(entry.minutes)}</Typography>
                  {entry.correctionReason && (
                    <Typography variant="caption" color="text.secondary">
                      {entry.correctionReason}
                    </Typography>
                  )}
                  {entry.autoApproved && (
                    <Chip size="small" variant="outlined" label={t('volunteerHoursReview.autoApprovedChip')} sx={{ ml: 1 }} />
                  )}
                </TableCell>
                <TableCell>
                  {entry.approvedBy ? `${entry.approvedBy.firstName} ${entry.approvedBy.lastName}` : '—'}
                </TableCell>
                <TableCell>
                  {entry.approvedAt ? formatDate(t, entry.approvedAt.slice(0, 10)) : '—'}
                  {entry.reopenedAt && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {t('volunteerHoursReview.reopenedNotice', { date: formatDate(t, entry.reopenedAt.slice(0, 10)) })}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Button size="small" disabled={actingId === entry.id} onClick={() => reopen(entry)}>
                      {t('volunteerHoursReview.reopenButton')}
                    </Button>
                    <Button size="small" color="error" disabled={actingId === entry.id} onClick={() => setDismissing(entry)}>
                      {t('volunteerHoursReview.dismissButton')}
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <DismissEntryDialog
        entry={dismissing}
        saving={dismissSaving}
        error={dismissError}
        onConfirm={confirmDismiss}
        onClose={() => setDismissing(null)}
      />
    </Box>
  );
};
