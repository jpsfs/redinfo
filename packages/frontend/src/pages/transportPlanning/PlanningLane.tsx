import { DragEvent, useState } from 'react';
import { Box, Chip, IconButton, Stack, Tooltip, Typography, alpha } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import HomeIcon from '@mui/icons-material/Home';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
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
import { legFacilityName, treatmentMinutes } from './legFacts';
import {
  TimelineWindow,
  clockLabel,
  durationLabel,
  minutesOfDay,
  minutesToX,
  snapMinutes,
  timeLabel,
  xToMinutes,
} from './planningTime';
import { TimelineGridlines } from './TimelineRuler';

export const LANE_LABEL_WIDTH = 170;

/** Vertical bands within a lane, top to bottom: other commitments, the
 * treatment window, then the vehicle's own track. Each is its own row so a
 * block never has to be read on top of another. */
const OCCUPANCY_TOP = 4;
const OCCUPANCY_HEIGHT = 8;
const TREATMENT_TOP = 16;
const TREATMENT_HEIGHT = 8;
const TRACK_TOP = 30;
const TRACK_HEIGHT = 30;
export const LANE_HEIGHT = TRACK_TOP + TRACK_HEIGHT + 8;

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

/**
 * One journey — one `Trip` — as a row on the time axis (#235).
 *
 * A vehicle's day is several of these stacked under one header, which is what
 * the heavy rule on the delegation's printed daily sheet separates: journey 1
 * out to one facility in the morning, journey 2 to another in the afternoon.
 * See `VehicleGroup`, which draws that grouping.
 */
