import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
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
import DownloadIcon from '@mui/icons-material/Download';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import {
  AvailabilityMatrixDay,
  AvailabilityMatrixPerson,
  AvailabilityMatrixResponse,
  AvailabilityMatrixShiftCell,
  AvailabilityWindowStatus,
  CoverageLevel,
  SHIFT_MAX_PEOPLE,
} from '@redinfo/shared';
import { apiDownload, apiFetch } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatDayLabel, formatDateRange } from '../../utils/dates';
import { WindowIdentity } from './WindowIdentity';

/**
 * Coverage colours, straight from the design. The level itself is computed
 * server-side (`coverageLevel()` in @redinfo/shared) and only rendered here, so
 * the rule cannot drift between the API, the CSV export and this table.
 */
const COVERAGE_STYLE: Record<CoverageLevel, { bg: string; fg: string; border: string }> = {
  green: { bg: '#E8F5E9', fg: '#2E7D32', border: '#A5D6A7' },
  yellow: { bg: '#FFF4E5', fg: '#B26A00', border: '#F5C186' },
  red: { bg: '#FDECEA', fg: '#C62828', border: '#EF9A9A' },
};

/**
 * One column of the desktop table: a distinct set of shift hours somewhere in
 * the window. Days carry their own shifts, so the columns are whatever times
 * the window actually uses rather than a fixed list.
 */
interface ShiftColumn {
  key: string;
  label: string;
  startMinute: number;
  endMinute: number;
}

const shiftKey = (shift: { startMinute: number; endMinute: number }) =>
  `${shift.startMinute}-${shift.endMinute}`;

/**
 * Past this many distinct shift times the table is wider than it is readable,
 * so the day-card layout takes over — the same one mobile gets.
 */
const MAX_TABLE_COLUMNS = 6;

const CAPACITY_NOTE =
  `A scheduled shift holds at most ${SHIFT_MAX_PEOPLE} people, and every vehicle it ` +
  'needs has to have a driver — this matrix shows everyone who is available, not who ' +
  'ends up scheduled.';

const REMINDER_TOOLTIP =
  'Reminders need a notification channel (email/SMS), which this system does not have yet.';

interface SelectedCell {
  date: string;
  /** Slot within its own day — only unique together with the date. */
  slot: number;
}

// ─── Small pieces ──────────────────────────────────────────────────────────────

/** e.g. "2 vehicles needed", "no vehicle needed". */
const describeVehicles = (vehiclesNeeded: number) =>
  vehiclesNeeded === 0
    ? 'no vehicle needed'
    : `${vehiclesNeeded} vehicle${vehiclesNeeded === 1 ? '' : 's'} needed`;

const CoveragePill = ({
  cell,
  selected,
  onClick,
}: {
  cell: AvailabilityMatrixShiftCell;
  selected?: boolean;
  onClick?: () => void;
}) => {
  const style = COVERAGE_STYLE[cell.coverageLevel];
  return (
    <Tooltip
      title={`${cell.availableCount} available, ${cell.driverCount} driver${
        cell.driverCount === 1 ? '' : 's'
      }, ${describeVehicles(cell.vehiclesNeeded)}`}
    >
      <Box
        component={onClick ? 'button' : 'span'}
        onClick={onClick}
        aria-label={
          `${cell.label}: ${cell.availableCount} available, ${cell.driverCount} drivers, ` +
          `${describeVehicles(cell.vehiclesNeeded)}, ${cell.coverageLevel}`
        }
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 32,
          height: 32,
          px: 1,
          borderRadius: 16,
          fontSize: 14,
          fontWeight: 700,
          cursor: onClick ? 'pointer' : 'default',
          backgroundColor: style.bg,
          color: style.fg,
          border: `1.5px solid ${style.border}`,
          ...(selected
            ? { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px' }
            : {}),
        }}
      >
        {cell.availableCount}
      </Box>
    </Tooltip>
  );
};

/**
 * Drivers available for one shift, against the vehicles it needs: short of that
 * count the shift cannot run in full, however many people are free.
 */
