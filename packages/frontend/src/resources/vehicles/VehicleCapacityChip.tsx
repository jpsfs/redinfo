import { useRecordContext } from 'react-admin';
import { Chip } from '@mui/material';
import { useT } from '../../i18n/useT';

interface VehicleCapacityRecord {
  seatedCapacity?: number;
  wheelchairPositions?: number;
  stretcherPositions?: number;
  hasRampOrLift?: boolean;
}

/**
 * Compact summary of #221's physical-configuration fields — e.g.
 * `4 lugares · ♿2 · 🛏1 · rampa`. Wheelchair/stretcher/ramp only show up
 * when the vehicle actually has them, so a plain van doesn't carry three
 * zero-badges around. Shared between `VehicleList` and `VehicleShow`.
 */
export const VehicleCapacityChip = () => {
  const t = useT();
  const record = useRecordContext<VehicleCapacityRecord>();
  if (!record) return null;

  const parts = [t('vehicleCapacity.seats', { count: record.seatedCapacity ?? 0 })];
  if (record.wheelchairPositions) parts.push(`♿${record.wheelchairPositions}`);
  if (record.stretcherPositions) parts.push(`🛏${record.stretcherPositions}`);
  if (record.hasRampOrLift) parts.push(t('vehicleCapacity.ramp'));

  return <Chip size="small" variant="outlined" label={parts.join(' · ')} />;
};
