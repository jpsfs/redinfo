import { useState } from 'react';
import { Title } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  ApproveVolunteerHoursBatchResponse,
  formatMinutes,
  SweepApproveVolunteerHoursResponse,
  VolunteerHoursEntry,
  VolunteerHoursStatus,
} from '@redinfo/shared';
import { apiFetch } from '../api';
import { useT } from '../i18n/useT';
import { useIsMobile } from '../hooks/useIsMobile';
import { useReviewQueue } from './volunteerHoursReview/useReviewQueue';
import { ReviewStatsHeader } from './volunteerHoursReview/ReviewStatsHeader';
import { ReviewFilters } from './volunteerHoursReview/ReviewFilters';
import { ReviewQueueTable } from './volunteerHoursReview/ReviewQueueTable';
import { ReviewQueueCards } from './volunteerHoursReview/ReviewQueueCards';
import { BulkActionBar } from './volunteerHoursReview/BulkActionBar';
import { BulkApproveDialog } from './volunteerHoursReview/BulkApproveDialog';
import { SweepApproveDialog } from './volunteerHoursReview/SweepApproveDialog';
import { AdjustHoursDialog } from './volunteerHoursReview/AdjustHoursDialog';
import { DismissEntryDialog } from './volunteerHoursReview/DismissEntryDialog';
import { ApprovedTab } from './volunteerHoursReview/ApprovedTab';
import { ExportMenu } from './volunteerHoursReview/ExportMenu';

type Tab = 'pending' | 'approved';

/**
 * The coordinator's hours-review screen (#164, redesigned per
 * docs/plans/volunteer-hours-review-redesign.md): server-paginated,
 * filterable by exception type, multi-select approve, a one-shot sweep for
 * routine entries, and a history tab with real recovery (undo an approval,
 * dismiss/restore an entry).
 */
