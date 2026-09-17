import { Button, Chip, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { TransportPlanningLeg, TripStop, TripStopKind } from '@redinfo/shared';
import { useT } from '../../../i18n/useT';
import { legFacilityName, needsWaitReleaseDecision } from '../legFacts';
import { durationLabel, timeLabel } from '../planningTime';

const STOP_KIND_KEY: Record<TripStopKind, string> = {
  [TripStopKind.PICKUP]: 'transportJourney.stopPickup',
  [TripStopKind.DROPOFF]: 'transportJourney.stopDropoff',
  [TripStopKind.WAIT]: 'transportJourney.stopWait',
  [TripStopKind.RETURN_TO_BASE]: 'transportJourney.stopReturnToBase',
};

function distanceLabel(meters: number | null): string {
  if (meters == null) return '—';
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * The journey page's stop table (#247 stage 3) — react-admin's own
 * `Datagrid` needs a `ListContext` this single trip's stops don't have, so
 * this is a plain MUI table shaped the same way: one row per stop, in the
 * order the crew actually visits them.
 *
 * Distance is the leg's own routed pickup→dropoff distance
 * (`travelDistanceMeters`, #247 stage 3), not a point-to-point figure
 * between arbitrary consecutive stops — that needs the route geometry
 * stage 4 builds. It is honest about that gap: a `WAIT`/`RETURN_TO_BASE`
 * row, or a stop whose leg couldn't be routed, shows a blank rather than a
 * number that looks precise and isn't.
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
  const ordered = [...stops].sort((a, b) => new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime());

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
        {ordered.map((stop) => {
          const leg = stop.transportLegId ? legsById[stop.transportLegId] : undefined;
          const facilityName = leg ? legFacilityName(leg) : null;
          const showWaitRelease = stop.kind === TripStopKind.DROPOFF && needsWaitReleaseDecision(stop, stops, leg);
          return (
            <TableRow key={stop.id}>
              <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{timeLabel(stop.plannedAt)}</TableCell>
              <TableCell>
                {t(STOP_KIND_KEY[stop.kind])}
                {facilityName && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {facilityName}
                  </Typography>
                )}
              </TableCell>
              <TableCell>{leg?.patientName ?? (leg ? t('transportJourney.patientNameHidden') : '—')}</TableCell>
              <TableCell>{stop.kind === TripStopKind.PICKUP || stop.kind === TripStopKind.DROPOFF ? distanceLabel(leg?.travelDistanceMeters ?? null) : '—'}</TableCell>
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
