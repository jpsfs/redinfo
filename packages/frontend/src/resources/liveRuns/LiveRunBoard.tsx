import { ReactNode, useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import { LiveRunBoardEntry } from '@redinfo/shared';
import { apiFetch } from '../../api';
import { destinationLabel, genderLabel, liveScreenLabel, t } from '../../i18n/labels';
import { timeOfDay } from '../eventReports/reportDraft';
import { screenForState } from './liveRun';

/** How often the board re-reads. Often enough to be live, rarely enough to be cheap. */
export const BOARD_REFRESH_MS = 20_000;

/**
 * The emergencies being run right now, for a coordinator.
 *
 * Oversight only, and read-only by design: editing a phone's local truth from a
 * desk would break the revision contract the whole sync rests on. There is no
 * link into a run's screens for the same reason.
 *
 * The projection behind this omits the identity column entirely, so there is no
 * victim name to render even by accident. What a coordinator needs is the shape
 * of the call and how long it has been running.
 */
export interface LiveRunBoardProps {
  /**
   * Rendered instead of the card when there is nothing to show — no open runs,
   * or the reader lacks `VIEW_LIVE_RUNS`. Left `undefined` on the Dashboard,
   * where "nothing to show" means "render nothing at all"; `LiveRunsPage` is
   * the one screen that needs a standalone screen to not go blank.
   */
  emptyState?: ReactNode;
}

export const LiveRunBoard = ({ emptyState }: LiveRunBoardProps = {}) => {
  const [runs, setRuns] = useState<LiveRunBoardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () =>
      apiFetch<LiveRunBoardEntry[]>('/live-runs')
        .then((data) => {
          if (!cancelled) {
            setRuns(data);
            setError(null);
          }
        })
        .catch((cause) => {
          // A coordinator without `VIEW_LIVE_RUNS` simply does not see the card,
          // rather than seeing a permission error on their dashboard.
          if (!cancelled) setError(cause instanceof Error ? cause.message : 'unavailable');
        });

    void load();
    const timer = setInterval(() => void load(), BOARD_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Still loading — unchanged for the Dashboard, which renders nothing until
  // there is something to show.
  if (runs === null && !error) return null;
  // Nothing to show: no runs, or the reader lacks `VIEW_LIVE_RUNS` (the fetch
  // above swallows that as `error`, on purpose — see the comment there).
  if (error || runs === null || runs.length === 0) return <>{emptyState ?? null}</>;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <BoltIcon color="primary" />
          <Typography sx={{ fontWeight: 800, flex: 1 }}>{t('live.openRuns')}</Typography>
          <Chip size="small" label={runs.length} color="primary" />
        </Stack>

        <Stack divider={<Divider />} spacing={0}>
          {runs.map((run) => (
            <Box key={run.id} sx={{ py: 1.25 }}>
              <Stack direction="row" alignItems="baseline" spacing={1}>
                <Typography
                  sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
                >
                  {run.externalReference?.trim() || '—'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                  {run.locality?.name ?? ''}
                </Typography>
                <Chip
                  size="small"
                  label={liveScreenLabel(screenForState(run.state))}
                  sx={{ fontWeight: 700 }}
                />
              </Stack>

              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {run.chiefComplaint ?? ''}
              </Typography>

              <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary">
                  {t('time.activationAt')}: {run.activationAt ? timeOfDay(run.activationAt) : '—'}
                </Typography>
                {run.victimGender && (
                  <Typography variant="caption" color="text.secondary">
                    {genderLabel(run.victimGender)}
                    {run.victimAge !== null && run.victimAge !== undefined
                      ? ` · ${run.victimAge}`
                      : ''}
                  </Typography>
                )}
                {run.destinationKind && (
                  <Typography variant="caption" color="text.secondary">
                    {run.destinationHospital?.name ?? destinationLabel(run.destinationKind)}
                  </Typography>
                )}
                {run.crew.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {run.crew
                      .map((member) =>
                        member.user ? `${member.user.firstName} ${member.user.lastName}` : '',
                      )
                      .filter(Boolean)
                      .join(', ')}
                  </Typography>
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
};
