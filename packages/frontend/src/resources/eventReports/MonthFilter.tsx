import { useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import { useListContext } from 'react-admin';
import { addMonths, formatMonthLabel, isoMonth, monthEnd, monthStart, toIsoDate } from '../../utils/dates';
import { t } from '../../i18n/labels';

/**
 * Narrows the list to one calendar month, via the same `from`/`to` query
 * params the backend's date-range filter already accepts
 * (`EventReportsController`) — no different from how `TypeTabs` pushes
 * `type` into the same `filterValues`.
 *
 * Unset by default: this is a browsing list of history, not a calendar, so
 * it should not hide older reports until asked to. Stepping forward or back
 * while unset starts from the current month.
 */
export const MonthFilter = () => {
  const { filterValues, setFilters, displayedFilters } = useListContext();
  const [month, setMonth] = useState<string | null>(null);

  const applyMonth = (next: string | null) => {
    setMonth(next);
    const { from: _from, to: _to, ...rest } = filterValues;
    setFilters(
      next ? { ...rest, from: monthStart(next), to: monthEnd(next) } : rest,
      displayedFilters,
    );
  };

  const step = (delta: number) => {
    applyMonth(addMonths(month ?? isoMonth(toIsoDate(new Date())), delta));
  };

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        px: 0.5,
        gap: 0.25,
      }}
    >
      <IconButton size="small" aria-label={t('filter.previousMonth')} onClick={() => step(-1)}>
        <ChevronLeftIcon fontSize="small" />
      </IconButton>
      <Box
        sx={{
          minWidth: 128,
          textAlign: 'center',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: month ? 'text.primary' : 'text.secondary',
        }}
      >
        {month ? formatMonthLabel(month) : t('filter.allDates')}
      </Box>
      <IconButton size="small" aria-label={t('filter.nextMonth')} onClick={() => step(1)}>
        <ChevronRightIcon fontSize="small" />
      </IconButton>
      {month && (
        <Tooltip title={t('filter.clearMonth')}>
          <IconButton size="small" aria-label={t('filter.clearMonth')} onClick={() => applyMonth(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};