const DriverBadge = ({
  count,
  vehiclesNeeded,
}: {
  count: number;
  vehiclesNeeded: number;
}) => (
  <Tooltip
    title={`${count} certified driver${count === 1 ? '' : 's'} available, ${describeVehicles(
      vehiclesNeeded,
    )}`}
  >
    <Chip
      size="small"
      icon={<DirectionsCarIcon fontSize="small" />}
      label={vehiclesNeeded > 0 ? `${count}/${vehiclesNeeded}` : count}
      variant="outlined"
      color={
        vehiclesNeeded === 0
          ? 'default'
          : count === 0
            ? 'error'
            : count < vehiclesNeeded
              ? 'warning'
              : 'success'
      }
      sx={{ height: 22, '& .MuiChip-label': { px: 0.75, fontWeight: 700 } }}
    />
  </Tooltip>
);

const PersonChip = ({ person }: { person: AvailabilityMatrixPerson }) => (
  <Chip
    size="small"
    label={`${person.firstName} ${person.lastName}`}
    {...(person.isDriver
      ? { icon: <DirectionsCarIcon fontSize="small" />, color: 'success' as const }
      : {})}
    variant="outlined"
  />
);

const DayBadges = ({ day }: { day: AvailabilityMatrixDay }) => (
  <>
    {day.isHoliday && (
      <Chip
        size="small"
        color="warning"
        variant="outlined"
        label={day.holidayName ? `Holiday · ${day.holidayName}` : 'Holiday'}
      />
    )}
    {day.isWeekend && !day.isHoliday && <Chip size="small" variant="outlined" label="Weekend" />}
  </>
);

const CoverageLegend = () => (
  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
    {(
      [
        ['red', 'Fewer than 2 available, or no driver for a vehicle'],
        ['yellow', 'Some cover, but not a driver for every vehicle'],
        ['green', `${SHIFT_MAX_PEOPLE}+ available, one driver per vehicle`],
      ] as const
    ).map(([level, label]) => (
      <Box key={level} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: COVERAGE_STYLE[level].fg,
          }}
        />
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Box>
    ))}
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <DirectionsCarIcon fontSize="small" sx={{ color: 'text.secondary' }} />
      <Typography variant="caption" color="text.secondary">
        Drivers available / vehicles needed
      </Typography>
    </Box>
  </Stack>
);

const ResponseStat = ({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) => (
  <Paper variant="outlined" sx={{ px: 2, py: 1, display: 'flex', alignItems: 'baseline', gap: 1 }}>
    <Typography variant="h5" sx={{ fontWeight: 700, color }}>
      {value}
    </Typography>
    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
      {label}
    </Typography>
  </Paper>
);

const FollowUpCard = ({
  title,
  people,
  action,
}: {
  title: string;
  people: AvailabilityMatrixPerson[];
  action?: React.ReactNode;
}) => (
  <Card variant="outlined" sx={{ flex: 1, minWidth: 240 }}>
    <CardContent>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mb: 1,
        }}
      >
        <Typography variant="subtitle2">
          {title} ({people.length})
        </Typography>
        {action}
      </Box>
      {people.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nobody.
        </Typography>
      ) : (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {people.map((person) => (
            <PersonChip key={person.id} person={person} />
          ))}
        </Stack>
      )}
    </CardContent>
  </Card>
);

// ─── Desktop table ─────────────────────────────────────────────────────────────

