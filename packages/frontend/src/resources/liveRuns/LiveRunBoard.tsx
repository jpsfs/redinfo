import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  ButtonBase,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { LiveRunBoardEntry } from '@redinfo/shared';
import { apiFetch } from '../../api';
import { destinationLabel, genderLabel, liveScreenLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { timeOfDay } from '../eventReports/reportDraft';
import { readCurrentRunId, screenForState } from './liveRun';

/** How often the board re-reads. Often enough to be live, rarely enough to be cheap. */
export const BOARD_REFRESH_MS = 20_000;

/**
 * The emergencies being run right now, for a coordinator.
 *
 * Oversight only, and read-only by design: editing a phone's local truth from a
 * desk would break the revision contract the whole sync rests on, so there is
 * no link into *another* crew's run. The one exception is the row for the run
 * this very device already has open (`readCurrentRunId`) — that is the same
 * device jumping back into its own call, not a desk reaching into someone
 * else's, so it is wired straight to `/live/:id` like the resume tile
 * elsewhere.
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
  const t = useT();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<LiveRunBoardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read once per render, synchronously, same as `LiveRunEntryCard` — this is
  // the one row on the board this device is allowed to open.
  const myRunId = readCurrentRunId();

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
          {runs.map((run) => {
            const isMine = run.id === myRunId;

            const body = (
              <>
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
                    label={liveScreenLabel(t, screenForState(run.state))}
                    sx={{ fontWeight: 700 }}
                  />
                  {isMine && <ChevronRightIcon color="action" fontSize="small" />}
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
                      {genderLabel(t, run.victimGender)}
                      {run.victimAge !== null && run.victimAge !== undefined
                        ? ` · ${run.victimAge}`
                        : ''}
                    </Typography>
                  )}
                  {run.destinationKind && (
                    <Typography variant="caption" color="text.secondary">
                      {run.destinationFacility?.name ?? destinationLabel(t, run.destinationKind)}
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

                {isMine && (
                  <Typography variant="caption" color="primary.main" sx={{ display: 'block', mt: 0.5, fontWeight: 700 }}>
                    {t('live.boardResume')}
                  </Typography>
                )}
              </>
            );

            return isMine ? (
              <ButtonBase
                key={run.id}
                onClick={() => navigate(`/live/${run.id}`)}
                sx={{ display: 'block', width: '100%', py: 1.25, textAlign: 'left', borderRadius: 1 }}
              >
                {body}
              </ButtonBase>
            ) : (
              <Box key={run.id} sx={{ py: 1.25 }}>
                {body}
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
};
