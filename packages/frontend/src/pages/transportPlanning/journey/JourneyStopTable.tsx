import { Fragment } from 'react';
import { Button, Chip, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { TransportPlanningLeg, TripStop, TripStopKind } from '@redinfo/shared';
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

const COLUMN_COUNT = 6;

function distanceLabel(meters: number | null): string {
  if (meters == null) return '—';
  return `${(meters / 1000).toFixed(1)} km`;
}

function byPlannedAt(a: TripStop, b: TripStop): number {
  return new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime();
}

/**
 * The journey page's stop table (#247 stage 3) — react-admin's own
 * `Datagrid` needs a `ListContext` this single trip's stops don't have, so
 * this is a plain MUI table shaped the same way: one row per stop, in the
 * order the crew actually visits them.
 *
 * Grouped into pickups / dropoffs / other stops, the same three-way split
 * `JourneyInspector`'s side panel uses — a flat chronological list reads as
 * one undifferentiated wall of rows once a journey picks up several people
 * along the way and drops them at more than one facility (a single run can
 * legitimately serve two destinations, not just share one), while grouping
 * answers the two questions a crew sheet actually gets read for: "who do we
 * still need to collect" and "who goes where".
 *
 * Distance is the leg's own routed pickup→dropoff distance
 * (`travelDistanceMeters`, #247 stage 3), not a point-to-point figure
 * between arbitrary consecutive stops — that needs the route geometry
 * stage 4 builds. It is honest about that gap: a `WAIT`/`RETURN_TO_BASE`/
 * `DEPART_FROM_BASE` row, or a stop whose leg couldn't be routed, shows a
 * blank rather than a number that looks precise and isn't. It is shown only
 * on the dropoff row — the same one distance printed on both the pickup and
 * the dropoff row of a two-stop leg read as two different figures that
 * happened to agree, when it was ever only one number describing the leg as
 * a whole; the dropoff is where that leg's own journey completes.
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
  const pickupStops = stops.filter((stop) => stop.kind === TripStopKind.PICKUP).sort(byPlannedAt);
  const dropoffStops = stops.filter((stop) => stop.kind === TripStopKind.DROPOFF).sort(byPlannedAt);
  const otherStops = stops
    .filter((stop) => stop.kind !== TripStopKind.PICKUP && stop.kind !== TripStopKind.DROPOFF)
    .sort(byPlannedAt);

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
        {pickupStops.length > 0 && (
          <StopGroupRows title={t('transportJourney.stopsPickupTitle')} stops={pickupStops} allStops={stops} legsById={legsById} showDistance={false} onDecideWaitRelease={onDecideWaitRelease} />
        )}
        {dropoffStops.length > 0 && (
          <StopGroupRows title={t('transportJourney.stopsDropoffTitle')} stops={dropoffStops} allStops={stops} legsById={legsById} showDistance onDecideWaitRelease={onDecideWaitRelease} />
        )}
        {otherStops.length > 0 && (
          <StopGroupRows title={t('transportJourney.stopsOtherTitle')} stops={otherStops} allStops={stops} legsById={legsById} showDistance={false} onDecideWaitRelease={onDecideWaitRelease} />
        )}
      </TableBody>
    </Table>
  );
};

/** One grouped section of the table — a header row spanning every column,
 * then one row per stop in that group. */
function StopGroupRows({
  title,
  stops,
  allStops,
  legsById,
  showDistance,
  onDecideWaitRelease,
}: {
  title: string;
  stops: TripStop[];
  /** The journey's whole stop list, unfiltered — `needsWaitReleaseDecision`
   * looks for a matching `WAIT` stop, which never sits in this group's own
   * `stops` (a pickup/dropoff group holds only that one kind). */
  allStops: TripStop[];
  legsById: Record<string, TransportPlanningLeg>;
  /** Only the dropoff group shows the leg's own routed distance — see this
   * file's own doc comment for why it isn't repeated on the pickup row. */
  showDistance: boolean;
  onDecideWaitRelease: (dropoffStop: TripStop) => void;
}) {
  const t = useT();
  return (
    <Fragment>
      <TableRow>
        <TableCell colSpan={COLUMN_COUNT} sx={{ bgcolor: 'action.hover', py: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
        </TableCell>
      </TableRow>
      {stops.map((stop) => {
        const leg = stop.transportLegId ? legsById[stop.transportLegId] : undefined;
        const locationLabel = stopLocationLabel(stop, leg);
        const showWaitRelease = stop.kind === TripStopKind.DROPOFF && needsWaitReleaseDecision(stop, allStops, leg);
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
            <TableCell>{showDistance ? distanceLabel(leg?.travelDistanceMeters ?? null) : '—'}</TableCell>
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
    </Fragment>
  );
}
