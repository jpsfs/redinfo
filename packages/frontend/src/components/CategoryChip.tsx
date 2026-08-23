import { Chip, ChipProps } from '@mui/material';
import {
  colorCategoryEmergency,
  colorCategoryLocalSupport,
  colorCategorySalopSupport,
  colorGrey700,
} from '../layout/design-tokens';

/**
 * One color per activity category. `EventReportType` and
 * `AvailabilityWindowCategory` are deliberately the same three string values
 * (see the doc comment on `EventReportType` in `@redinfo/shared`), so one map
 * — keyed by that shared value — colors both: event reports, schedules, and
 * availability windows all read the same color for "EMERGENCY".
 */
const CATEGORY_COLOR: Record<string, string> = {
  EMERGENCY: colorCategoryEmergency,
  LOCAL_SUPPORT: colorCategoryLocalSupport,
  SALOP_SUPPORT: colorCategorySalopSupport,
};

/** The category's color, or a neutral grey for anything unrecognised. */
export function categoryColor(category?: string | null): string {
  return (category && CATEGORY_COLOR[category]) || colorGrey700;
}

export interface CategoryChipProps extends Omit<ChipProps, 'color' | 'variant' | 'label'> {
  category?: string | null;
  label: string;
  /** Filled in the category's color rather than outlined — an active filter, a chosen type. */
  selected?: boolean;
}

/**
 * A chip colored by activity category, recognisable before it's read.
 *
 * Outlined and colored by default (a row's type, a card's badge); pass
 * `selected` for a filled, high-contrast state (an active filter chip).
 */
export const CategoryChip = ({
  category,
  label,
  selected = false,
  sx,
  ...rest
}: CategoryChipProps) => {
  const color = categoryColor(category);
  return (
    <Chip
      label={label}
      variant={selected ? 'filled' : 'outlined'}
      sx={[
        selected
          ? { bgcolor: color, borderColor: color, color: '#fff', fontWeight: 600 }
          : { color, borderColor: color, fontWeight: 500 },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
      {...rest}
    />
  );
};