const DesktopMatrix = ({
  matrix,
  columns,
  selected,
  onSelect,
}: {
  matrix: AvailabilityMatrixResponse;
  columns: ShiftColumn[];
  selected: SelectedCell | null;
  onSelect: (cell: SelectedCell | null) => void;
}) => (
  <TableContainer component={Paper} variant="outlined">
    <Table size="small">
      <TableHead>
        <TableRow sx={{ backgroundColor: 'grey.100' }}>
          <TableCell sx={{ minWidth: 190 }}>
            <strong>Date</strong>
          </TableCell>
          {columns.map((column) => (
            <TableCell key={column.key}>
              <strong>{column.label}</strong>
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {matrix.days.map((day) => (
          <TableRow
            key={day.date}
            sx={{
              backgroundColor: day.isHoliday
                ? 'rgba(245,124,0,0.05)'
                : day.isWeekend
                  ? 'rgba(0,0,0,0.015)'
                  : 'inherit',
            }}
          >
            <TableCell>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {formatDayLabel(day.date)}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                <DayBadges day={day} />
              </Stack>
            </TableCell>
            {columns.map((column) => {
              // Matched on the hours, not the slot: slot 1 is 20:00–24:00 on one
              // day and 08:00–16:00 on another, so slots are not columns.
              const cell = day.shifts.find((shift) => shiftKey(shift) === column.key);
              if (!cell) {
                return (
                  <TableCell key={column.key}>
                    <Typography component="span" color="text.disabled">
                      —
                    </Typography>
                  </TableCell>
                );
              }
              const isSelected =
                selected?.date === day.date && selected?.slot === cell.slot;
              return (
                <TableCell key={column.key}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <CoveragePill
                      cell={cell}
                      selected={isSelected}
                      onClick={() =>
                        onSelect(isSelected ? null : { date: day.date, slot: cell.slot })
                      }
                    />
                    <DriverBadge count={cell.driverCount} vehiclesNeeded={cell.vehiclesNeeded} />
                  </Box>
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
);

// ─── Mobile day cards ──────────────────────────────────────────────────────────

const MobileMatrix = ({
  matrix,
  peopleById,
}: {
  matrix: AvailabilityMatrixResponse;
  peopleById: Map<string, AvailabilityMatrixPerson>;
}) => {
  const [expanded, setExpanded] = useState<string | null>(matrix.days[0]?.date ?? null);

  return (
    <Stack spacing={1}>
      {matrix.days.map((day) => {
        const isExpanded = expanded === day.date;
        return (
          <Card key={day.date} variant="outlined">
            <CardContent sx={{ pb: isExpanded ? 2 : 2 }}>
              <Box
                onClick={() => setExpanded(isExpanded ? null : day.date)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  cursor: 'pointer',
                }}
              >
                <Box>
                  <Typography variant="subtitle2">{formatDayLabel(day.date)}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                    <DayBadges day={day} />
                    {!isExpanded &&
                      day.shifts.map((shift) => (
                        <CoveragePill key={shift.slot} cell={shift} />
                      ))}
                  </Stack>
                </Box>
                <IconButton size="small" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                  {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Box>

              <Collapse in={isExpanded} unmountOnExit>
                <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                  {day.shifts.map((shift) => (
                    <Box key={shift.slot}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {shift.label}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <CoveragePill cell={shift} />
                          <DriverBadge count={shift.driverCount} vehiclesNeeded={shift.vehiclesNeeded} />
                        </Box>
                      </Box>
                      <Stack
                        direction="row"
                        spacing={0.75}
                        flexWrap="wrap"
                        useFlexGap
                        sx={{ mt: 1 }}
                      >
                        {shift.availableUserIds.length === 0 ? (
                          <Typography variant="caption" color="text.secondary">
                            Nobody available.
                          </Typography>
                        ) : (
                          shift.availableUserIds.map((id) => {
                            const person = peopleById.get(id);
                            return person ? <PersonChip key={id} person={person} /> : null;
                          })
                        )}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </Collapse>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
};

// ─── Section ───────────────────────────────────────────────────────────────────

/**
 * Team-level coverage for one availability window: how many people are
 * available per day and shift, how many of those can drive, and who still
 * hasn't answered.
 */
export const AvailabilityMatrix = ({ windowId }: { windowId?: string }) => {
  const isMobile = useIsMobile();
  const [matrix, setMatrix] = useState<AvailabilityMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = windowId ? `?windowId=${encodeURIComponent(windowId)}` : '';
      setMatrix(await apiFetch<AvailabilityMatrixResponse>(`/availability/matrix${query}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the coverage matrix.');
    } finally {
      setLoading(false);
    }
  }, [windowId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const query = windowId ? `?windowId=${encodeURIComponent(windowId)}` : '';
      await apiDownload(
        `/availability/matrix/csv${query}`,
        `availability-${windowId ?? 'current'}.csv`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export the coverage matrix.');
    } finally {
      setExporting(false);
    }
  };

  const peopleById = useMemo(
    () => new Map((matrix?.personnel ?? []).map((person) => [person.id, person])),
    [matrix],
  );

  const columns = useMemo<ShiftColumn[]>(() => {
    const byKey = new Map<string, ShiftColumn>();
    for (const day of matrix?.days ?? []) {
      for (const shift of day.shifts) {
        const key = shiftKey(shift);
        if (!byKey.has(key)) {
          byKey.set(key, {
            key,
            label: shift.label,
            startMinute: shift.startMinute,
            endMinute: shift.endMinute,
          });
        }
      }
    }
    return [...byKey.values()].sort(
      (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
    );
  }, [matrix]);

  const selectedCell = useMemo(() => {
    if (!selected || !matrix) return null;
    const day = matrix.days.find((candidate) => candidate.date === selected.date);
    const shift = day?.shifts.find((candidate) => candidate.slot === selected.slot);
    return day && shift ? { day, shift } : null;
  }, [selected, matrix]);

  if (loading) return <CircularProgress size={24} sx={{ my: 2 }} />;
  if (error) {
    return (
      <Alert severity="warning" sx={{ my: 1 }}>
        {error}
      </Alert>
    );
  }
  if (!matrix) return null;

  const pending = matrix.personnel.filter((person) => person.responseStatus === 'pending');
  const declined = matrix.personnel.filter((person) => person.responseStatus === 'declined');
  const isOpen = matrix.window.status === AvailabilityWindowStatus.OPEN;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h6">Coverage matrix</Typography>
          <Typography variant="body2" color="text.secondary">
            {formatDateRange(matrix.window.startDate, matrix.window.endDate)} ·{' '}
            {matrix.responseStats.total} eligible personnel
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <WindowIdentity
              category={matrix.window.category}
              name={matrix.window.name}
            />
          </Box>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={exporting ? <CircularProgress size={16} /> : <DownloadIcon />}
          disabled={exporting}
          onClick={() => void handleExport()}
        >
          Export CSV
        </Button>
      </Box>

      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <ResponseStat
          value={matrix.responseStats.submitted}
          label="Submitted"
          color="#2E7D32"
        />
        <ResponseStat value={matrix.responseStats.declined} label="Declined" color="#616161" />
        <ResponseStat
          value={matrix.responseStats.pending}
          label="Not yet responded"
          color="#B26A00"
        />
      </Stack>

      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <FollowUpCard
          title="Not yet responded"
          people={pending}
          action={
            isOpen && pending.length > 0 ? (
              <Tooltip title={REMINDER_TOOLTIP}>
                <span>
                  <Button size="small" startIcon={<NotificationsNoneIcon />} disabled>
                    Send reminder
                  </Button>
                </span>
              </Tooltip>
            ) : undefined
          }
        />
        <FollowUpCard title="Declined this window" people={declined} />
      </Stack>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 2 }}
      >
        {CAPACITY_NOTE}
      </Typography>

      {!isOpen && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Historical view — this window is closed and no longer accepts submissions.
        </Alert>
      )}

      <CoverageLegend />

      {isMobile || columns.length > MAX_TABLE_COLUMNS ? (
        <MobileMatrix matrix={matrix} peopleById={peopleById} />
      ) : (
        <>
          <DesktopMatrix
            matrix={matrix}
            columns={columns}
            selected={selected}
            onSelect={setSelected}
          />
          {selectedCell && (
            <Paper variant="outlined" sx={{ mt: 1, p: 2, backgroundColor: 'grey.50' }}>
              <Typography variant="subtitle2" gutterBottom>
                {formatDayLabel(selectedCell.day.date)} · {selectedCell.shift.label} —{' '}
                {selectedCell.shift.availableCount} available
              </Typography>
              <Divider sx={{ mb: 1 }} />
              {selectedCell.shift.availableUserIds.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Nobody has declared availability for this shift.
                </Typography>
              ) : (
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  {selectedCell.shift.availableUserIds.map((id) => {
                    const person = peopleById.get(id);
                    return person ? <PersonChip key={id} person={person} /> : null;
                  })}
                </Stack>
              )}
            </Paper>
          )}
          {!selected && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 1 }}
            >
              Select a coverage figure to see who is available for that shift.
            </Typography>
          )}
        </>
      )}
    </Box>
  );
};
