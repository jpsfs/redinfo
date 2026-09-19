import { DragEvent, useState } from 'react';
import { Box, Chip, IconButton, Stack, Tooltip, Typography, alpha, darken } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import HomeIcon from '@mui/icons-material/Home';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  CERTIFICATION_LABEL,
  LegDirection,
  PatientMobility,
  TransportPlanningLane,
  TransportPlanningLeg,
  TripStatus,
  TripStop,
  TripStopDwell,
  TripStopKind,
  VehicleOccupancy,
} from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { MOBILITY_ICON } from './mobilityIcon';
import {
  journeyDestinations,
  legFacilityName,
  needsWaitReleaseDecision,
  shortenPatientName,
  treatmentMinutes,
} from './legFacts';
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

/**
 * Above this a bar can hold a full Portuguese name; between this and
 * `MIN_WIDTH_FOR_INLINE_LABEL` it holds the shortened one. Both fall back to
 * the same tooltip, which is where the full name and the times live.
 */
const MIN_WIDTH_FOR_FULL_NAME = 168;

function passengerRowTop(index: number): number {
  return PASSENGER_ROW_TOP + index * (PASSENGER_ROW_HEIGHT + PASSENGER_ROW_GAP);
}

/** An empty journey still reserves one row, so a lane awaiting its first drop
 * is a recognisable target rather than a sliver. */
