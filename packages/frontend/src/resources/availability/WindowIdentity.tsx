import { Box, Chip, Tooltip, Typography } from '@mui/material';
import BadgeIcon from '@mui/icons-material/Badge';
import {
  AvailabilityWindowCategory,
  availabilityWindowCategoryLabel,
  AvailabilityWindowRole,
  formatRoleCapacity,
} from '@redinfo/shared';
import { CategoryChip } from '../../components/CategoryChip';

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
  if (!category) return null;
  return (
    <CategoryChip
      category={category}
      label={availabilityWindowCategoryLabel(category)}
      size={size}
    />
  );
};

/**
 * The roles a window's schedule will be built from, read-only.
 *
 * Each carries what it may hold, because "Driver" alone does not say whether one
 * person or six may be assigned to it. The driver certification is called out
 * where it applies: it is a hard requirement on who may fill the role.
 */
export const WindowRoleChips = ({
  roles,
}: {
  roles?: AvailabilityWindowRole[] | null;
}) => {
  if (!roles || roles.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No roles — people are scheduled onto this window without one.
      </Typography>
    );
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      {roles.map((role) => {
        const label = `${role.name} · ${formatRoleCapacity(role.maxPeople)}`;
        return role.requiresDriverCertification ? (
          <Tooltip
            key={role.id}
            title="Only personnel with the driver certification can be assigned to this role."
          >
            <Chip
              size="small"
              variant="outlined"
              color="warning"
              icon={<BadgeIcon />}
              label={label}
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