export const PlanningLane = ({
  lane,
  journeyNumber,
  crewNames,
  legsById,
  timelineWindow,
  occupancy,
  isDragActive,
  onDropLeg,
  onEditAssignment,
  onWaitRelease,
}: {
  lane: TransportPlanningLane;
  journeyNumber: number;
  crewNames: string[];
  legsById: Record<string, TransportPlanningLeg>;
  timelineWindow: TimelineWindow;
  occupancy: VehicleOccupancy[];
  /** True while a leg is being dragged anywhere on the board — every lane
   * shows it can take a drop, rather than only revealing it on hover. */
  isDragActive: boolean;
  onDropLeg: (params: { tripId: string; legId: string; dropMinutes: number }) => void;
  onEditAssignment: (legId: string, tripId: string, pickup: TripStop, dropoff: TripStop) => void;
  onWaitRelease: (tripId: string, dropoffStop: TripStop) => void;
}) => {
  const t = useT();
  const [hoverMinutes, setHoverMinutes] = useState<number | null>(null);
  const legBlocks = legBlocksForLane(lane.stops);
  const background = backgroundSegments(lane.stops);
  const errorCount = lane.issues.filter((i) => i.level === 'ERROR').length;
  const warningCount = lane.issues.filter((i) => i.level === 'WARNING').length;
  const isDropTarget = hoverMinutes != null;

  const minutesFromEvent = (e: DragEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return snapMinutes(xToMinutes(e.clientX - rect.left, timelineWindow));
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'stretch', borderBottom: 1, borderColor: 'divider' }}>
      <Box
        sx={{
          width: LANE_LABEL_WIDTH,
          flexShrink: 0,
          position: 'sticky',
          left: 0,
          bgcolor: 'background.paper',
          zIndex: 3,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          px: 1,
          py: 0.5,
          borderRight: 1,
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label={t('transportPlanning.journeyLabel', { number: journeyNumber })}
            sx={{ height: 20, fontWeight: 700 }}
          />
          {errorCount > 0 && <Chip size="small" color="error" label={errorCount} sx={{ height: 20 }} />}
          {warningCount > 0 && <Chip size="small" color="warning" label={warningCount} sx={{ height: 20 }} />}
        </Stack>
        <Stack direction="row" spacing={0.25} alignItems="center" sx={{ mt: 0.25, minWidth: 0 }}>
          <PersonOutlineIcon sx={{ fontSize: 14, color: 'action.disabled', flexShrink: 0 }} />
          <Typography
            variant="caption"
            color={crewNames.length ? 'text.secondary' : 'text.disabled'}
            noWrap
            title={crewNames.join(', ')}
          >
            {crewNames.length ? crewNames.join(', ') : t('transportPlanning.noCrew')}
          </Typography>
        </Stack>
      </Box>

      <Box
        sx={{
          position: 'relative',
          height: LANE_HEIGHT,
          flexGrow: 1,
          minWidth: 0,
          // Drop affordance: every lane lifts while a drag is in flight, and
          // the one under the pointer is picked out. Without this the first
          // version gave no sign a lane would accept the block at all.
          bgcolor: isDropTarget
            ? (theme) => alpha(theme.palette.primary.main, 0.1)
            : isDragActive
              ? 'action.hover'
              : 'transparent',
          outline: isDropTarget ? 2 : 0,
          outlineStyle: 'dashed',
          outlineColor: 'primary.main',
          outlineOffset: -2,
          transition: 'background-color 120ms',
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setHoverMinutes(minutesFromEvent(e));
        }}
        onDragLeave={() => setHoverMinutes(null)}
        onDrop={(e) => {
          e.preventDefault();
          const dropMinutes = minutesFromEvent(e);
          setHoverMinutes(null);
          const raw = e.dataTransfer.getData('application/json');
          if (!raw) return;
          const { legId } = JSON.parse(raw) as { legId: string };
          onDropLeg({ tripId: lane.trip.id, legId, dropMinutes });
        }}
      >
        <TimelineGridlines timelineWindow={timelineWindow} />

        {lane.stops.length === 0 && !isDragActive && (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ position: 'sticky', left: 8, top: TRACK_TOP + 6, display: 'inline-block' }}
          >
            {t('transportPlanning.journeyEmpty')}
          </Typography>
        )}

        {occupancy.map((block) => (
          <Tooltip
            key={block.id}
            title={`${t(`transportPlanning.occupancyLegend.${block.source}`)}${block.notes ? ` — ${block.notes}` : ''}`}
          >
            <Box
              sx={{
                position: 'absolute',
                left: minutesToX(minutesOfDay(block.startsAt), timelineWindow),
                width: Math.max(
                  4,
                  minutesToX(minutesOfDay(block.endsAt), timelineWindow) -
                    minutesToX(minutesOfDay(block.startsAt), timelineWindow),
                ),
                top: OCCUPANCY_TOP,
                height: OCCUPANCY_HEIGHT,
                bgcolor: 'grey.500',
                borderRadius: 0.5,
              }}
            />
          </Tooltip>
        ))}

        {background.map((segment, index) => (
          <Tooltip
            key={index}
            title={`${t(segment.kind === 'dwell' ? 'transportPlanning.dwellLabel' : 'transportPlanning.emptyLegLabel')} — ${durationLabel(segment.endMinutes - segment.startMinutes)}`}
          >
            <Box
              sx={{
                position: 'absolute',
                left: minutesToX(segment.startMinutes, timelineWindow),
                width: Math.max(2, minutesToX(segment.endMinutes, timelineWindow) - minutesToX(segment.startMinutes, timelineWindow)),
                top: TRACK_TOP + TRACK_HEIGHT / 2 - 4,
                height: 8,
                bgcolor: segment.kind === 'dwell' ? 'warning.light' : 'grey.300',
                backgroundImage:
                  segment.kind === 'empty'
                    ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.18) 0, rgba(0,0,0,0.18) 2px, transparent 2px, transparent 6px)'
                    : undefined,
                borderRadius: 0.5,
              }}
            />
          </Tooltip>
        ))}

        {/* The treatment window, drawn above the vehicle's own track: how long
            the patient is inside is what decides whether this vehicle waits
            for them or goes and does something else (#219). */}
        {legBlocks.map(({ legId }) => {
          const leg = legsById[legId];
          const minutes = leg ? treatmentMinutes(leg) : null;
          if (!leg || minutes == null) return null;
          const left = minutesToX(minutesOfDay(leg.appointmentAt), timelineWindow);
          const width = Math.max(2, minutesToX(minutesOfDay(leg.effectiveEstimatedEndAt), timelineWindow) - left);
          return (
            <Tooltip
              key={`treatment-${legId}`}
              title={`${t('transportPlanning.treatmentDurationLabel')} ${durationLabel(minutes)} · ${t('transportPlanning.treatmentStartShort')} ${timeLabel(leg.appointmentAt)} · ${t('transportPlanning.treatmentEndShort')} ${timeLabel(leg.effectiveEstimatedEndAt)}`}
            >
              <Box
                data-testid={`treatment-window-${legId}`}
                sx={{
                  position: 'absolute',
                  left,
                  width,
                  top: TREATMENT_TOP,
                  height: TREATMENT_HEIGHT,
                  bgcolor: 'info.light',
                  opacity: 0.75,
                  borderRadius: 0.5,
                  // Nothing is in the vehicle during the treatment; the bar is
                  // the patient's time, not the vehicle's. Hollow rather than
                  // solid so it never reads as occupancy.
                  border: 1,
                  borderColor: 'info.main',
                }}
              />
            </Tooltip>
          );
        })}

        {legBlocks.map(({ legId, pickup, dropoff }) => {
          const leg = legsById[legId];
          const left = minutesToX(minutesOfDay(pickup.plannedAt), timelineWindow);
          const width = Math.max(18, minutesToX(minutesOfDay(dropoff.plannedAt), timelineWindow) - left);
          const showWaitRelease = needsWaitReleaseDecision(dropoff, lane.stops, leg);
          const facilityName = leg ? legFacilityName(leg) : null;
          const isOutbound = leg?.direction !== LegDirection.RETURN;
          const blockLabel = [leg?.patientName, facilityName].filter(Boolean).join(' ▸ ');
          return (
            <Tooltip
              key={legId}
              title={
                <Box>
                  <div>{leg?.patientName ?? legId}</div>
                  <div>
                    {t('transportPlanning.pickupLabel')} {timeLabel(pickup.plannedAt)} ▸ {facilityName ?? '—'}{' '}
                    {timeLabel(dropoff.plannedAt)}
                  </div>
                  {leg && isOutbound && (
                    <div>
                      {t('transportPlanning.treatmentStartShort')} {timeLabel(leg.appointmentAt)} ·{' '}
                      {t('transportPlanning.treatmentEndShort')} {timeLabel(leg.effectiveEstimatedEndAt)}
                    </div>
                  )}
                </Box>
              }
            >
              <Box
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify({ legId }));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => onEditAssignment(legId, lane.trip.id, pickup, dropoff)}
                role="button"
                tabIndex={0}
                aria-label={blockLabel || legId}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onEditAssignment(legId, lane.trip.id, pickup, dropoff);
                }}
                sx={{
                  position: 'absolute',
                  left,
                  width,
                  top: TRACK_TOP,
                  height: TRACK_HEIGHT,
                  bgcolor: isOutbound ? 'primary.main' : 'secondary.main',
                  color: isOutbound ? 'primary.contrastText' : 'secondary.contrastText',
                  borderRadius: 1,
                  px: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.25,
                  overflow: 'hidden',
                  cursor: 'grab',
                  '&:active': { cursor: 'grabbing' },
                  '&:hover': { filter: 'brightness(1.1)' },
                  '&:focus-visible': { outline: 2, outlineColor: 'text.primary', outlineOffset: 1 },
                  whiteSpace: 'nowrap',
                  boxShadow: 1,
                }}
              >
                <Typography variant="caption" noWrap sx={{ color: 'inherit', fontWeight: 600, minWidth: 0 }}>
                  {blockLabel || legId}
                </Typography>
                {leg?.arrivalWindowWarning && <ErrorOutlineIcon fontSize="inherit" />}
                {showWaitRelease && (
                  <IconButton
                    size="small"
                    aria-label={t('transportPlanning.waitReleaseButton')}
                    sx={{ color: 'inherit', p: 0.25, ml: 'auto' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onWaitRelease(lane.trip.id, dropoff);
                    }}
                  >
                    <HourglassEmptyIcon fontSize="inherit" />
                  </IconButton>
                )}
              </Box>
            </Tooltip>
          );
        })}

        {lane.stops
          .filter((s) => s.kind === TripStopKind.RETURN_TO_BASE)
          .map((stop) => (
            <Tooltip key={stop.id} title={`${t('transportPlanning.returnToBaseLabel')} — ${timeLabel(stop.plannedAt)}`}>
              <HomeIcon
                fontSize="small"
                sx={{
                  position: 'absolute',
                  left: minutesToX(minutesOfDay(stop.plannedAt), timelineWindow) - 8,
                  top: TRACK_TOP + 6,
                  color: 'text.secondary',
                }}
              />
            </Tooltip>
          ))}

        {/* Where the block will actually land, while the pointer is still
            moving — the first version dropped blind and only showed the
            result after the round trip to the API. */}
        {hoverMinutes != null && (
          <Box
            sx={{
              position: 'absolute',
              left: minutesToX(hoverMinutes, timelineWindow),
              top: 0,
              bottom: 0,
              borderLeft: 2,
              borderColor: 'primary.main',
              pointerEvents: 'none',
            }}
          >
            <Chip
              size="small"
              color="primary"
              label={t('transportPlanning.dropHere', { time: clockLabel(hoverMinutes) })}
              sx={{ position: 'absolute', top: 2, left: 2, height: 18, fontSize: 11 }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};
