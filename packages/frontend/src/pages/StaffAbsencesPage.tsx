import { useCallback, useEffect, useMemo, useState } from 'react';
import { Title } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FlagIcon from '@mui/icons-material/Flag';
import { DayShiftPattern, StaffAbsence, StaffAbsenceKind, staffAbsenceRangesOverlap } from '@redinfo/shared';
import { apiFetch, ApiError } from '../api';
import { apiErrorLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  dayOfMonth,
  formatDateRange,
  formatMonthLabel,
  isoDateRange,
  isoMonth,
  monthEnd,
  monthStart,
  addMonths,
  toIsoDate,
  weekdayAbbreviation,
} from '../utils/dates';
import { StaffAbsenceDialog, StaffAbsenceDialogPerson } from './StaffAbsenceDialog';

interface StaffPerson {
  id: string;
  firstName: string;
  lastName: string;
}

type DialogState = {
  person?: StaffAbsenceDialogPerson;
  startDate: string;
  endDate: string;
  existing?: StaffAbsence;
};

/** Colours by kind — the calendar's own legend, independent of any other screen's palette. */
const KIND_STYLE: Record<StaffAbsenceKind, { bg: string; fg: string; border: string }> = {
  [StaffAbsenceKind.VACATION]: { bg: '#E3F2FD', fg: '#1565C0', border: '#90CAF9' },
  [StaffAbsenceKind.SICK_LEAVE]: { bg: '#FDECEA', fg: '#C62828', border: '#EF9A9A' },
  [StaffAbsenceKind.OTHER_PAID_LEAVE]: { bg: '#F3E5F5', fg: '#6A1B9A', border: '#CE93D8' },
};

/** Weekends and holidays get their own tint, same convention as `MyAvailabilityPage`'s calendar. */
const WEEKEND_BG = 'grey.50';
const HOLIDAY_BG = '#FFF8EE';

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

/** `" (09:00–11:00)"` for the rare partial-day absence, otherwise nothing — full day needs no suffix. */
const timeSuffix = (absence: Pick<StaffAbsence, 'startTime' | 'endTime'>) =>
  absence.startTime && absence.endTime ? ` (${absence.startTime}–${absence.endTime})` : '';

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

const MonthNav = ({ month, onChange }: { month: string; onChange: (month: string) => void }) => {
  const t = useT();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, p: 1, mb: 1 }}>
      <IconButton size="small" aria-label={t('staffAbsences.prevMonth')} onClick={() => onChange(addMonths(month, -1))}>
        <ChevronLeftIcon />
      </IconButton>
      <Typography variant="subtitle1" sx={{ minWidth: 170, textAlign: 'center' }}>
        {formatMonthLabel(t, month)}
      </Typography>
      <IconButton size="small" aria-label={t('staffAbsences.nextMonth')} onClick={() => onChange(addMonths(month, 1))}>
        <ChevronRightIcon />
      </IconButton>
    </Box>
  );
};

/** Anchor cell of a click-to-select range in progress — the first of two taps. */
interface PendingSelection {
  userId: string;
  anchorDate: string;
}

const NAME_COLUMN_WIDTH = 160;
const DAY_COLUMN_WIDTH = 34;

// ─── Desktop grid ────────────────────────────────────────────────────────────

