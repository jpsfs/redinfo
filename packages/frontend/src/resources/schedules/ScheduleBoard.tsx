import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
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
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import DownloadIcon from '@mui/icons-material/Download';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PublishIcon from '@mui/icons-material/Publish';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  AvailabilityWindowRole,
  AvailabilityWindowStatus,
  formatGap,
  formatRoleCapacity,
  ScheduleAssignment,
  ScheduleBoardResponse,
  ScheduleConflict,
  ScheduleDayBoard,
  ScheduleGap,
  ScheduleShiftBoard,
  ScheduleStatus,
} from '@redinfo/shared';
import { apiDownload, apiFetch } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatDateRange, formatDayLabel } from '../../utils/dates';
import { WindowIdentity } from '../availability/WindowIdentity';
import { AssignPersonDialog, AssignTarget } from './AssignPersonDialog';
import { AutofillDialog } from './AutofillDialog';
import { PublishDialog } from './PublishDialog';

/**
 * A window with no roles still schedules people — it just has one unnamed
 * column instead of one per post.
 */
const CREW_COLUMN = 'Crew';

const shiftId = (date: string, slot: number) => `${date}#${slot}`;

const personName = (assignment: ScheduleAssignment) =>
  `${assignment.user.firstName} ${assignment.user.lastName}`;

// ─── Small pieces ──────────────────────────────────────────────────────────────

const describeVehicles = (vehiclesNeeded: number) =>
  vehiclesNeeded === 0
    ? 'no vehicle needed'
    : `${vehiclesNeeded} vehicle${vehiclesNeeded === 1 ? '' : 's'} needed`;

/**
 * Certified drivers on a shift against the vehicles it crews.
 *
 * Counted across every role, not just the driver post: a shift needing two
 * vehicles needs two certified people however the window's roles are sized.
 */
