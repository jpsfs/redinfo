import { Button, Chip, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { TransportPlanningLeg, TripStop, TripStopKind, distanceInKm } from '@redinfo/shared';
import { useT } from '../../../i18n/useT';
import { needsWaitReleaseDecision, stopLocationLabel } from '../legFacts';
import { durationLabel, timeLabel } from '../planningTime';

const STOP_KIND_KEY: Record<TripStopKind, string> = {
  [TripStopKind.PICKUP]: 'transportJourney.stopPickup',
  [TripStopKind.DROPOFF]: 'transportJourney.stopDropoff',
  [TripStopKind.WAIT]: 'transportJourney.stopWait',
  [TripStopKind.RETURN_TO_BASE]: 'transportJourney.stopReturnToBase',
  [TripStopKind.DEPART_FROM_BASE]: 'transportJourney.stopDepartFromBase',
};

function distanceLabel(km: number | null): string {
  if (km == null) return '—';
  return `${km.toFixed(1)} km`;
}

/** The straight-line distance from `from` to `to` — `null` whenever either
 * stop lacks a coordinate (a leg with no geocoded address, say), the same
 * honest-gap posture the rest of this table takes: a blank rather than a
 * number that looks precise and isn't. */
function distanceBetweenStops(from: TripStop, to: TripStop): number | null {
  if (from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) return null;
  return distanceInKm({ latitude: from.latitude, longitude: from.longitude }, { latitude: to.latitude, longitude: to.longitude });
}

function byTimeline(a: TripStop, b: TripStop): number {
  const byPlannedAt = new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime();
  return byPlannedAt !== 0 ? byPlannedAt : a.sequence - b.sequence;
}

/**
 * The journey page's stop table (#247 stage 3) — react-admin's own
 * `Datagrid` needs a `ListContext` this single trip's stops don't have, so
 * this is a plain MUI table shaped the same way: one row per stop, in the
 * order the crew actually visits them.
 *
 * One flat list, sorted strictly by `plannedAt` (`sequence` only breaks a
 * tie) — never grouped by kind. A journey with a `DEPART_FROM_BASE` stop or
 * more than one destination chains pickups, dropoffs and other stops
 * together in whatever order the crew actually drives them, and a table
 * that always put every pickup above every dropoff (an earlier version of
 * this component did, grouped into three sections) stopped being a
 * timeline the moment it did that — the base departure that opens the
 * journey would print *after* stops it actually precedes.
 *
 * Distance is the straight-line distance from the previous row's stop to
 * this one (`distanceBetweenStops`) — the first stop always shows a blank,
 * having no predecessor in the journey. It is honest about the gap the same
 * way: a stop missing a coordinate, or a pair too far removed to mean
 * anything, still prints `—` rather than a number that looks precise and
 * isn't.
 */
export const JourneyStopTable = ({
  stops,
  legsById,
  onDecideWaitRelease,
}: {
  stops: TripStop[];
  legsById: Record<string, TransportPlanningLeg>;
  onDecideWaitRelease: (dropoffStop: TripStop) => void;
}) => {
  const t = useT();
  const orderedStops = [...stops].sort(byTimeline);

  return (
    <Table size="small" aria-label={t('transportJourney.stopsTitle')}>
      <TableHead>
        <TableRow>
          <TableCell>{t('transportJourney.stopColumnTime')}</TableCell>
          <TableCell>{t('transportJourney.stopColumnKind')}</TableCell>
          <TableCell>{t('transportJourney.stopColumnPatient')}</TableCell>
          <TableCell>{t('transportJourney.stopColumnDistance')}</TableCell>
          <TableCell>{t('transportJourney.stopColumnDwell')}</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {orderedStops.map((stop, index) => {
          const leg = stop.transportLegId ? legsById[stop.transportLegId] : undefined;
          const locationLabel = stopLocationLabel(stop, leg);
          const showWaitRelease = stop.kind === TripStopKind.DROPOFF && needsWaitReleaseDecision(stop, stops, leg);
          const previousStop = orderedStops[index - 1];
          const distanceKm = previousStop ? distanceBetweenStops(previousStop, stop) : null;
          return (
            <TableRow key={stop.id}>
              <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{timeLabel(stop.plannedAt)}</TableCell>
              <TableCell>
                {t(STOP_KIND_KEY[stop.kind])}
                {locationLabel && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {locationLabel}
                  </Typography>
                )}
              </TableCell>
              <TableCell>{leg?.patientName ?? (leg ? t('transportJourney.patientNameHidden') : '—')}</TableCell>
              <TableCell>{distanceLabel(distanceKm)}</TableCell>
              <TableCell>
                {stop.kind === TripStopKind.WAIT ? (
                  <Tooltip title={t(`transportJourney.dwellDecision.${stop.dwellDecision ?? 'PENDING'}`)}>
                    <Chip
                      size="small"
                      icon={<HourglassEmptyIcon fontSize="small" />}
                      label={stop.dwellMinutes != null ? durationLabel(stop.dwellMinutes) : '—'}
                    />
                  </Tooltip>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell>
                {showWaitRelease && (
                  <Button size="small" onClick={() => onDecideWaitRelease(stop)}>
                    {t('transportJourney.decideWaitRelease')}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
