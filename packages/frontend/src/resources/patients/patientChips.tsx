import { Chip } from '@mui/material';
import { PatientMobility } from '@redinfo/shared';
import { useT } from '../../i18n/useT';

/** The mobility profile, rendered as a chip — same at-a-glance shape as
 * `FlagChip` on `/facilities`. Shared by the list, the show page and the mobile card. */
export const MobilityChip = ({ value }: { value: PatientMobility }) => {
  const t = useT();
  return <Chip size="small" label={t(`patientMobility.${value}`)} />;
};

/** `active` is optional only because `PatientInput.isActive` is (a PATCH may
 * omit it); the API always sends a concrete value on a real record, and the
 * schema default is `true`, so that's what a missing value renders as. */
export const StatusChip = ({ active }: { active?: boolean }) => {
  const t = useT();
  const isActive = active ?? true;
  return (
    <Chip
      size="small"
      variant="outlined"
      color={isActive ? 'success' : 'default'}
      label={isActive ? t('patientList.active') : t('patientList.retired')}
    />
  );
};
