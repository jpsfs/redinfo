import { useCallback, useEffect, useMemo, useState } from 'react';
import { Title } from 'react-admin';
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { StaffAbsence, StaffAbsenceKind } from '@redinfo/shared';
import { apiFetch, ApiError } from '../api';
import { apiErrorLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';
import { dayOfMonth, formatMonthLabel, isoDateRange, isoMonth, monthEnd, monthStart, addMonths, toIsoDate, weekdayAbbreviation } from '../utils/dates';
import { StaffAbsenceDialog, StaffAbsenceDialogPerson } from './StaffAbsenceDialog';

interface StaffPerson {
  id: string;
  firstName: string;
  lastName: string;
}

/** Colours by kind — the calendar's own legend, independent of any other screen's palette. */
const KIND_STYLE: Record<StaffAbsenceKind, { bg: string; fg: string; border: string }> = {
  [StaffAbsenceKind.VACATION]: { bg: '#E3F2FD', fg: '#1565C0', border: '#90CAF9' },
  [StaffAbsenceKind.SICK_LEAVE]: { bg: '#FDECEA', fg: '#C62828', border: '#EF9A9A' },
  [StaffAbsenceKind.OTHER_PAID_LEAVE]: { bg: '#F3E5F5', fg: '#6A1B9A', border: '#CE93D8' },
};

const kindLabel = (t: (key: string) => string, kind: StaffAbsenceKind) => {
  switch (kind) {
    case StaffAbsenceKind.VACATION:
      return t('staffAbsences.kindVacation');
    case StaffAbsenceKind.SICK_LEAVE:
      return t('staffAbsences.kindSickLeave');
    case StaffAbsenceKind.OTHER_PAID_LEAVE:
    default:
      return t('staffAbsences.kindOtherPaidLeave');
  }
};

const Legend = () => {
  const t = useT();
  return (
    <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
      {Object.values(StaffAbsenceKind).map((kind) => (
        <Box key={kind} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: '3px',
              backgroundColor: KIND_STYLE[kind].bg,
              border: `1.5px solid ${KIND_STYLE[kind].border}`,
            }}
          />
          <Typography variant="caption" color="text.secondary">
            {kindLabel(t, kind)}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
};

/** Anchor/current within one person's row — the range a drag currently proposes. */
interface DragState {
  userId: string;
  anchor: string;
  current: string;
}

const NAME_COLUMN_WIDTH = 160;
const DAY_COLUMN_WIDTH = 34;

/**
 * Team-wide vacation/sick-leave/other-paid-leave calendar (#224) — people as
 * rows, days of the visible month as columns. Dragging across a row proposes
 * a new range (`StaffAbsenceDialog` confirms kind and notes); clicking an
 * existing block opens the same dialog to edit or delete it. Entitlement
 * balances, accrual and approval workflow are explicitly out of scope — see
 * the work item's "why".
 */
export const StaffAbsencesPage = () => {
  const t = useT();

  const [month, setMonth] = useState(() => isoMonth(toIsoDate(new Date())));
  const [people, setPeople] = useState<StaffPerson[] | null>(null);
  const [absences, setAbsences] = useState<StaffAbsence[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dialog, setDialog] = useState<{
    person: StaffAbsenceDialogPerson;
    startDate: string;
    endDate: string;
    existing?: StaffAbsence;
  } | null>(null);

  useEffect(() => {
    apiFetch<{ data: StaffPerson[] }>('/users?perPage=500&isActive=true')
      .then((response) => setPeople(response.data))
      .catch((e) => setError(e instanceof ApiError ? apiErrorLabel(t, e) : t('staffAbsences.loadFailed')));
    // Only once: the roster of staff does not change with the visible month.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAbsences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = monthStart(month);
      const to = monthEnd(month);
      setAbsences(await apiFetch<StaffAbsence[]>(`/staff-absences?from=${from}&to=${to}`));
    } catch (e) {
      setError(e instanceof ApiError ? apiErrorLabel(t, e) : t('staffAbsences.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [month, t]);

  useEffect(() => {
    void loadAbsences();
  }, [loadAbsences]);

  const days = useMemo(() => isoDateRange(monthStart(month), monthEnd(month)), [month]);

  /** `userId#date` → the absence covering that cell, clamped to the visible month. */
  const absenceByCell = useMemo(() => {
    const map = new Map<string, StaffAbsence>();
    for (const absence of absences ?? []) {
      const from = absence.startDate > monthStart(month) ? absence.startDate : monthStart(month);
      const to = absence.endDate < monthEnd(month) ? absence.endDate : monthEnd(month);
      for (const date of isoDateRange(from, to)) {
        map.set(`${absence.userId}#${date}`, absence);
      }
    }
    return map;
  }, [absences, month]);

  // A release outside any cell (dragged past the table's edge) still has to
  // end the drag, so this listens on the window rather than the table.
  useEffect(() => {
    if (!drag) return undefined;
    const handleUp = () => {
      const person = people?.find((candidate) => candidate.id === drag.userId);
      if (person) {
        setDialog({
          person,
          startDate: drag.anchor <= drag.current ? drag.anchor : drag.current,
          endDate: drag.anchor <= drag.current ? drag.current : drag.anchor,
        });
      }
      setDrag(null);
    };
    window.addEventListener('mouseup', handleUp);
    return () => window.removeEventListener('mouseup', handleUp);
  }, [drag, people]);

  const handleCellMouseDown = (person: StaffPerson, date: string) => {
    const existing = absenceByCell.get(`${person.id}#${date}`);
    if (existing) {
      setDialog({ person, startDate: existing.startDate, endDate: existing.endDate, existing });
      return;
    }
    setDrag({ userId: person.id, anchor: date, current: date });
  };

  const handleCellMouseEnter = (userId: string, date: string) => {
    setDrag((current) => (current && current.userId === userId ? { ...current, current: date } : current));
  };

  if (loading && !absences) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title={t('staffAbsences.pageTitle')} />
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Title title={t('staffAbsences.pageTitle')} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="h5">{t('staffAbsences.heading')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('staffAbsences.subheading')}
        </Typography>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Legend />

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {t('staffAbsences.dragHint')}
      </Typography>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          p: 1,
          mb: 1,
        }}
      >
        <IconButton size="small" aria-label={t('staffAbsences.prevMonth')} onClick={() => setMonth((m) => addMonths(m, -1))}>
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="subtitle1" sx={{ minWidth: 170, textAlign: 'center' }}>
          {formatMonthLabel(t, month)}
        </Typography>
        <IconButton size="small" aria-label={t('staffAbsences.nextMonth')} onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRightIcon />
        </IconButton>
      </Box>

      {people && people.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('staffAbsences.noPeople')}
        </Typography>
      )}

      {people && people.length > 0 && (
        // The CSS Grid wrapper (rather than a plain flex Box) is what keeps a
        // month's worth of day columns from bubbling their intrinsic width up
        // through react-admin's own layout chrome and forcing a page-level
        // horizontal scrollbar at tablet width — only the TableContainer
        // below should ever scroll sideways.
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto', minWidth: 0 }}>
            <Table size="small" sx={{ userSelect: 'none' }}>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'grey.100' }}>
                  <TableCell
                    sx={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 2,
                      backgroundColor: 'grey.100',
                      minWidth: NAME_COLUMN_WIDTH,
                    }}
                  />
                  {days.map((date) => (
                    <TableCell
                      key={date}
                      align="center"
                      sx={{ minWidth: DAY_COLUMN_WIDTH, maxWidth: DAY_COLUMN_WIDTH, px: 0.5 }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                        {dayOfMonth(date)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9.5 }}>
                        {weekdayAbbreviation(t, new Date(`${date}T00:00:00.000Z`).getUTCDay())}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {people.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell
                      sx={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        backgroundColor: 'background.paper',
                        minWidth: NAME_COLUMN_WIDTH,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Typography variant="body2">
                        {person.firstName} {person.lastName}
                      </Typography>
                    </TableCell>
                    {days.map((date) => {
                      const absence = absenceByCell.get(`${person.id}#${date}`);
                      const inDrag =
                        drag &&
                        drag.userId === person.id &&
                        date >= (drag.anchor <= drag.current ? drag.anchor : drag.current) &&
                        date <= (drag.anchor <= drag.current ? drag.current : drag.anchor);
                      const style = absence ? KIND_STYLE[absence.kind] : null;
                      const cell = (
                        <TableCell
                          key={date}
                          align="center"
                          data-testid={`absence-cell-${person.id}-${date}`}
                          onMouseDown={() => handleCellMouseDown(person, date)}
                          onMouseEnter={() => handleCellMouseEnter(person.id, date)}
                          sx={{
                            cursor: 'pointer',
                            minWidth: DAY_COLUMN_WIDTH,
                            maxWidth: DAY_COLUMN_WIDTH,
                            height: 32,
                            p: 0,
                            backgroundColor: style ? style.bg : inDrag ? 'action.selected' : undefined,
                            border: style ? `1.5px solid ${style.border}` : undefined,
                          }}
                        />
                      );
                      return absence ? (
                        <Tooltip
                          key={date}
                          title={`${kindLabel(t, absence.kind)}${absence.notes ? ` — ${absence.notes}` : ''}`}
                        >
                          {cell}
                        </Tooltip>
                      ) : (
                        cell
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {dialog && (
        <StaffAbsenceDialog
          open
          person={dialog.person}
          startDate={dialog.startDate}
          endDate={dialog.endDate}
          existing={dialog.existing}
          onClose={() => setDialog(null)}
          onSaved={() => void loadAbsences()}
        />
      )}
    </Box>
  );
};
