import { DragEvent, useState } from 'react';
import { Box, Chip, IconButton, Stack, Tooltip, Typography, alpha } from '@mui/material';
import AccessibleIcon from '@mui/icons-material/Accessible';
import AirlineSeatFlatIcon from '@mui/icons-material/AirlineSeatFlat';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import HomeIcon from '@mui/icons-material/Home';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import {
  CERTIFICATION_LABEL,
  LegDirection,
  PatientMobility,
  TransportPlanningLane,
  TransportPlanningLeg,
  TripStop,
  TripStopDwell,
  TripStopKind,
  VehicleOccupancy,
} from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { journeyDestinations, legFacilityName, treatmentMinutes } from './legFacts';
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

export const LANE_LABEL_WIDTH = 220;

/**
 * Vertical bands within a lane, top to bottom: other commitments, then **one
 * row per passenger**, then the vehicle's own track.
 *
 * The per-passenger rows are the point. A journey routinely collects the
 * furthest patient first and picks up the others along the way, so two or
 * three people are aboard at once — and the first version drew every leg at
 * the same `top`, stacking those blocks on top of each other into something
 * unreadable. Giving each passenger a row turns "who is in the vehicle, and
 * from when to when" into plain geometry, which is the single question this
 * board exists to answer.
 */
const OCCUPANCY_TOP = 3;
const OCCUPANCY_HEIGHT = 6;
const PASSENGER_ROW_TOP = 13;
const PASSENGER_ROW_HEIGHT = 30;
const PASSENGER_ROW_GAP = 3;
/** The ride itself occupies the top of the row; the treatment window sits
 * under it. Drawn inside the passenger's own row rather than in a band of its
 * own: a patient's ride and their time inside the facility are one story, and
 * reading them off the same line is what makes wait-or-release obvious. */
const RIDE_HEIGHT = 19;
const TREATMENT_TOP_IN_ROW = 22;
const TREATMENT_HEIGHT = 6;
const VEHICLE_TRACK_HEIGHT = 10;
const LANE_BOTTOM_PADDING = 6;

/**
 * Below this, a bar cannot hold its own label legibly and the name is printed
 * on the track beside it instead.
 *
 * Real legs are short — a 20-minute transfer on a twelve-hour axis is about
 * 25px — so putting the label inside unconditionally is how the first cut of
 * this ended up rendering a patient as the single character "0". The bar is
 * the geometry; the name has to stay readable independently of it.
 */
const MIN_WIDTH_FOR_INLINE_LABEL = 96;

function passengerRowTop(index: number): number {
  return PASSENGER_ROW_TOP + index * (PASSENGER_ROW_HEIGHT + PASSENGER_ROW_GAP);
}

/** An empty journey still reserves one row, so a lane awaiting its first drop
 * is a recognisable target rather than a sliver. */
export function laneHeight(passengerCount: number): number {
  return passengerRowTop(Math.max(passengerCount, 1)) + VEHICLE_TRACK_HEIGHT + LANE_BOTTOM_PADDING;
}

const MOBILITY_ICON = {
  [PatientMobility.STRETCHER]: AirlineSeatFlatIcon,
  [PatientMobility.WHEELCHAIR]: AccessibleIcon,
  [PatientMobility.AMBULATORY]: DirectionsWalkIcon,
};

interface LegBlock {
  legId: string;
  pickup: TripStop;
  dropoff: TripStop;
}

