import { InputAdornment, Stack, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { VolunteerHoursReviewCounts, VolunteerHoursSource } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { CategoryChip } from '../../components/CategoryChip';
import { ReviewQueueFilters } from './useReviewQueue';

/** One combined key so the five chips stay mutually exclusive. */
type FilterKey = 'all' | 'NONE' | 'RAN_OVER' | 'POSSIBLY_LEFT_EARLY' | 'MANUAL';

function keyFor(filters: Pick<ReviewQueueFilters, 'flag' | 'source'>): FilterKey {
  if (filters.source === VolunteerHoursSource.MANUAL) return 'MANUAL';
  if (filters.flag) return filters.flag;
  return 'all';
}

export interface ReviewFiltersProps {
  filters: ReviewQueueFilters;
  counts: VolunteerHoursReviewCounts;
  onChange: (patch: Partial<ReviewQueueFilters>) => void;
}

/** Flag/source filter chips (each carrying its own count) plus the person/description search. */
export const ReviewFilters = ({ filters, counts, onChange }: ReviewFiltersProps) => {
  const t = useT();
  const active = keyFor(filters);

  const select = (key: FilterKey) => {
    if (key === 'MANUAL') onChange({ source: VolunteerHoursSource.MANUAL, flag: undefined });
    else if (key === 'all') onChange({ source: undefined, flag: undefined });
    else onChange({ source: undefined, flag: key });
  };

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ py: 1 }}>
      <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: { xs: 0.5, sm: 0 } }}>
        <CategoryChip
          label={t('volunteerHoursReview.filterAll', { count: counts.all })}
          selected={active === 'all'}
          onClick={() => select('all')}
        />
        <CategoryChip
          label={t('volunteerHoursReview.filterNoFlags', { count: counts.noFlags })}
          selected={active === 'NONE'}
          onClick={() => select('NONE')}
        />
        <CategoryChip
          category="EMERGENCY"
          label={t('volunteerHoursReview.filterRanOver', { count: counts.ranOver })}
          selected={active === 'RAN_OVER'}
          onClick={() => select('RAN_OVER')}
        />
        <CategoryChip
          label={t('volunteerHoursReview.filterPossiblyLeftEarly', { count: counts.possiblyLeftEarly })}
          selected={active === 'POSSIBLY_LEFT_EARLY'}
          onClick={() => select('POSSIBLY_LEFT_EARLY')}
        />
        <CategoryChip
          label={t('volunteerHoursReview.filterManual', { count: counts.manual })}
          selected={active === 'MANUAL'}
          onClick={() => select('MANUAL')}
        />
      </Stack>
      <TextField
        size="small"
        placeholder={t('volunteerHoursReview.searchPlaceholder')}
        value={filters.search}
        onChange={(e) => onChange({ search: e.target.value })}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ minWidth: 220 }}
      />
    </Stack>
  );
};
