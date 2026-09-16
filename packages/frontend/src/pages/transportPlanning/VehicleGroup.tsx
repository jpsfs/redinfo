import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { TransportPlanningLane, TransportPlanningLeg, TripStop, VehicleOccupancy } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { LANE_LABEL_WIDTH, PlanningLane } from './PlanningLane';
import { TimelineWindow } from './planningTime';

/**
 * One vehicle's whole day: its journeys stacked in time order, separated the
 * way the delegation's printed daily sheet separates them — a heavy rule.
 *
 * That rule is the reason this component exists rather than the board being a
 * flat list of trips. On paper the split has to be drawn because the sheet has
 * no time axis; here the geometry already shows it, but the planner reads the
 * two artefacts side by side and the board should use their vocabulary. One
 * journey is one `Trip`, which is also what carries the crew and the
 * wait-or-release decisions — both of which genuinely vary between a morning
 * and an afternoon round.
 */
export const VehicleGroup = ({
  vehicle,
  lanes,
  crewNamesByTripId,
  legsById,
  timelineWindow,
  occupancy,
  isDragActive,
  onAddJourney,
  onDropLeg,
  onEditAssignment,
  onWaitRelease,
}: {
  vehicle: TransportPlanningLane['vehicle'];
  /** This vehicle's journeys, already in the order they run. */
  lanes: TransportPlanningLane[];
  crewNamesByTripId: Record<string, string[]>;
  legsById: Record<string, TransportPlanningLeg>;
  timelineWindow: TimelineWindow;
  occupancy: VehicleOccupancy[];
  isDragActive: boolean;
  onAddJourney: (vehicleId: string) => void;
  onDropLeg: (params: { tripId: string; legId: string; dropMinutes: number }) => void;
  onEditAssignment: (legId: string, tripId: string, pickup: TripStop, dropoff: TripStop) => void;
  onWaitRelease: (tripId: string, dropoffStop: TripStop) => void;
}) => {
  const t = useT();
  return (
    <Box sx={{ borderBottom: 3, borderColor: 'text.primary', '&:last-of-type': { borderBottom: 0 } }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 0.5,
          position: 'sticky',
          left: 0,
          zIndex: 3,
          width: 'fit-content',
          minWidth: LANE_LABEL_WIDTH,
          bgcolor: 'background.paper',
        }}
      >
        <LocalShippingIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="subtitle2" fontWeight={700} noWrap>
          {vehicle.numeroCauda}
        </Typography>
        <Chip size="small" variant="outlined" label={vehicle.licensePlate} sx={{ height: 20 }} />
        <Button size="small" startIcon={<AddIcon />} onClick={() => onAddJourney(vehicle.id)}>
          {t('transportPlanning.addJourneyButton')}
        </Button>
      </Box>

      {lanes.map((lane, index) => (
        <Box
          key={lane.trip.id}
          sx={{
            // The heavy rule from the paper sheet, between journeys of the
            // same vehicle — never above the first one, which the vehicle
            // header already separates.
            borderTop: index === 0 ? 0 : 2,
            borderColor: 'text.secondary',
          }}
        >
          <PlanningLane
            lane={lane}
            journeyNumber={index + 1}
            crewNames={crewNamesByTripId[lane.trip.id] ?? []}
            legsById={legsById}
            timelineWindow={timelineWindow}
            occupancy={occupancy}
            isDragActive={isDragActive}
            onDropLeg={onDropLeg}
            onEditAssignment={onEditAssignment}
            onWaitRelease={onWaitRelease}
          />
        </Box>
      ))}
    </Box>
  );
};
