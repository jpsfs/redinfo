import AccessibleIcon from '@mui/icons-material/Accessible';
import AirlineSeatFlatIcon from '@mui/icons-material/AirlineSeatFlat';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import { PatientMobility } from '@redinfo/shared';

/**
 * Mobility as an icon — the channel the redesign doc's §4 assigns it, so it
 * survives both greyscale (the crew sheet prints) and the narrow columns the
 * planning surfaces are made of.
 *
 * Shared by the timeline's passenger bars and the unassigned rail's cards:
 * before this the rail spelled the mobility out as a text chip
 * ("Cadeira de rodas"), which on a 280px card left a patient's name about ten
 * characters to be truncated into.
 */
export const MOBILITY_ICON = {
  [PatientMobility.STRETCHER]: AirlineSeatFlatIcon,
  [PatientMobility.WHEELCHAIR]: AccessibleIcon,
  [PatientMobility.AMBULATORY]: DirectionsWalkIcon,
};