const DesktopGrid = ({
  people,
  days,
  dayPatterns,
  absenceByCell,
  pending,
  onCellClick,
}: {
  people: StaffPerson[];
  days: string[];
  dayPatterns: Map<string, DayShiftPattern>;
  absenceByCell: Map<string, StaffAbsence>;
  pending: PendingSelection | null;
  onCellClick: (person: StaffPerson, date: string) => void;
}) => {
  const t = useT();

  const dayBg = (date: string) => {
    const pattern = dayPatterns.get(date);
    if (pattern?.isHoliday) return HOLIDAY_BG;
    if (pattern?.isWeekend) return WEEKEND_BG;
    return undefined;
  };

  return (
    // The CSS Grid wrapper (rather than a plain flex Box) is what keeps a
    // month's worth of day columns from bubbling their intrinsic width up
    // through react-admin's own layout chrome and forcing a page-level
    // horizontal scrollbar at tablet width — only the TableContainer below
    // should ever scroll sideways.
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto', minWidth: 0 }}>
        <Table size="small" sx={{ userSelect: 'none' }}>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'grey.100' }}>
              <TableCell
                sx={{ position: 'sticky', left: 0, zIndex: 2, backgroundColor: 'grey.100', minWidth: NAME_COLUMN_WIDTH }}
              />
              {days.map((date) => {
                const pattern = dayPatterns.get(date);
                return (
                  <TableCell
                    key={date}
                    align="center"
                    sx={{
                      minWidth: DAY_COLUMN_WIDTH,
                      maxWidth: DAY_COLUMN_WIDTH,
                      px: 0.5,
                      backgroundColor: dayBg(date) ?? 'grey.100',
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                      {dayOfMonth(date)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9.5 }}>
                      {weekdayAbbreviation(t, new Date(`${date}T00:00:00.000Z`).getUTCDay())}
                    </Typography>
                    {pattern?.isHoliday && (
                      <FlagIcon
                        sx={{ fontSize: 11, color: 'warning.main', display: 'block', mx: 'auto' }}
                        titleAccess={pattern.holidayName ? t('dayType.holidayNamed', { name: pattern.holidayName }) : t('dayType.holiday')}
                      />
                    )}
                  </TableCell>
                );
              })}
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
                  const isAnchor = pending?.userId === person.id && pending.anchorDate === date;
                  const style = absence ? KIND_STYLE[absence.kind] : null;
                  const cell = (
                    <TableCell
                      key={date}
                      align="center"
                      data-testid={`absence-cell-${person.id}-${date}`}
                      onClick={() => onCellClick(person, date)}
                      sx={{
                        cursor: 'pointer',
                        minWidth: DAY_COLUMN_WIDTH,
                        maxWidth: DAY_COLUMN_WIDTH,
                        height: 32,
                        p: 0,
                        backgroundColor: style ? style.bg : (dayBg(date) ?? undefined),
                        border: style
                          ? `1.5px solid ${style.border}`
                          : isAnchor
                            ? '1.5px dashed'
                            : undefined,
                        borderColor: isAnchor && !style ? 'primary.main' : undefined,
                      }}
                    />
                  );
                  return absence ? (
                    <Tooltip
                      key={date}
                      title={`${kindLabel(t, absence.kind)}${timeSuffix(absence)}${absence.notes ? ` — ${absence.notes}` : ''}`}
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
  );
};

// ─── Mobile list ─────────────────────────────────────────────────────────────