/** A journey's legs as passenger rows, earliest pickup at the top — the order
 * the crew actually collects them in, and so the order the printed sheet
 * lists. */
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
    .map(([legId, { pickup, dropoff }]) => ({ legId, pickup, dropoff }))
    .sort((a, b) => new Date(a.pickup.plannedAt).getTime() - new Date(b.pickup.plannedAt).getTime());
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
    if (onboard.size > 0) continue; // a passenger row covers this stretch instead
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
  legsById,
  timelineWindow,
  occupancy,
  isDragActive,
  onDropLeg,
  onEditAssignment,
  onEditCrew,
  onWaitRelease,
}: {
  lane: TransportPlanningLane;
  journeyNumber: number;
  legsById: Record<string, TransportPlanningLeg>;
  timelineWindow: TimelineWindow;
  occupancy: VehicleOccupancy[];
  /** True while a leg is being dragged anywhere on the board — every lane
   * shows it can take a drop, rather than only revealing it on hover. */
  isDragActive: boolean;
  onDropLeg: (params: { tripId: string; legId: string; dropMinutes: number }) => void;
  onEditAssignment: (legId: string, tripId: string, pickup: TripStop, dropoff: TripStop) => void;
  onEditCrew: (lane: TransportPlanningLane) => void;
  onWaitRelease: (tripId: string, dropoffStop: TripStop) => void;
}) => {
  const t = useT();
  const [hoverMinutes, setHoverMinutes] = useState<number | null>(null);
  const legBlocks = legBlocksForLane(lane.stops);
  const background = backgroundSegments(lane.stops);
  const errorCount = lane.issues.filter((i) => i.level === 'ERROR').length;
  const warningCount = lane.issues.filter((i) => i.level === 'WARNING').length;
  const isDropTarget = hoverMinutes != null;

  const destinations = journeyDestinations(legBlocks.map((block) => legsById[block.legId]));
  const crewNames = lane.crewMembers.map((member) => `${member.firstName} ${member.lastName}`.trim()).filter(Boolean);
  // The crew rules are ranked on the backend (`checkTripCrew`); the lane only
  // needs to know whether *this* journey's crew is one of the things that
  // fell short, so the requirement can be shown in the colour of its own
  // verdict rather than as a silent piece of trivia.
  const crewShortfall = lane.issues.some((issue) => issue.code.startsWith('CREW_') || issue.code === 'VEHICLE_NOT_EMERGENCY');
  const requirementLabel = `${lane.crewRequirement.minimumCrew}× ${CERTIFICATION_LABEL[lane.crewRequirement.minimumCertification]}`;
  const trackTop = passengerRowTop(Math.max(legBlocks.length, 1));

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
          gap: 0.25,
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

        {/* Where this journey is going. The single most-asked question of a
            row on the printed sheet, and until now only reachable by hovering
            an individual block. */}
        <Stack direction="row" spacing={0.25} alignItems="center" sx={{ minWidth: 0 }}>
          <PlaceOutlinedIcon sx={{ fontSize: 14, color: 'action.disabled', flexShrink: 0 }} />
          <Typography
            variant="caption"
            color={destinations.length ? 'text.primary' : 'text.disabled'}
            fontWeight={destinations.length ? 600 : 400}
            noWrap
            title={destinations.join(', ')}
          >
            {destinations.length === 0
              ? t('transportPlanning.destinationUnknown')
              : destinations.length === 1
                ? destinations[0]
                : t('transportPlanning.destinationPlusMore', {
                    name: destinations[0],
                    count: destinations.length - 1,
                  })}
          </Typography>
        </Stack>

        <Stack
          direction="row"
          spacing={0.25}
          alignItems="center"
          role="button"
          tabIndex={0}
          aria-label={t('transportPlanning.crewDialogTitle', { number: journeyNumber })}
          onClick={() => onEditCrew(lane)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onEditCrew(lane);
          }}
          sx={{
            minWidth: 0,
            cursor: 'pointer',
            borderRadius: 0.5,
            px: 0.25,
            mx: -0.25,
            '&:hover': { bgcolor: 'action.hover' },
            '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 1 },
          }}
        >
          <PersonOutlineIcon sx={{ fontSize: 14, color: 'action.disabled', flexShrink: 0 }} />
          <Typography
            variant="caption"
            color={crewNames.length ? 'text.secondary' : 'text.disabled'}
            noWrap
            sx={{ minWidth: 0 }}
            title={crewNames.join(', ')}
          >
            {crewNames.length ? crewNames.join(', ') : t('transportPlanning.noCrew')}
          </Typography>
          <Tooltip title={t('transportPlanning.crewRequirementHint', { requirement: requirementLabel })}>
            <Chip
              size="small"
              variant={crewShortfall ? 'filled' : 'outlined'}
              color={crewShortfall ? 'error' : 'default'}
              label={requirementLabel}
              sx={{ height: 16, fontSize: 10, ml: 'auto', flexShrink: 0 }}
            />
          </Tooltip>
        </Stack>
      </Box>

      <Box
        sx={{
          position: 'relative',
          height: laneHeight(legBlocks.length),
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
            sx={{ position: 'sticky', left: 8, top: PASSENGER_ROW_TOP + 4, display: 'inline-block' }}
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
                top: trackTop + VEHICLE_TRACK_HEIGHT / 2 - 4,
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

        {legBlocks.map(({ legId, pickup, dropoff }, index) => {
          const leg = legsById[legId];
          const rowTop = passengerRowTop(index);
          const left = minutesToX(minutesOfDay(pickup.plannedAt), timelineWindow);
          const width = Math.max(18, minutesToX(minutesOfDay(dropoff.plannedAt), timelineWindow) - left);
          const showWaitRelease = needsWaitReleaseDecision(dropoff, lane.stops, leg);
          const facilityName = leg ? legFacilityName(leg) : null;
          const isOutbound = leg?.direction !== LegDirection.RETURN;
          const minutesOnboard = Math.max(0, minutesOfDay(dropoff.plannedAt) - minutesOfDay(pickup.plannedAt));
          const treatment = leg ? treatmentMinutes(leg) : null;
          const MobilityIcon = MOBILITY_ICON[leg?.patientMobility ?? PatientMobility.AMBULATORY];
          const blockLabel = [leg?.patientName, facilityName].filter(Boolean).join(' ▸ ');
          const showInlineLabel = width >= MIN_WIDTH_FOR_INLINE_LABEL;

          return (
            <Box key={legId}>
              {/* Behind the ride bar, and in the same row: the stretch the
                  patient is inside the facility rather than in the vehicle. */}
              {treatment != null && leg && (
                <Tooltip
                  title={`${t('transportPlanning.treatmentDurationLabel')} ${durationLabel(treatment)} · ${t('transportPlanning.treatmentStartShort')} ${timeLabel(leg.appointmentAt)} · ${t('transportPlanning.treatmentEndShort')} ${timeLabel(leg.effectiveEstimatedEndAt)}`}
                >
                  <Box
                    data-testid={`treatment-window-${legId}`}
                    sx={{
                      position: 'absolute',
                      left: minutesToX(minutesOfDay(leg.appointmentAt), timelineWindow),
                      width: Math.max(
                        2,
                        minutesToX(minutesOfDay(leg.effectiveEstimatedEndAt), timelineWindow) -
                          minutesToX(minutesOfDay(leg.appointmentAt), timelineWindow),
                      ),
                      top: rowTop + TREATMENT_TOP_IN_ROW,
                      height: TREATMENT_HEIGHT,
                      bgcolor: 'info.light',
                      opacity: 0.75,
                      borderRadius: 0.5,
                      // Nothing is in the vehicle during the treatment; the bar
                      // is the patient's time, not the vehicle's. Hollow rather
                      // than solid so it never reads as occupancy.
                      border: 1,
                      borderColor: 'info.main',
                    }}
                  />
                </Tooltip>
              )}

              <Tooltip
                title={
                  <Box>
                    <div>{leg?.patientName ?? legId}</div>
                    <div>
                      {t('transportPlanning.pickupLabel')} {timeLabel(pickup.plannedAt)} ▸ {facilityName ?? '—'}{' '}
                      {timeLabel(dropoff.plannedAt)}
                    </div>
                    <div>
                      {t('transportPlanning.onboardLabel')} {durationLabel(minutesOnboard)}
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
                  // Which passenger row this bar occupies. Rendered rather than
                  // left implicit in the `top` above because that goes through
                  // emotion, where it is not readable as geometry.
                  data-passenger-row={index}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onEditAssignment(legId, lane.trip.id, pickup, dropoff);
                  }}
                  sx={{
                    position: 'absolute',
                    left,
                    width,
                    top: rowTop,
                    height: RIDE_HEIGHT,
                    bgcolor: isOutbound ? 'primary.main' : 'secondary.main',
                    color: isOutbound ? 'primary.contrastText' : 'secondary.contrastText',
                    // Square on the boarding edge, round on the alighting one:
                    // at a glance the bar reads as a direction of travel, not
                    // as an anonymous span.
                    borderRadius: '2px 10px 10px 2px',
                    px: 0.25,
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
                  <MobilityIcon sx={{ fontSize: 13, flexShrink: 0 }} />
                  {showInlineLabel && (
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{ color: 'inherit', fontWeight: 600, minWidth: 0, fontSize: 11 }}
                    >
                      {leg?.patientName ?? legId}
                    </Typography>
                  )}
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

              {/* The name beside the bar when the bar is too short to hold it.
                  `pointerEvents: none` so it never shadows the lane's own drop
                  target, and never intercepts a drag aimed at the track. */}
              {!showInlineLabel && (
                <Typography
                  variant="caption"
                  noWrap
                  aria-hidden
                  sx={{
                    position: 'absolute',
                    left: left + width + 4,
                    top: rowTop,
                    height: RIDE_HEIGHT,
                    display: 'flex',
                    alignItems: 'center',
                    fontWeight: 600,
                    fontSize: 11,
                    color: 'text.primary',
                    pointerEvents: 'none',
                    maxWidth: 180,
                  }}
                >
                  {leg?.patientName ?? legId}
                </Typography>
              )}
            </Box>
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
                  top: trackTop - 3,
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