export function laneHeight(passengerCount: number): number {
  return passengerRowTop(Math.max(passengerCount, 1)) + VEHICLE_TRACK_HEIGHT + LANE_BOTTOM_PADDING;
}

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
  journeyColor,
  isFocused,
  isDimmed,
  onSelectJourney,
  showDividerAbove = false,
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
  /** This journey's identity colour — see `journeyColorForOrdinal`. Carries
   * identity only; direction is a shape (outbound solid, return dashed) and
   * status an outline, so the same hue never has to mean two things. */
  journeyColor: string;
  /** True when this is the selected journey — focus mode's positive case. */
  isFocused: boolean;
  /** True when another journey is selected and this isn't it (#247 stage 1)
   * — dropped to ~20% opacity, the thing that keeps a heavy day legible
   * without a bigger palette. */
  isDimmed: boolean;
  onSelectJourney: () => void;
  /** Hairline above this journey — set for every journey of a vehicle except
   * the first, which the vehicle header already separates. */
  showDividerAbove?: boolean;
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
    <Box
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        opacity: isDimmed ? 0.2 : 1,
        transition: 'opacity 150ms',
        ...(showDividerAbove ? { borderTop: 1, borderColor: 'divider' } : {}),
      }}
    >
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
          gap: 0.5,
          px: 1,
          py: 0.75,
          borderRight: 1,
          borderColor: 'divider',
        }}
      >
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          role="button"
          tabIndex={0}
          aria-pressed={isFocused}
          aria-label={t('transportPlanning.selectJourneyLabel', { number: journeyNumber })}
          onClick={onSelectJourney}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectJourney();
            }
          }}
          sx={{
            cursor: 'pointer',
            borderRadius: 0.5,
            px: 0.25,
            mx: -0.25,
            '&:hover': { bgcolor: 'action.hover' },
            '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 1 },
          }}
        >
          {/* The journey's own identity colour (#247 stage 1) — the same
              swatch the leg blocks, the inspector and the journey page use. */}
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              flexShrink: 0,
              bgcolor: journeyColor,
              boxShadow: isFocused ? `0 0 0 2px ${journeyColor}55` : 'none',
            }}
          />
          {/* A quiet numbered token, not a filled pill. Red is reserved for
              a patient being carried; a journey's ordinal is navigation. */}
          <Box
            sx={{
              minWidth: 18,
              height: 18,
              px: 0.5,
              borderRadius: 0.75,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 800,
              color: 'text.secondary',
              bgcolor: (theme) => alpha(theme.palette.text.primary, 0.08),
            }}
          >
            {journeyNumber}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.3 }}>
            {t('transportPlanning.journeyWord')}
          </Typography>
          {errorCount > 0 && (
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.25, color: 'error.main' }}>
              <ErrorOutlineIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption" fontWeight={700}>
                {errorCount}
              </Typography>
            </Box>
          )}
          {warningCount > 0 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.25,
                color: 'warning.main',
                ...(errorCount > 0 ? {} : { ml: 'auto' }),
              }}
            >
              <WarningAmberIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption" fontWeight={700}>
                {warningCount}
              </Typography>
            </Box>
          )}
        </Stack>

        {/* Where this journey is going — the single most-asked question of a
            row on the printed sheet. Wrapped rather than truncated: a
            delegation's destinations are long ("Clínica de Hemodiálise de
            Barcelos") and differ in their last word, so an ellipsis hides
            exactly the part that tells two of them apart. */}
        <Stack direction="row" spacing={0.5} sx={{ minWidth: 0 }}>
          <PlaceOutlinedIcon sx={{ fontSize: 14, color: 'action.disabled', flexShrink: 0, mt: '2px' }} />
          <Typography
            variant="caption"
            color={destinations.length ? 'text.primary' : 'text.disabled'}
            sx={{
              fontWeight: destinations.length ? 700 : 400,
              lineHeight: 1.3,
              minWidth: 0,
              overflowWrap: 'anywhere',
            }}
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
            sx={{ minWidth: 0, flexShrink: 1 }}
            title={crewNames.join(', ')}
          >
            {crewNames.length ? crewNames.join(', ') : t('transportPlanning.noCrew')}
          </Typography>
          <Tooltip title={t('transportPlanning.crewRequirementHint', { requirement: requirementLabel })}>
            <Box
              sx={{
                ml: 'auto',
                flexShrink: 0,
                px: 0.625,
                py: 0.125,
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.2,
                whiteSpace: 'nowrap',
                border: 1,
                // Met: a quiet outline that recedes. Short: solid, because a
                // journey that cannot legally run should not look like a
                // detail.
                ...(crewShortfall
                  ? { bgcolor: 'error.main', color: 'error.contrastText', borderColor: 'error.main' }
                  : { color: 'text.secondary', borderColor: 'divider', bgcolor: 'transparent' }),
              }}
            >
              {requirementLabel}
            </Box>
          </Tooltip>
        </Stack>
      </Box>

      <Box
        sx={{
          position: 'relative',
          // `minHeight`, not `height`: a long destination wraps to two or
          // three lines in the sticky column beside this, and the row has to
          // be free to grow with it. Blocks are positioned from the top, so
          // extra height below them changes nothing about where they sit.
          minHeight: laneHeight(legBlocks.length),
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
          const fullName = leg?.patientName ?? legId;
          // The bar shows as much of the name as it can hold; whatever it drops
          // is in the tooltip, which every form of the label shares.
          const shownName = width >= MIN_WIDTH_FOR_FULL_NAME ? fullName : shortenPatientName(fullName);
          // One tooltip, shown from the bar and from the name printed beside a
          // bar too narrow to hold one — whichever the planner's pointer finds
          // first, they get the full name and the times the label dropped.
          const legTooltip = (
            <Box>
              <Box sx={{ fontWeight: 700 }}>{fullName}</Box>
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
          );

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

              <Tooltip title={legTooltip}>
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
                    // The journey's identity colour as a soft tint carrying
                    // dark text, not as a saturated fill carrying white
                    // 11px text — that was the least legible text on the
                    // board, and a lane with four passengers read as a wall
                    // of colour. The hue still identifies the journey; it
                    // just stops shouting.
                    color: darken(journeyColor, 0.28),
                    bgcolor: alpha(journeyColor, 0.16),
                    border: '1px solid',
                    borderColor: alpha(journeyColor, 0.35),
                    // Solid outbound, dashed return — legible without colour.
                    // Not a hatch fill, which would collide with the empty
                    // running the vehicle track already draws as one.
                    borderTopStyle: isOutbound ? 'solid' : 'dashed',
                    borderRightStyle: isOutbound ? 'solid' : 'dashed',
                    borderBottomStyle: isOutbound ? 'solid' : 'dashed',
                    // The boarding edge: a solid bar of the full-strength
                    // colour, square, whatever the direction. The alighting
                    // edge is the rounded one.
                    borderLeft: '4px solid',
                    borderLeftColor: journeyColor,
                    borderRadius: '2px 10px 10px 2px',
                    // Status as an outline: a journey with an ERROR issue
                    // gets a red hairline ring, a completed one is muted.
                    ...(errorCount > 0 ? { boxShadow: (theme) => `0 0 0 1.5px ${theme.palette.error.main}` } : { boxShadow: 1 }),
                    opacity: lane.trip.status === TripStatus.COMPLETED ? 0.6 : 1,
                    px: 0.25,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.25,
                    overflow: 'hidden',
                    cursor: 'grab',
                    '&:active': { cursor: 'grabbing' },
                    // Deepening the tint, not brightening it — `brightness`
                    // on a near-white fill is invisible.
                    '&:hover': { bgcolor: alpha(journeyColor, 0.28) },
                    '&:focus-visible': { outline: 2, outlineColor: 'text.primary', outlineOffset: 1 },
                    whiteSpace: 'nowrap',
                  }}
                >
                  <MobilityIcon sx={{ fontSize: 13, flexShrink: 0 }} />
                  {showInlineLabel && (
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{ color: 'inherit', fontWeight: 600, minWidth: 0, fontSize: 11 }}
                    >
                      {shownName}
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
                  It stays `pointerEvents: none` *while a drag is in flight*, so
                  it never shadows the lane's own drop target — but it is
                  hoverable at rest, because a short bar is exactly the case
                  where the planner most needs the tooltip's times. Still
                  `aria-hidden`: the bar beside it already carries this name as
                  its accessible label, and the tooltip with it. */}
              {!showInlineLabel && (
                <Tooltip title={legTooltip}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.5}
                    aria-hidden
                    sx={{
                      position: 'absolute',
                      left: left + width + 5,
                      top: rowTop,
                      height: RIDE_HEIGHT,
                      maxWidth: 180,
                      pointerEvents: isDragActive ? 'none' : 'auto',
                    }}
                  >
                    {/* The journey's colour as its own element in the row, so
                        it can never be painted over the first letters of the
                        name the way an absolutely-placed dot would. */}
                    <Box
                      sx={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        flexShrink: 0,
                        bgcolor: journeyColor,
                      }}
                    />
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{ fontWeight: 600, fontSize: 11, color: 'text.primary', minWidth: 0 }}
                    >
                      {shownName}
                    </Typography>
                  </Stack>
                </Tooltip>
              )}
            </Box>
          );
        })}

        {lane.stops
          .filter((s) => s.kind === TripStopKind.RETURN_TO_BASE || s.kind === TripStopKind.DEPART_FROM_BASE)
          .map((stop) => (
            <Tooltip
              key={stop.id}
              title={`${t(stop.kind === TripStopKind.RETURN_TO_BASE ? 'transportPlanning.returnToBaseLabel' : 'transportPlanning.departFromBaseLabel')} — ${timeLabel(stop.plannedAt)}`}
            >
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
