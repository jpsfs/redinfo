import { Box, Chip, Tooltip, Typography } from '@mui/material';
import BadgeIcon from '@mui/icons-material/Badge';
import {
  AvailabilityWindowCategory,
  availabilityWindowCategoryLabel,
  AvailabilityWindowRole,
  formatRoleCapacity,
} from '@redinfo/shared';

/** One colour per rota, so a category is recognisable before it is read. */
const CATEGORY_COLOR: Record<
  AvailabilityWindowCategory,
  'error' | 'info' | 'secondary'
> = {
  [AvailabilityWindowCategory.EMERGENCY]: 'error',
  [AvailabilityWindowCategory.LOCAL_SUPPORT]: 'info',
  [AvailabilityWindowCategory.SALOP_SUPPORT]: 'secondary',
};

export const WindowCategoryChip = ({
  category,
  size = 'small',
}: {
  category?: AvailabilityWindowCategory | string | null;
  size?: 'small' | 'medium';
}) => {
  if (!category) return null;
  return (
    <Chip
      size={size}
      variant="outlined"
      color={CATEGORY_COLOR[category as AvailabilityWindowCategory] ?? 'default'}
      label={availabilityWindowCategoryLabel(category)}
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
