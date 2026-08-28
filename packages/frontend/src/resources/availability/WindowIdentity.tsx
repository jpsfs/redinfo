import { Box, Chip, Tooltip, Typography } from '@mui/material';
import BadgeIcon from '@mui/icons-material/Badge';
import {
  AvailabilityWindowCategory,
  AvailabilityWindowRole,
  AvailabilityWindowStatus,
  formatRoleCapacity,
} from '@redinfo/shared';
import { CategoryChip } from '../../components/CategoryChip';
import { certificationLabel, windowCategoryLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';

/** Whether a window is still collecting answers, colour-coded to skim at a glance. */
export const WindowStatusChip = ({ status }: { status?: string }) => {
  const t = useT();
  return status === AvailabilityWindowStatus.OPEN ? (
    <Chip size="small" label={t('windowList.statusOpen')} color="success" variant="outlined" />
  ) : (
    <Chip size="small" label={t('windowList.statusClosed')} variant="outlined" />
  );
};

/**
 * A rota's category, colored so it's recognisable before it's read.
 *
 * `AvailabilityWindowCategory` is deliberately the same three values as
 * `EventReportType` (see the doc comment on `EventReportType` in
 * `@redinfo/shared`), so this shares its color mapping with event reports —
 * `CategoryChip` in `components/CategoryChip.tsx` is the one place it's
 * defined.
 */
export const WindowCategoryChip = ({
  category,
  size = 'small',
}: {
  category?: AvailabilityWindowCategory | string | null;
  size?: 'small' | 'medium';
}) => {
  const t = useT();
  if (!category) return null;
  return (
    <CategoryChip
      category={category}
      label={windowCategoryLabel(t, category)}
      size={size}
    />
  );
};

/**
 * The roles a window's schedule will be built from, read-only.
 *
 * Each carries what it may hold, because "Driver" alone does not say whether one
 * person or six may be assigned to it. The required certification is called out
 * where the role has one — enforceable when building the schedule, but not
 * absolute: a coordinator may still assign someone who lacks it, with a reason.
 */
export const WindowRoleChips = ({
  roles,
}: {
  roles?: AvailabilityWindowRole[] | null;
}) => {
  const t = useT();
  if (!roles || roles.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t('windowRole.none')}
      </Typography>
    );
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      {roles.map((role) => {
        const label = `${role.name} · ${formatRoleCapacity(role.maxPeople)}`;
        const certLabel = role.requiredCertification
          ? certificationLabel(t, role.requiredCertification)
          : null;
        return role.requiredCertification ? (
          <Tooltip
            key={role.id}
            title={t('windowRole.requiresTooltip', { certification: certLabel })}
          >
            <Chip
              size="small"
              variant="outlined"
              color="warning"
              icon={<BadgeIcon />}
              label={`${label} · ${certLabel}`}
            />
          </Tooltip>
        ) : (
          <Chip key={role.id} size="small" variant="outlined" label={label} />
        );
      })}
    </Box>
  );
};

/**
 * A window's category and name together, for screens whose subject is the
 * window's dates: present enough to tell two windows apart, quiet enough not to
 * compete with them.
 */
export const WindowIdentity = ({
  category,
  name,
}: {
  category?: AvailabilityWindowCategory | string | null;
  name?: string | null;
}) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
    <WindowCategoryChip category={category} />
    {name && (
      <Typography variant="body2" color="text.secondary">
        {name}
      </Typography>
    )}
  </Box>
);