const DriverBadge = ({
  count,
  vehiclesNeeded,
}: {
  count: number;
  vehiclesNeeded: number;
}) => (
  <Tooltip
    title={`${count} certified driver${count === 1 ? '' : 's'} assigned, ${describeVehicles(
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

/**
 * One assigned person.
 *
 * A plain chip means the assignment came from submitted availability, which is
 * the ordinary case and so carries no decoration. Warning means an override —
 * agreed off-platform — and error means the person is double-booked.
 */
const AssignmentChip = ({
  assignment,
  conflict,
  onRemove,
}: {
  assignment: ScheduleAssignment;
  conflict?: ScheduleConflict;
  onRemove?: () => void;
}) => {
  const name = personName(assignment);
  const title = conflict
    ? `Double-booked: also on ${conflict.otherWindowLabel}, ${conflict.otherLabel}`
    : assignment.isOverride
      ? `Override — did not submit for this shift. Assigned by ${
          assignment.assignedBy
            ? `${assignment.assignedBy.firstName} ${assignment.assignedBy.lastName}`
            : 'a coordinator'
        } on ${new Date(assignment.assignedAt).toLocaleString()}`
      : assignment.availability === 'submitted'
        ? 'Submitted availability for this shift'
        : 'No longer available for this shift';

  return (
    <Tooltip title={title}>
      <Chip
        size="small"
        variant="outlined"
        color={conflict ? 'error' : assignment.isOverride ? 'warning' : 'default'}
        icon={
          conflict ? (
            <ErrorOutlineIcon fontSize="small" />
          ) : assignment.isOverride ? (
            <SwapHorizIcon fontSize="small" />
          ) : assignment.user.isDriver ? (
            <DirectionsCarIcon fontSize="small" />
          ) : undefined
        }
        label={
          assignment.user.isDriver && (conflict || assignment.isOverride)
            ? `${name} · driver`
            : name
        }
        {...(onRemove ? { onDelete: onRemove } : {})}
        aria-label={`${name}${assignment.isOverride ? ', override' : ''}${
          conflict ? ', double-booked' : ''
        }`}
      />
    </Tooltip>
  );
};

const GapNote = ({ gap }: { gap: ScheduleGap }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0.5,
      mt: 0.5,
      color: gap.kind === 'ROLE_SHORT' ? 'warning.dark' : 'error.dark',
    }}
  >
    <WarningAmberIcon sx={{ fontSize: 14 }} />
    <Typography variant="caption">{formatGap(gap)}</Typography>
  </Box>
);

const AssignSlotButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <Button
    size="small"
    startIcon={<AddIcon />}
    onClick={onClick}
    aria-label={label}
    sx={{
      justifyContent: 'flex-start',
      width: '100%',
      color: 'text.secondary',
      border: '1px dashed',
      borderColor: 'grey.400',
    }}
  >
    Assign
  </Button>
);

const StatTile = ({
  value,
  label,
  color,
}: {
  value: string | number;
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

const BoardLegend = () => (
  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
    {(
      [
        [undefined, 'Assigned from submitted availability'],
        ['override', 'Override — did not submit for this shift'],
        ['gap', 'Coverage gap'],
        ['conflict', 'Double-booked'],
      ] as const
    ).map(([kind, label]) => (
      <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {kind === 'override' && <SwapHorizIcon sx={{ fontSize: 16, color: 'warning.dark' }} />}
        {kind === 'gap' && <WarningAmberIcon sx={{ fontSize: 16, color: 'error.dark' }} />}
        {kind === 'conflict' && (
          <ErrorOutlineIcon sx={{ fontSize: 16, color: 'error.dark' }} />
        )}
        {kind === undefined && (
          <Chip size="small" variant="outlined" label="Name" sx={{ height: 18 }} />
        )}
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Box>
    ))}
  </Stack>
);

// ─── Cells ─────────────────────────────────────────────────────────────────────

/**
 * Everyone in one role on one shift, plus what the role is still short of.
 *
 * The gap belongs to the role rather than the shift, so it is rendered under
 * the column it applies to — a coordinator reading across a row can see which
 * post to fill without decoding a shift-level message.
 */
const RoleCell = ({
  role,
  shift,
  gaps,
  conflictFor,
  onAssign,
  onRemove,
  readOnly,
  dayLabel,
}: {
  role: AvailabilityWindowRole | null;
  shift: ScheduleShiftBoard;
  gaps: ScheduleGap[];
  conflictFor: (assignment: ScheduleAssignment) => ScheduleConflict | undefined;
  onAssign: () => void;
  onRemove: (assignment: ScheduleAssignment) => void;
  readOnly: boolean;
  dayLabel: string;
}) => {
  const people = shift.assignments.filter(
    (assignment) => (assignment.roleId ?? null) === (role?.id ?? null),
  );
  const canTakeMore = !role || role.maxPeople === 0 || people.length < role.maxPeople;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 150 }}>
      {people.map((assignment) => (
        <AssignmentChip
          key={assignment.id}
          assignment={assignment}
          conflict={conflictFor(assignment)}
          onRemove={readOnly ? undefined : () => onRemove(assignment)}
        />
      ))}
      {!readOnly && canTakeMore && (
        <AssignSlotButton
          onClick={onAssign}
          label={`Assign to ${role?.name ?? CREW_COLUMN} on ${dayLabel}, ${shift.label}`}
        />
      )}
      {gaps.map((gap) => (
        <GapNote key={`${gap.kind}-${gap.roleId ?? 'shift'}`} gap={gap} />
      ))}
    </Box>
  );
};

// ─── Desktop table ─────────────────────────────────────────────────────────────

const DesktopBoard = ({
  board,
  columns,
  conflictFor,
  onAssign,
  onRemove,
  readOnly,
}: {
  board: ScheduleBoardResponse;
  columns: Array<AvailabilityWindowRole | null>;
  conflictFor: (assignment: ScheduleAssignment) => ScheduleConflict | undefined;
  onAssign: (target: AssignTarget) => void;
  onRemove: (assignment: ScheduleAssignment) => void;
  readOnly: boolean;
}) => (
  <TableContainer component={Paper} variant="outlined">
    <Table size="small">
      <TableHead>
        <TableRow sx={{ backgroundColor: 'grey.100' }}>
          <TableCell sx={{ minWidth: 150 }}>
            <strong>Date</strong>
          </TableCell>
          <TableCell sx={{ minWidth: 140 }}>
            <strong>Shift</strong>
          </TableCell>
          {columns.map((role) => (
            <TableCell key={role?.id ?? CREW_COLUMN}>
              <strong>{role?.name ?? CREW_COLUMN}</strong>
              <Typography variant="caption" color="text.secondary" display="block">
                {role ? formatRoleCapacity(role.maxPeople) : 'no roles on this window'}
                {role?.requiresDriverCertification ? ' · certification required' : ''}
              </Typography>
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {board.days.flatMap((day) =>
          day.shifts.map((shift, index) => (
            <TableRow
              key={shiftId(day.date, shift.slot)}
              sx={{
                backgroundColor: day.isHoliday
                  ? 'rgba(245,124,0,0.05)'
                  : day.isWeekend
                    ? 'rgba(0,0,0,0.015)'
                    : 'inherit',
              }}
            >
              <TableCell>
                {index === 0 && (
                  <>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatDayLabel(day.date)}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                      {day.isHoliday && (
                        <Chip
                          size="small"
                          color="warning"
                          variant="outlined"
                          label={day.holidayName ? `Holiday · ${day.holidayName}` : 'Holiday'}
                        />
                      )}
                      {day.isWeekend && !day.isHoliday && (
                        <Chip size="small" variant="outlined" label="Weekend" />
                      )}
                    </Stack>
                  </>
                )}
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {shift.label}
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <DriverBadge count={shift.driverCount} vehiclesNeeded={shift.vehiclesNeeded} />
                </Box>
              </TableCell>
              {columns.map((role) => (
                <TableCell key={role?.id ?? CREW_COLUMN} sx={{ verticalAlign: 'top' }}>
                  <RoleCell
                    role={role}
                    shift={shift}
                    gaps={gapsForColumn(shift.gaps, role, columns)}
                    conflictFor={conflictFor}
                    onAssign={() =>
                      onAssign({ date: day.date, slot: shift.slot, shiftLabel: shift.label, role })
                    }
                    onRemove={onRemove}
                    readOnly={readOnly}
                    dayLabel={formatDayLabel(day.date)}
                  />
                </TableCell>
              ))}
            </TableRow>
          )),
        )}
      </TableBody>
    </Table>
  </TableContainer>
);

/**
 * Which gaps belong under which column.
 *
 * A role gap goes under its own role. The missing-driver gap is a property of
 * the whole shift, so it goes under the driver post when the window has one and
 * under the first column otherwise — never nowhere.
 */
function gapsForColumn(
  gaps: ScheduleGap[],
  role: AvailabilityWindowRole | null,
  columns: Array<AvailabilityWindowRole | null>,
): ScheduleGap[] {
  const driverColumn =
    columns.find((column) => column?.requiresDriverCertification) ?? columns[0] ?? null;
  return gaps.filter((gap) => {
    if (gap.kind === 'ROLE_SHORT') return gap.roleId === role?.id;
    return (driverColumn?.id ?? null) === (role?.id ?? null);
  });
}

// ─── Mobile day cards ──────────────────────────────────────────────────────────

const MobileBoard = ({
  board,
  columns,
  conflictFor,
  onAssign,
  onRemove,
  readOnly,
}: {
  board: ScheduleBoardResponse;
  columns: Array<AvailabilityWindowRole | null>;
  conflictFor: (assignment: ScheduleAssignment) => ScheduleConflict | undefined;
  onAssign: (target: AssignTarget) => void;
  onRemove: (assignment: ScheduleAssignment) => void;
  readOnly: boolean;
}) => (
  <Stack spacing={1}>
    {board.days.map((day: ScheduleDayBoard) => (
      <Card key={day.date} variant="outlined">
        <CardContent>
          <Typography variant="subtitle2">{formatDayLabel(day.date)}</Typography>
          <Stack spacing={2} sx={{ mt: 1.5 }}>
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
                  <DriverBadge count={shift.driverCount} vehiclesNeeded={shift.vehiclesNeeded} />
                </Box>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {columns.map((role) => (
                    <Box key={role?.id ?? CREW_COLUMN}>
                      <Typography variant="caption" color="text.secondary">
                        {role?.name ?? CREW_COLUMN}
                      </Typography>
                      <RoleCell
                        role={role}
                        shift={shift}
                        gaps={gapsForColumn(shift.gaps, role, columns)}
                        conflictFor={conflictFor}
                        onAssign={() =>
                          onAssign({
                            date: day.date,
                            slot: shift.slot,
                            shiftLabel: shift.label,
                            role,
                          })
                        }
                        onRemove={onRemove}
                        readOnly={readOnly}
                        dayLabel={formatDayLabel(day.date)}
                      />
                    </Box>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>
    ))}
  </Stack>
);

// ─── Board ─────────────────────────────────────────────────────────────────────

/**
 * The schedule for one availability window: its own days and shifts down the
 * page, its own roles across it.
 *
 * Availability guides what is offered when filling a slot but never limits who
 * may be placed — everything that contradicts a submission is shown as an
 * override rather than quietly equated with one.
 */
export const ScheduleBoard = ({ scheduleId }: { scheduleId: string }) => {
  const isMobile = useIsMobile();
  const [board, setBoard] = useState<ScheduleBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<AssignTarget | null>(null);
  const [autofillOpen, setAutofillOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBoard(await apiFetch<ScheduleBoardResponse>(`/schedules/${scheduleId}/board`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the schedule.');
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRemove = async (assignment: ScheduleAssignment) => {
    try {
      await apiFetch(`/schedules/${scheduleId}/assignments/${assignment.id}`, {
        method: 'DELETE',
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that assignment.');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await apiDownload(`/schedules/${scheduleId}/csv`, `schedule-${scheduleId}.csv`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export the schedule.');
    } finally {
      setExporting(false);
    }
  };

  /** One column per role, or a single unnamed one when the window has none. */
  const columns = useMemo<Array<AvailabilityWindowRole | null>>(
    () => (board && board.roles.length > 0 ? board.roles : [null]),
    [board],
  );

  const conflictsByUserShift = useMemo(() => {
    const map = new Map<string, ScheduleConflict>();
    for (const conflict of board?.conflicts ?? []) {
      map.set(`${conflict.userId}#${shiftId(conflict.date, conflict.slot)}`, conflict);
    }
    return map;
  }, [board]);

  const conflictFor = useCallback(
    (assignment: ScheduleAssignment) =>
      conflictsByUserShift.get(
        `${assignment.userId}#${shiftId(assignment.date, assignment.slot)}`,
      ),
    [conflictsByUserShift],
  );

  if (loading && !board) return <CircularProgress size={24} sx={{ my: 2 }} />;
  if (error && !board) {
    return (
      <Alert severity="warning" sx={{ my: 1 }}>
        {error}
      </Alert>
    );
  }
  if (!board) return null;

  const isPublished = board.schedule.status === ScheduleStatus.PUBLISHED;
  const windowIsOpen = board.window.status === AvailabilityWindowStatus.OPEN;
  const { stats } = board;

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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6">Schedule</Typography>
            <Chip
              size="small"
              variant="outlined"
              color={isPublished ? 'success' : 'default'}
              label={isPublished ? 'Published' : 'Draft'}
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {formatDateRange(board.window.startDate, board.window.endDate)}
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <WindowIdentity category={board.window.category} name={board.window.name} />
          </Box>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AutoFixHighIcon />}
            onClick={() => setAutofillOpen(true)}
          >
            Auto-fill draft
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            startIcon={exporting ? <CircularProgress size={16} /> : <DownloadIcon />}
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            Export CSV
          </Button>
          {!isPublished && (
            <Button
              size="small"
              variant="contained"
              startIcon={<PublishIcon />}
              onClick={() => setPublishOpen(true)}
            >
              Publish schedule
            </Button>
          )}
        </Stack>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {windowIsOpen && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This window is still open — availability may still change. You can keep
          building; anyone who submits later shows up in the assign list.
        </Alert>
      )}

      {isPublished && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Published — assigned personnel can see their duties. Changes you make now
          are live straight away.
        </Alert>
      )}

      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <StatTile
          value={`${stats.filledSlots} / ${stats.requiredSlots}`}
          label="Slots filled"
          color="#2E7D32"
        />
        <StatTile value={stats.shiftsWithGaps} label="Shifts with gaps" color="#C62828" />
        <StatTile value={stats.overrideCount} label="Overrides" color="#616161" />
        <StatTile value={board.conflicts.length} label="Double-booked" color="#C62828" />
      </Stack>

      <BoardLegend />

      {board.conflicts.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Double-booked
          </Typography>
          {board.conflicts.map((conflict) => (
            <Typography
              key={`${conflict.userId}-${conflict.date}-${conflict.slot}-${conflict.otherWindowId}`}
              variant="body2"
            >
              {conflict.userName}, {formatDayLabel(conflict.date)} — also on{' '}
              {conflict.otherWindowLabel}, {conflict.otherLabel}
            </Typography>
          ))}
        </Alert>
      )}

      {isMobile ? (
        <MobileBoard
          board={board}
          columns={columns}
          conflictFor={conflictFor}
          onAssign={setTarget}
          onRemove={(assignment) => void handleRemove(assignment)}
          readOnly={false}
        />
      ) : (
        <DesktopBoard
          board={board}
          columns={columns}
          conflictFor={conflictFor}
          onAssign={setTarget}
          onRemove={(assignment) => void handleRemove(assignment)}
          readOnly={false}
        />
      )}

      {board.days.length === 0 && (
        <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            This window has no shifts, so there is nothing to schedule.
          </Typography>
        </Paper>
      )}

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary">
        People who submitted availability for a shift are offered first. Anyone else
        can still be assigned — cover is often agreed by phone — and is recorded as an
        override.
      </Typography>

      <AssignPersonDialog
        scheduleId={scheduleId}
        target={target}
        onClose={() => setTarget(null)}
        onAssigned={() => {
          setTarget(null);
          void load();
        }}
      />
      <AutofillDialog
        scheduleId={scheduleId}
        open={autofillOpen}
        stats={stats}
        onClose={() => setAutofillOpen(false)}
        onFilled={() => {
          setAutofillOpen(false);
          void load();
        }}
      />
      <PublishDialog
        scheduleId={scheduleId}
        open={publishOpen}
        board={board}
        onClose={() => setPublishOpen(false)}
        onPublished={() => {
          setPublishOpen(false);
          void load();
        }}
      />
    </Box>
  );
};
