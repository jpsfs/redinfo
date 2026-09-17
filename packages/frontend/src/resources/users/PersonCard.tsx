import { Chip, Paper, Stack, Typography } from '@mui/material';
import { User } from '@redinfo/shared';
import { PersonAvatar } from '../../components/PersonAvatar';
import { CertificationBadge } from '../../components/CertificationBadge';
import { accountRoleLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';

/**
 * One person, as a stacked card — the mobile replacement for a row of the
 * desktop `Datagrid` on `/users` (the personnel registry). Same fields as
 * the table, laid out for a thumb rather than a cursor, in the same shape as
 * `MaterialItemCard`.
 */
export const PersonCard = ({ person, onOpen }: { person: User; onOpen: () => void }) => {
  const t = useT();
  const initials = `${person.firstName[0] ?? ''}${person.lastName[0] ?? ''}`.toUpperCase();

  return (
    <Paper variant="outlined" onClick={onOpen} sx={{ p: 2, cursor: 'pointer' }}>
      <Stack direction="row" spacing={1.5}>
        <PersonAvatar userId={person.id} hasPhoto={Boolean(person.hasPhoto)} initials={initials} size={44} />
        <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography sx={{ fontWeight: 700 }}>
              {person.firstName} {person.lastName}
            </Typography>
            {!person.isActive && (
              <Chip size="small" variant="outlined" color="error" label={t('personnelList.inactive')} />
            )}
          </Stack>

          <Typography
            variant="body2"
            sx={{ color: person.isActiveEmergencyOperational ? 'success.dark' : 'text.secondary', fontWeight: 600 }}
          >
            {person.isActiveEmergencyOperational ? t('profile.operational') : t('profile.notOperational')}
          </Typography>

          {person.roles && person.roles.length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {person.roles.map((role) => (
                <Chip key={role} size="small" label={accountRoleLabel(t, role)} />
              ))}
            </Stack>
          )}

          {person.certifications && person.certifications.length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {person.certifications.map((cert) => (
                <CertificationBadge key={cert.id} type={cert.type} validUntil={cert.validUntil} />
              ))}
            </Stack>
          )}

          {(person.redCrossNumber || person.volunteerNumber) && (
            <Typography variant="caption" color="text.secondary">
              {[person.redCrossNumber, person.volunteerNumber].filter(Boolean).join(' · ')}
            </Typography>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
};