export const VolunteerHoursReviewPage = () => {
  const t = useT();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>('pending');
  const queue = useReviewQueue(VolunteerHoursStatus.PENDING);

  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [adjusting, setAdjusting] = useState<VolunteerHoursEntry | null>(null);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<VolunteerHoursEntry | null>(null);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [batchFailures, setBatchFailures] = useState<string | null>(null);
  const [sweepOpen, setSweepOpen] = useState(false);
  const [sweepSaving, setSweepSaving] = useState(false);
  const [sweepError, setSweepError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; undo?: () => void } | null>(null);

  const withSaving = async (id: string, fn: () => Promise<void>) => {
    setSavingIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // `correctionReason` is present exactly when the value was actually
  // changed (see `AdjustHoursDialog`) — that, not whether `minutes` was
  // passed at all, is what decides whether this is a plain "approve as
  // proposed" (empty body) or a correction.
  const approveEntry = async (id: string, minutes?: number, correctionReason?: string) => {
    await apiFetch(`/volunteer-hours/${id}/approve`, {
      method: 'POST',
      body: correctionReason !== undefined ? { minutes, correctionReason } : {},
    });
  };

  const handleApprove = (entry: VolunteerHoursEntry) => {
    void withSaving(entry.id, async () => {
      try {
        await approveEntry(entry.id);
        await queue.refetch();
        setSnackbar({
          message: t('volunteerHoursReview.approveSuccess'),
          undo: () => void handleUndo(entry.id),
        });
      } catch (e) {
        setSnackbar({ message: e instanceof Error ? e.message : t('volunteerHoursReview.approveFailed') });
      }
    });
  };

  const handleUndo = async (id: string) => {
    try {
      await apiFetch(`/volunteer-hours/${id}/reopen`, { method: 'POST' });
      await queue.refetch();
    } catch {
      // The Approved tab remains the fallback place to reopen it by hand.
    }
  };

  const confirmAdjust = (minutes: number, correctionReason?: string) => {
    if (!adjusting) return;
    const id = adjusting.id;
    void withSaving(id, async () => {
      setAdjustError(null);
      try {
        await approveEntry(id, minutes, correctionReason);
        setAdjusting(null);
        await queue.refetch();
        setSnackbar({ message: t('volunteerHoursReview.approveSuccess'), undo: () => void handleUndo(id) });
      } catch (e) {
        setAdjustError(e instanceof Error ? e.message : t('volunteerHoursReview.approveFailed'));
      }
    });
  };

  const confirmDismiss = (reason: string) => {
    if (!dismissing) return;
    const id = dismissing.id;
    void withSaving(id, async () => {
      setDismissError(null);
      try {
        await apiFetch(`/volunteer-hours/${id}/dismiss`, { method: 'POST', body: { reason } });
        setDismissing(null);
        await queue.refetch();
        setSnackbar({
          message: t('volunteerHoursReview.dismissSuccess'),
          undo: () => void handleRestore(id),
        });
      } catch (e) {
        setDismissError(e instanceof Error ? e.message : t('volunteerHoursReview.dismissFailed'));
      }
    });
  };

  const handleRestore = async (id: string) => {
    try {
      await apiFetch(`/volunteer-hours/${id}/restore`, { method: 'POST' });
      await queue.refetch();
    } catch {
      // No further fallback here — the entry stays dismissed.
    }
  };

  const toggleSelect = (id: string) => {
    queue.setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const rows = queue.data?.data ?? [];
    const allSelected = rows.length > 0 && rows.every((e) => queue.selected.has(e.id));
    queue.setSelected(allSelected ? new Set() : new Set(rows.map((e) => e.id)));
  };

  const selectedEntries = (queue.data?.data ?? []).filter((e) => queue.selected.has(e.id));
  const selectedMinutes = selectedEntries.reduce((total, e) => total + e.proposedMinutes, 0);

  const confirmBulkApprove = async () => {
    setBulkSaving(true);
    setBulkError(null);
    try {
      const result = await apiFetch<ApproveVolunteerHoursBatchResponse>('/volunteer-hours/approve-batch', {
        method: 'POST',
        body: { entries: [...queue.selected].map((id) => ({ id })) },
      });
      setBulkOpen(false);
      queue.setSelected(new Set());
      await queue.refetch();
      if (result.failed.length > 0) {
        setBatchFailures(
          t('volunteerHoursReview.bulkApprovePartialFailure', {
            count: result.failed.length,
            messages: result.failed.map((f) => f.message).join('; '),
          }),
        );
      } else {
        setSnackbar({ message: t('volunteerHoursReview.bulkApproveSuccess', { count: result.approved.length }) });
      }
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : t('volunteerHoursReview.approveFailed'));
    } finally {
      setBulkSaving(false);
    }
  };

  const confirmSweep = async () => {
    setSweepSaving(true);
    setSweepError(null);
    try {
      const result = await apiFetch<SweepApproveVolunteerHoursResponse>('/volunteer-hours/approve-sweep', {
        method: 'POST',
        body: { from: queue.query.from, to: queue.query.to },
      });
      setSweepOpen(false);
      await queue.refetch();
      setSnackbar({
        message: t('volunteerHoursReview.sweepSuccess', {
          count: result.approvedCount,
          minutes: formatMinutes(result.totalMinutes),
        }),
      });
    } catch (e) {
      setSweepError(e instanceof Error ? e.message : t('volunteerHoursReview.sweepFailed'));
    } finally {
      setSweepSaving(false);
    }
  };

  const total = queue.data?.total ?? 0;
  const pageStart = total === 0 ? 0 : (queue.query.page - 1) * queue.query.perPage + 1;
  const pageEnd = Math.min(queue.query.page * queue.query.perPage, total);
  const hasNextPage = pageEnd < total;

  return (
    <Card sx={{ mt: 2 }}>
      <Title title={t('volunteerHoursReview.pageTitle')} />
      <CardContent>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" useFlexGap>
          <Box>
            <Typography variant="h6">{t('volunteerHoursReview.heading')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, maxWidth: 640 }}>
              {t('volunteerHoursReview.subheading')}
            </Typography>
          </Box>
          <ExportMenu />
        </Stack>

        <Tabs value={tab} onChange={(_, value: Tab) => setTab(value)} sx={{ mb: 1 }}>
          <Tab
            value="pending"
            label={t('volunteerHoursReview.tabPending', { count: queue.data?.counts.all ?? 0 })}
          />
          <Tab value="approved" label={t('volunteerHoursReview.tabApproved')} />
        </Tabs>

        {tab === 'approved' ? (
          <ApprovedTab />
        ) : (
          <>
            {queue.data && <ReviewStatsHeader counts={queue.data.counts} />}

            {queue.data && (
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ sm: 'center' }}
                spacing={1.5}
              >
                <ReviewFilters filters={queue.query} counts={queue.data.counts} onChange={queue.setFilters} />
                <Button
                  variant="outlined"
                  disabled={queue.data.counts.sweepable === 0}
                  onClick={() => setSweepOpen(true)}
                >
                  {t('volunteerHoursReview.sweepButton', { count: queue.data.counts.sweepable })}
                </Button>
              </Stack>
            )}

            {queue.loading && !queue.data && <CircularProgress size={24} sx={{ mt: 2 }} />}
            {queue.error && (
              <Alert
                severity="warning"
                sx={{ mt: 2 }}
                action={
                  <Button color="inherit" size="small" onClick={() => void queue.refetch()}>
                    {t('volunteerHoursReview.retryButton')}
                  </Button>
                }
              >
                {queue.error}
              </Alert>
            )}
            {batchFailures && (
              <Alert severity="warning" sx={{ mt: 2 }} onClose={() => setBatchFailures(null)}>
                {batchFailures}
              </Alert>
            )}

            {queue.data && queue.data.data.length === 0 && total === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                {queue.query.flag || queue.query.source || queue.query.search
                  ? t('volunteerHoursReview.noneAfterFilter')
                  : t('volunteerHoursReview.noneToReview')}
              </Typography>
            )}
            {queue.data && total === 0 && (queue.query.flag || queue.query.source || queue.query.search) && (
              <Button size="small" onClick={queue.clearFilters} sx={{ mt: 1 }}>
                {t('volunteerHoursReview.clearFiltersButton')}
              </Button>
            )}

            {queue.data && queue.data.data.length > 0 && (
              <Box sx={{ mt: 1 }}>
                {isMobile ? (
                  <ReviewQueueCards
                    entries={queue.data.data}
                    selected={queue.selected}
                    savingIds={savingIds}
                    onToggle={toggleSelect}
                    onApprove={handleApprove}
                    onAdjust={(entry) => setAdjusting(entry)}
                  />
                ) : (
                  <ReviewQueueTable
                    entries={queue.data.data}
                    selected={queue.selected}
                    savingIds={savingIds}
                    onToggle={toggleSelect}
                    onToggleAll={toggleSelectAll}
                    onApprove={handleApprove}
                    onAdjust={(entry) => setAdjusting(entry)}
                    onDismiss={(entry) => setDismissing(entry)}
                  />
                )}

                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ mt: 2 }}
                  flexWrap="wrap"
                  useFlexGap
                >
                  <Typography variant="caption" color="text.secondary">
                    {t('volunteerHoursReview.paginationRange', { from: pageStart, to: pageEnd, total })}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {!isMobile && (
                      <TextField
                        select
                        size="small"
                        label={t('volunteerHoursReview.perPageLabel')}
                        value={queue.query.perPage}
                        onChange={(e) => queue.setPerPage(Number(e.target.value))}
                        sx={{ width: 100 }}
                      >
                        {[25, 50, 100].map((n) => (
                          <MenuItem key={n} value={n}>
                            {n}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                    <Button
                      size="small"
                      disabled={queue.query.page <= 1}
                      onClick={() => queue.setPage(queue.query.page - 1)}
                    >
                      {t('volunteerHoursReview.prevPage')}
                    </Button>
                    <Button size="small" disabled={!hasNextPage} onClick={() => queue.setPage(queue.query.page + 1)}>
                      {t('volunteerHoursReview.nextPage')}
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            )}

            <BulkActionBar
              count={queue.selected.size}
              totalMinutes={selectedMinutes}
              onApprove={() => setBulkOpen(true)}
              onClear={() => queue.setSelected(new Set())}
            />
          </>
        )}
      </CardContent>

      <AdjustHoursDialog
        entry={adjusting}
        saving={adjusting ? savingIds.has(adjusting.id) : false}
        error={adjustError}
        onConfirm={confirmAdjust}
        onClose={() => {
          setAdjusting(null);
          setAdjustError(null);
        }}
      />

      <DismissEntryDialog
        entry={dismissing}
        saving={dismissing ? savingIds.has(dismissing.id) : false}
        error={dismissError}
        onConfirm={confirmDismiss}
        onClose={() => {
          setDismissing(null);
          setDismissError(null);
        }}
      />

      <BulkApproveDialog
        open={bulkOpen}
        entries={selectedEntries}
        saving={bulkSaving}
        error={bulkError}
        onConfirm={() => void confirmBulkApprove()}
        onClose={() => setBulkOpen(false)}
      />

      <SweepApproveDialog
        open={sweepOpen}
        count={queue.data?.counts.sweepable ?? 0}
        totalMinutes={queue.data?.counts.totalProposedMinutes ?? 0}
        saving={sweepSaving}
        error={sweepError}
        onConfirm={() => void confirmSweep()}
        onClose={() => setSweepOpen(false)}
      />

      <Snackbar
        open={snackbar !== null}
        autoHideDuration={6000}
        onClose={() => setSnackbar(null)}
        message={snackbar?.message}
        action={
          snackbar?.undo && (
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                snackbar.undo!();
                setSnackbar(null);
              }}
            >
              {t('volunteerHoursReview.undoButton')}
            </Button>
          )
        }
      />
    </Card>
  );
};