const MobileList = ({
  people,
  absencesByUser,
  onAdd,
  onEdit,
}: {
  people: StaffPerson[];
  absencesByUser: Map<string, StaffAbsence[]>;
  onAdd: (person: StaffPerson) => void;
  onEdit: (person: StaffPerson, absence: StaffAbsence) => void;
}) => {
  const t = useT();
  return (
    <Stack spacing={1}>
      {people.map((person) => {
        const personAbsences = absencesByUser.get(person.id) ?? [];
        return (
          <Card key={person.id} variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {person.firstName} {person.lastName}
                </Typography>
                <IconButton
                  size="small"
                  aria-label={`${t('staffAbsences.addAbsence')}: ${person.firstName} ${person.lastName}`}
                  onClick={() => onAdd(person)}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Stack>
              {personAbsences.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  {t('staffAbsences.noneThisMonth')}
                </Typography>
              ) : (
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                  {personAbsences.map((absence) => (
                    <Chip
                      key={absence.id}
                      size="small"
                      onClick={() => onEdit(person, absence)}
                      label={`${kindLabel(t, absence.kind)}${timeSuffix(absence)} · ${formatDateRange(t, absence.startDate, absence.endDate)}`}
                      sx={{
                        backgroundColor: KIND_STYLE[absence.kind].bg,
                        color: KIND_STYLE[absence.kind].fg,
                        border: `1px solid ${KIND_STYLE[absence.kind].border}`,
                      }}
                    />
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────────────

/**
 * Team-wide vacation/sick-leave/other-paid-leave calendar (#224) — people as
 * rows, days of the visible month as columns on desktop; a card per person
 * with their absences as chips on mobile, where a month-wide grid would be
 * unusable. Either way, clicking through opens `StaffAbsenceDialog` for kind,
 * range and notes. Entitlement balances, accrual and approval workflow are
 * explicitly out of scope — see the work item's "why".
 */
export const StaffAbsencesPage = () => {
  const t = useT();
  const isMobile = useIsMobile();

  const [month, setMonth] = useState(() => isoMonth(toIsoDate(new Date())));
  const [people, setPeople] = useState<StaffPerson[] | null>(null);
  const [absences, setAbsences] = useState<StaffAbsence[] | null>(null);
  const [dayPatterns, setDayPatterns] = useState<Map<string, DayShiftPattern>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

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

  // Weekend/holiday flags only, off the same calendar the availability
  // screens use — no reason to keep a second copy of the holiday table.
  useEffect(() => {
    let cancelled = false;
    apiFetch<DayShiftPattern[]>(`/availability/calendar?from=${monthStart(month)}&to=${monthEnd(month)}`)
      .then((rows) => {
        if (!cancelled) setDayPatterns(new Map(rows.map((row) => [row.date, row])));
      })
      .catch(() => {
        if (!cancelled) setDayPatterns(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

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

  const absencesByUser = useMemo(() => {
    const map = new Map<string, StaffAbsence[]>();
    for (const absence of absences ?? []) {
      if (!staffAbsenceRangesOverlap(absence.startDate, absence.endDate, monthStart(month), monthEnd(month))) continue;
      const forUser = map.get(absence.userId);
      if (forUser) forUser.push(absence);
      else map.set(absence.userId, [absence]);
    }
    return map;
  }, [absences, month]);

  const openEdit = (person: StaffPerson, absence: StaffAbsence) => {
    setPending(null);
    setDialog({ person, startDate: absence.startDate, endDate: absence.endDate, existing: absence });
  };

  const openAdd = (person: StaffPerson, date?: string) => {
    const today = toIsoDate(new Date());
    setPending(null);
    setDialog({ person, startDate: date ?? today, endDate: date ?? today });
  };

  /**
   * Two clicks make a range: the first sets the anchor, the second (on the
   * same row) opens the dialog with both ends filled in — no drag gesture
   * required, so this works identically with a mouse or a finger. Clicking
   * the anchor again cancels it; clicking a different row restarts on that
   * row instead of erroring.
   */
  const handleCellClick = (person: StaffPerson, date: string) => {
    const existing = absenceByCell.get(`${person.id}#${date}`);
    if (existing) {
      openEdit(person, existing);
      return;
    }
    if (pending && pending.userId === person.id) {
      if (pending.anchorDate === date) {
        setPending(null);
        return;
      }
      const startDate = pending.anchorDate <= date ? pending.anchorDate : date;
      const endDate = pending.anchorDate <= date ? date : pending.anchorDate;
      setPending(null);
      setDialog({ person, startDate, endDate });
      return;
    }
    setPending({ userId: person.id, anchorDate: date });
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

      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5">{t('staffAbsences.heading')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('staffAbsences.subheading')}
          </Typography>
        </Box>
        {!isMobile && people && people.length > 0 && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => {
              const today = toIsoDate(new Date());
              setPending(null);
              setDialog({ startDate: today, endDate: today });
            }}
            sx={{ flexShrink: 0 }}
          >
            {t('staffAbsences.addAbsence')}
          </Button>
        )}
      </Stack>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Legend />

      {!isMobile && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {pending ? t('staffAbsences.selectHintPending') : t('staffAbsences.selectHint')}
        </Typography>
      )}

      <MonthNav month={month} onChange={setMonth} />

      {people && people.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('staffAbsences.noPeople')}
        </Typography>
      )}

      {people && people.length > 0 && isMobile && (
        <MobileList
          people={people}
          absencesByUser={absencesByUser}
          onAdd={(person) => openAdd(person)}
          onEdit={openEdit}
        />
      )}

      {people && people.length > 0 && !isMobile && (
        <DesktopGrid
          people={people}
          days={days}
          dayPatterns={dayPatterns}
          absenceByCell={absenceByCell}
          pending={pending}
          onCellClick={handleCellClick}
        />
      )}

      {dialog && (
        <StaffAbsenceDialog
          open
          person={dialog.person}
          people={people ?? []}
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
