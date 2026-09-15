import { Box, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import HomeIcon from '@mui/icons-material/Home';
import {
  LegDirection,
  TransportPlanningLane,
  TransportPlanningLeg,
  TripStop,
  TripStopDwell,
  TripStopKind,
  VehicleOccupancy,
} from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { MobilityChip } from '../../resources/patients/patientChips';
import { minutesOfDay, minutesToX, timeLabel, TimelineWindow, xToMinutes } from './planningTime';

export const LANE_HEIGHT = 60;
const TRACK_HEIGHT = 28;

interface LegBlock {
  legId: string;
  pickup: TripStop;
  dropoff: TripStop;
}

function legBlocksForLane(stops: TripStop[]): LegBlock[] {
  const byLeg = new Map<string, { pickup?: TripStop; dropoff?: TripStop }>();
  for (const stop of stops) {
    if (!stop.transportLegId) continue;
    const entry = byLeg.get(stop.transportLegId) ?? {};
    if (stop.kind === TripStopKind.PICKUP) entry.pickup = stop;
    else if (stop.kind === TripStopKind.DROPOFF) entry.dropoff = stop;
    byLeg.set(stop.transportLegId, entry);
  }
  return [...byLeg.entries()]
    .filter((entry): entry is [string, { pickup: TripStop; dropoff: TripStop }] => !!entry[1].pickup && !!entry[1].dropoff)
    .map(([legId, { pickup, dropoff }]) => ({ legId, pickup, dropoff }));
}

type BackgroundSegment = { kind: 'empty' | 'dwell'; startMinutes: number; endMinutes: number };

/** Presence-only walk (loaded/empty/dwell) — deliberately simpler than the
 * shared `walkTripStops`, which also tracks exact seat/wheelchair/stretcher
 * demand for capacity checking. The board only needs to know *whether*
 * someone is onboard to draw empty running distinctly (#219); the backend's
 * `issues` array is still the source of truth for capacity itself. */
function backgroundSegments(stops: TripStop[]): BackgroundSegment[] {
  const ordered = [...stops].sort(
    (a, b) => new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime() || a.sequence - b.sequence,
  );
  const onboard = new Set<string>();
  const segments: BackgroundSegment[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const stop = ordered[i];
    if (stop.kind === TripStopKind.PICKUP && stop.transportLegId) onboard.add(stop.transportLegId);
    else if (stop.kind === TripStopKind.DROPOFF && stop.transportLegId) onboard.delete(stop.transportLegId);
    if (onboard.size > 0) continue; // drawn as a foreground leg block instead
    const next = ordered[i + 1];
    segments.push({
      kind: stop.kind === TripStopKind.WAIT && stop.dwellDecision === TripStopDwell.WAIT ? 'dwell' : 'empty',
      startMinutes: minutesOfDay(stop.plannedAt),
      endMinutes: minutesOfDay(next.plannedAt),
    });
  }
  return segments;
}

/** Whether a `DROPOFF` stop still needs a wait-or-release decision — an
 * outbound leg's dropoff with no `WAIT` stop already recorded at the same
 * facility right after it. */
function needsWaitReleaseDecision(stop: TripStop, allStops: TripStop[], leg: TransportPlanningLeg | undefined): boolean {
  if (!leg || leg.direction !== LegDirection.OUTBOUND) return false;
  return !allStops.some(
    (s) => s.kind === TripStopKind.WAIT && s.facilityId === stop.facilityId && s.plannedAt >= stop.plannedAt,
  );
}

export const PlanningLane = ({
  lane,
  legsById,
  timelineWindow,
  occupancy,
  onDragLegStart,
  onDropLeg,
  onEditAssignment,
  onWaitRelease,
}: {
  lane: TransportPlanningLane;
  legsById: Record<string, TransportPlanningLeg>;
  timelineWindow: TimelineWindow;
  occupancy: VehicleOccupancy[];
  onDragLegStart: (legId: string) => void;
  onDropLeg: (params: { tripId: string; legId: string; dropMinutes: number }) => void;
  onEditAssignment: (legId: string, tripId: string, pickup: TripStop, dropoff: TripStop) => void;
  onWaitRelease: (tripId: string, dropoffStop: TripStop) => void;
}) => {
  const t = useT();
  const legBlocks = legBlocksForLane(lane.stops);
  const background = backgroundSegments(lane.stops);
  const errorCount = lane.issues.filter((i) => i.level === 'ERROR').length;
  const warningCount = lane.issues.filter((i) => i.level === 'WARNING').length;

  return (
    <Box sx={{ display: 'flex', alignItems: 'stretch', borderBottom: 1, borderColor: 'divider' }}>
      <Box
        sx={{
          width: 140,
          flexShrink: 0,
          position: 'sticky',
          left: 0,
          bgcolor: 'background.paper',
          zIndex: 3,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          px: 1,
          borderRight: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="body2" fontWeight={600} noWrap>
          {lane.vehicle.numeroCauda}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {lane.vehicle.licensePlate}
        </Typography>
        {(errorCount > 0 || warningCount > 0) && (
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
            {errorCount > 0 && <Chip size="small" color="error" label={errorCount} />}
            {warningCount > 0 && <Chip size="small" color="warning" label={warningCount} />}
          </Box>
        )}
      </Box>
      <Box
        sx={{ position: 'relative', height: LANE_HEIGHT, flexGrow: 1, minWidth: 0 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const raw = e.dataTransfer.getData('application/json');
          if (!raw) return;
          const { legId } = JSON.parse(raw) as { legId: string };
          const rect = e.currentTarget.getBoundingClientRect();
          onDropLeg({ tripId: lane.trip.id, legId, dropMinutes: xToMinutes(e.clientX - rect.left, timelineWindow) });
        }}
      >
        {occupancy.map((block) => (
          <Tooltip key={block.id} title={block.notes ?? block.source}>
            <Box
              sx={{
                position: 'absolute',
                left: minutesToX(minutesOfDay(block.startsAt), timelineWindow),
                width: Math.max(4, minutesToX(minutesOfDay(block.endsAt), timelineWindow) - minutesToX(minutesOfDay(block.startsAt), timelineWindow)),
                top: 4,
                height: 10,
                bgcolor: 'grey.400',
                borderRadius: 0.5,
              }}
            />
          </Tooltip>
        ))}
        {background.map((segment, index) => (
          <Box
            key={index}
            sx={{
              position: 'absolute',
              left: minutesToX(segment.startMinutes, timelineWindow),
              width: Math.max(2, minutesToX(segment.endMinutes, timelineWindow) - minutesToX(segment.startMinutes, timelineWindow)),
              top: 18,
              height: 8,
              bgcolor: segment.kind === 'dwell' ? 'warning.light' : 'grey.300',
              backgroundImage:
                segment.kind === 'empty'
                  ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.15) 0, rgba(0,0,0,0.15) 2px, transparent 2px, transparent 6px)'
                  : undefined,
              borderRadius: 0.5,
            }}
          />
        ))}
        {legBlocks.map(({ legId, pickup, dropoff }) => {
          const leg = legsById[legId];
          const left = minutesToX(minutesOfDay(pickup.plannedAt), timelineWindow);
          const width = Math.max(16, minutesToX(minutesOfDay(dropoff.plannedAt), timelineWindow) - left);
          const showWaitRelease = needsWaitReleaseDecision(dropoff, lane.stops, leg);
          return (
            <Box
              key={legId}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({ legId }));
                onDragLegStart(legId);
              }}
              onClick={() => onEditAssignment(legId, lane.trip.id, pickup, dropoff)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onEditAssignment(legId, lane.trip.id, pickup, dropoff);
              }}
              sx={{
                position: 'absolute',
                left,
                width,
                top: 30,
                height: TRACK_HEIGHT,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                borderRadius: 1,
                px: 0.75,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                overflow: 'hidden',
                cursor: 'grab',
                whiteSpace: 'nowrap',
              }}
            >
              {leg && <MobilityChip value={leg.patientMobility} />}
              <Typography variant="caption" noWrap sx={{ color: 'inherit' }}>
                {leg?.patientName ?? leg?.direction ?? legId}
              </Typography>
              {leg?.arrivalWindowWarning && (
                <Tooltip title={t(`transportPlanning.arrivalWarning.${leg.arrivalWindowWarning}`)}>
                  <ErrorOutlineIcon fontSize="inherit" />
                </Tooltip>
              )}
              {showWaitRelease && (
                <Tooltip title={t('transportPlanning.waitReleaseButton')}>
                  <IconButton
                    size="small"
                    sx={{ color: 'inherit', p: 0.25 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onWaitRelease(lane.trip.id, dropoff);
                    }}
                  >
                    <HourglassEmptyIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        })}
        {lane.stops
          .filter((s) => s.kind === TripStopKind.RETURN_TO_BASE)
          .map((stop) => (
            <Tooltip key={stop.id} title={`${t('transportLeg.destinationLabel')} — ${timeLabel(stop.plannedAt)}`}>
              <HomeIcon
                fontSize="small"
                sx={{ position: 'absolute', left: minutesToX(minutesOfDay(stop.plannedAt), timelineWindow) - 8, top: 32 }}
              />
            </Tooltip>
          ))}
      </Box>
    </Box>
  );
};
