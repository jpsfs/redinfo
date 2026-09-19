import { Box, Button, IconButton, Tooltip, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import AirportShuttleOutlinedIcon from '@mui/icons-material/AirportShuttleOutlined';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import { TransportPlanningLane, TransportPlanningLeg, TripStop, VehicleOccupancy, VehicleType } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { journeyColorForOrdinal } from './journeyColor';
import { LANE_LABEL_WIDTH, PlanningLane } from './PlanningLane';
import { TimelineWindow } from './planningTime';

/**
 * One vehicle's whole day: its journeys stacked in time order.
 *
 * The delegation's printed daily sheet separates those journeys with a heavy
 * rule, because paper has no time axis and nothing else to separate them
 * with. The first version of this component reproduced that rule literally —
 * a 3px black slab across the board — which is the one thing a screen does
 * not need to borrow: here the grouping can be carried by a tinted header,
 * a hairline between journeys and real whitespace between vehicles.
 *
 * The grouping itself still matters, and is why this component exists rather
 * than the board being a flat list of trips: one journey is one `Trip`, which
 * is what carries the crew and the wait-or-release decisions, and both
 * genuinely vary between a morning and an afternoon round.
 *
 * Nothing here may take horizontal padding or a side border — every lane's
 * track is positioned against the same x origin as `TimelineRuler` above it,
 * so an inset of even a pixel would slide the blocks out of true with the
 * hour labels.
 */
export const VehicleGroup = ({
  vehicle,
  date,
  lanes,
  legsById,
  timelineWindow,
  occupancy,
  isDragActive,
  selectedTripId,
  onSelectJourney,
  onAddJourney,
  onDropLeg,
  onEditAssignment,
  onEditCrew,
  onWaitRelease,
}: {
  vehicle: TransportPlanningLane['vehicle'];
  /** The board's own date — carried only so the vehicle icon can link to
   * this vehicle's day (`/transport-planning/vehicle/:id?date=`, #247 stage
   * 5); nothing else in this component depends on it. */
  date: string;
  /** This vehicle's journeys, already in the order they run. */
  lanes: TransportPlanningLane[];
  legsById: Record<string, TransportPlanningLeg>;
  timelineWindow: TimelineWindow;
  occupancy: VehicleOccupancy[];
  isDragActive: boolean;
  /** The focused journey's trip id, board-wide (#247 stage 1) — `null` when
   * nothing is selected, in which case every lane renders at full opacity. */
  selectedTripId: string | null;
  onSelectJourney: (tripId: string) => void;
  onAddJourney: (vehicleId: string) => void;
  onDropLeg: (params: { tripId: string; legId: string; dropMinutes: number }) => void;
  onEditAssignment: (legId: string, tripId: string, pickup: TripStop, dropoff: TripStop) => void;
  onEditCrew: (lane: TransportPlanningLane, journeyNumber: number) => void;
  onWaitRelease: (tripId: string, dropoffStop: TripStop) => void;
}) => {
  const t = useT();
  const navigate = useNavigate();
  const isEmergency = vehicle.vehicleType === VehicleType.EMERGENCY;
  const VehicleIcon = isEmergency ? LocalHospitalOutlinedIcon : AirportShuttleOutlinedIcon;

  return (
    <Box sx={{ '&:not(:last-of-type)': { mb: 2.5 } }}>
      {/* A band the full width of the board, with its contents pinned to the
          left. One layer could not do both: `position: sticky` needs a
          `fit-content` box to travel, but a `fit-content` box leaves the tint
          ending in mid-air halfway across the timeline. */}
      <Box
        sx={{
          // The only tinted surface on the board, which is what makes a
          // vehicle's journeys read as one unit without a rule drawn round them.
          bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.09 : 0.04),
          borderRadius: '8px 8px 0 0',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            py: 0.75,
            pl: 1,
            position: 'sticky',
            left: 0,
            zIndex: 3,
            width: 'fit-content',
            minWidth: LANE_LABEL_WIDTH,
          }}
        >
          <Tooltip title={t('transportPlanning.openVehicleDay')}>
            <IconButton
              size="small"
              aria-label={t('transportPlanning.openVehicleDay')}
              onClick={() => navigate(`/transport-planning/vehicle/${vehicle.id}?date=${date}`)}
              sx={{ p: 0.25 }}
            >
              <VehicleIcon fontSize="small" sx={{ color: isEmergency ? 'error.main' : 'text.secondary' }} />
            </IconButton>
          </Tooltip>
          <Typography variant="subtitle2" fontWeight={800} noWrap sx={{ letterSpacing: 0.2 }}>
            {vehicle.numeroCauda}
          </Typography>
          <Typography
            variant="caption"
            noWrap
            sx={{
              px: 0.75,
              py: 0.125,
              borderRadius: 0.75,
              color: 'text.secondary',
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11,
            }}
          >
            {vehicle.licensePlate}
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => onAddJourney(vehicle.id)}
            sx={{ ml: 0.5, textTransform: 'none', fontWeight: 600 }}
          >
            {t('transportPlanning.addJourneyButton')}
          </Button>
        </Box>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        {lanes.map((lane, index) => (
          <PlanningLane
            key={lane.trip.id}
            lane={lane}
            journeyNumber={lane.journeyNumber}
            journeyColor={journeyColorForOrdinal(lane.journeyNumber)}
            isFocused={selectedTripId === lane.trip.id}
            isDimmed={selectedTripId != null && selectedTripId !== lane.trip.id}
            onSelectJourney={() => onSelectJourney(lane.trip.id)}
            // A hairline between journeys of the same vehicle, never above the
            // first — the tinted header already separates that one.
            showDividerAbove={index > 0}
            legsById={legsById}
            timelineWindow={timelineWindow}
            occupancy={occupancy}
            isDragActive={isDragActive}
            onDropLeg={onDropLeg}
            onEditAssignment={onEditAssignment}
            onEditCrew={(target) => onEditCrew(target, lane.journeyNumber)}
            onWaitRelease={onWaitRelease}
          />
        ))}
      </Box>
    </Box>
  );
};
