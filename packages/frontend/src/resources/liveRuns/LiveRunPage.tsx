import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useNotify } from 'react-admin';
import {
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  DelegationSettings,
  EventReportType,
  LiveRunCloseResponse,
  LiveRunState,
  LiveRunSupportActionKind,
  Locality,
  OCCURRENCE_TIME_FIELDS,
  OccurrenceTimeField,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { liveScreenLabel, occurrenceTimeLabel, t } from '../../i18n/labels';
import { composeInstant, timeOfDay, todayIso } from '../eventReports/reportDraft';
import { useReportLookups } from '../eventReports/useReportLookups';
import { attachPhotosToReport, deleteRun, saveRun } from './liveRunDb';
import { isLiveScreen, screenForRun, writeCurrentRunId } from './liveRun';
import { useLiveRun } from './useLiveRun';
import { useLiveRunSync } from './useLiveRunSync';
import { usePhotoQueue } from './usePhotoQueue';
import { useDictation } from './useDictation';
import { useWakeLock } from './useWakeLock';
import { mapsUrl, telUrl } from './mapsLink';
import { LiveTopBar } from './LiveTopBar';
import { LiveBottomBar } from './LiveBottomBar';
import {
  AssessmentScreen,
  ClosingScreen,
  EnRouteScreen,
  IntakeScreen,
  LiveScreenProps,
  SceneScreen,
  TransportScreen,
} from './LiveScreens';

/**
 * The live run's shell.
 *
 * The `EventReportEditor` analogue minus the second layout — live mode owns the
 * whole viewport, and the bottom bar has to be the only thing in thumb reach, so
 * react-admin's `Layout` (whose hamburger menu would sit exactly there) is not
 * used at all.
 *
 * **The screen is in the URL, not in component state.** This is an Android
 * device, where the hardware back button is the most-pressed control on the
 * phone: with the screen in the path, back walks screens for free and a mid-run
 * reload lands where the crew was.
 */
export const LiveRunPage = () => {
  const { runId = '', screen } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();

  const form = useLiveRun({ runId });
  const [reportId, setReportId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [locality, setLocality] = useState<Locality | null>(null);
  const [settings, setSettings] = useState<DelegationSettings | null>(null);

  const photos = usePhotoQueue({ runId, reportId });
  const dictation = useDictation();
  const sync = useLiveRunSync({ onMerged: form.replace });

  // The screen stays awake for the length of an open run and no longer: a phone
  // left on the closing screen in a pocket should be allowed to sleep.
  useWakeLock(form.run.state !== LiveRunState.CLOSED);

  const lookups = useReportLookups(
    useMemo(
      () => ({
        localityId: form.run.localityId ?? '',
        type: EventReportType.EMERGENCY,
        startedAt: form.run.startedAt,
      }),
      [form.run.localityId, form.run.startedAt],
    ),
  );

  /** The delegation's own configuration — the CODU Dados number to dial. */
  useEffect(() => {
    let cancelled = false;
    void apiFetch<DelegationSettings>('/live-runs/settings')
      .then((value) => {
        if (!cancelled) setSettings(value);
      })
      // A missing number means the menu item is absent, not that the run breaks.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /** The locality the run points at, resolved for display. */
  useEffect(() => {
    if (lookups.locality) setLocality(lookups.locality);
  }, [lookups.locality]);

  /** `/live/:runId` with no screen, or a screen nobody knows, lands where the run is. */
  useEffect(() => {
    if (!form.ready) return;
    if (!isLiveScreen(screen)) {
      navigate(`/live/${runId}/${screenForRun(form.run)}`, { replace: true });
    }
  }, [form.ready, form.run, navigate, runId, screen]);

  const address = form.run.identity?.occurrenceAddress ?? null;
  const navigateHref = useMemo(
    () =>
      mapsUrl({
        address,
        locality: locality?.name ?? null,
        municipality: locality?.municipality?.name ?? null,
      }),
    [address, locality],
  );

  /**
   * Stamps, and moves the run to its next screen.
   *
   * The order matters on the intake screen, where this fires alongside an anchor
   * the browser is about to follow: the stamp is written first and not awaited
   * behind the navigation, so a crew that hands off to Maps and never comes back
   * still has its activation time.
   */
  const stamp = useCallback(() => {
    form.stamp();
  }, [form]);

  /** The run's own state decides the screen, so the URL follows the document. */
  useEffect(() => {
    if (!form.ready || !isLiveScreen(screen)) return;
    // The assessment screen is reached deliberately and is not part of the walk,
    // so it is never navigated away from by a state change.
    if (screen === 'assessment') return;
    const expected = screenForRun(form.run);
    if (expected !== screen) navigate(`/live/${runId}/${expected}`);
    // Only on a state change: this must not fight the crew tapping back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.run.state]);

  const close = useCallback(async () => {
    setClosing(true);
    try {
      const response = await apiFetch<LiveRunCloseResponse>(`/live-runs/${runId}/close`, {
        method: 'POST',
      });

      form.replace({ ...form.run, ...response.run });
      setReportId(response.report.id);
      await saveRun(form.run, { reportId: response.report.id });
      await attachPhotosToReport(runId, response.report.id);
      // The run is finished; the device stops offering to resume it.
      writeCurrentRunId(null);

      notify(t('live.closedIntoDraft'), { type: 'success' });
      navigate(`/event-reports/${response.report.id}`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t('sync.failed'), { type: 'error' });
    } finally {
      setClosing(false);
    }
  }, [form, navigate, notify, runId]);

  const abandon = useCallback(async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('live.abandonConfirm'))) return;
    await deleteRun(runId);
    writeCurrentRunId(null);
    navigate('/live', { replace: true });
  }, [navigate, runId]);

  if (!form.ready) {
    return (
      <Box sx={{ p: 4 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }} color="text.secondary">
          {t('hint.loading')}
        </Typography>
      </Box>
    );
  }

  const screenProps: LiveScreenProps = {
    form,
    lookups,
    photos,
    dictation,
    locality,
    onPickLocality: (picked) => {
      setLocality(picked);
      form.patch({ localityId: picked.id });
    },
    onOpenAssessment: () => navigate(`/live/${runId}/assessment`),
    onRefusedFiles: (messages) =>
      messages.forEach((message) => notify(message, { type: 'warning' })),
  };

  const current = isLiveScreen(screen) ? screen : 'intake';
  const stampedAvailable = Boolean(form.run.availableAt);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <LiveTopBar
        run={form.run}
        sync={sync.state}
        coduDadosHref={telUrl(settings?.coduDadosPhone)}
        onCoduDados={() => form.recordSupportAction(LiveRunSupportActionKind.CODU_DADOS)}
        onCorrectTimes={() => setCorrecting(true)}
        onAbandon={() => void abandon()}
      />

      <Container maxWidth="sm" sx={{ pt: 2, pb: 'calc(140px + env(safe-area-inset-bottom))' }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>
          {liveScreenLabel(current)}
        </Typography>

        {current === 'intake' && <IntakeScreen {...screenProps} />}
        {current === 'enroute' && <EnRouteScreen {...screenProps} />}
        {current === 'scene' && <SceneScreen {...screenProps} />}
        {current === 'assessment' && <AssessmentScreen {...screenProps} />}
        {current === 'transport' && <TransportScreen {...screenProps} />}
        {current === 'closing' && <ClosingScreen {...screenProps} />}
      </Container>

      <LiveBottomBar
        run={form.run}
        onStamp={stamp}
        onCorrect={() => setCorrecting(true)}
        navigateHref={current === 'intake' || current === 'enroute' ? navigateHref : null}
        onFinish={current === 'closing' && stampedAvailable ? () => void close() : undefined}
        finishing={closing}
        blockedReason={
          current === 'closing' && form.blockers.length > 0 ? t('live.closeBlocked') : null
        }
      />

      <CorrectTimesDialog
        open={correcting}
        run={form.run}
        onClose={() => setCorrecting(false)}
        onCorrect={form.correct}
      />
    </Box>
  );
};

/**
 * The correction sheet.
 *
 * Offered because the alternative is worse: a crew that tapped a stamp early
 * writes the real time into the narrative instead, where nothing can read it.
 * Times are typed as wall-clock on the run's own day, through the same
 * `composeInstant` the report form uses — so a run that crossed midnight
 * corrects to the right day rather than to twenty-two hours earlier.
 */
const CorrectTimesDialog = ({
  open,
  run,
  onClose,
  onCorrect,
}: {
  open: boolean;
  run: { startedAt: string } & Partial<Record<OccurrenceTimeField, string | null>>;
  onClose: () => void;
  onCorrect: (field: OccurrenceTimeField, instant: string | null) => void;
}) => {
  const day = run.startedAt ? todayIso(new Date(run.startedAt)) : todayIso();

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 800 }}>{t('live.correctTimes')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {OCCURRENCE_TIME_FIELDS.map((field) => (
            <TextField
              key={field}
              fullWidth
              type="time"
              label={occurrenceTimeLabel(field)}
              value={timeOfDay(run[field])}
              onChange={(event) =>
                onCorrect(
                  field,
                  event.target.value
                    ? composeInstant(day, event.target.value, { notBefore: run.startedAt })
                    : null,
                )
              }
              inputProps={{ 'aria-label': occurrenceTimeLabel(field) }}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ minHeight: 48, fontWeight: 700 }}>
          {t('action.cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
