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
import { useGetIdentity, usePermissions } from 'react-admin';
import AddIcon from '@mui/icons-material/Add';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import DownloadIcon from '@mui/icons-material/Download';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import PublishIcon from '@mui/icons-material/Publish';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Action,
  AvailabilityWindowRole,
  AvailabilityWindowStatus,
  formatGap,
  formatRoleCapacity,
  hasPermission,
  ScheduleAssignment,
  ScheduleBoardResponse,
  ScheduleConflict,
  ScheduleDayBoard,
  ScheduleGap,
  ScheduleShiftBoard,
  ScheduleStatus,
  selfAssignBlockedReason,
  shiftsOverlap,
  UNLIMITED_ROLE_PEOPLE,
  UserRole,
} from '@redinfo/shared';
import { apiDownload, apiFetch } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatDateRange, formatDayLabel } from '../../utils/dates';
import { WindowIdentity } from '../availability/WindowIdentity';
import { AssignPersonDialog, AssignTarget } from './AssignPersonDialog';
import { AutofillDialog } from './AutofillDialog';
import { PublishDialog } from './PublishDialog';
import { SignUpDialog } from './SignUpDialog';

/**
 * A window with no roles still schedules people — it just has one unnamed
 * column instead of one per post.
 */
const CREW_COLUMN = 'Crew';

const shiftId = (date: string, slot: number) => `${date}#${slot}`;

const personName = (assignment: ScheduleAssignment) =>
  `${assignment.user.firstName} ${assignment.user.lastName}`;

/**
 * Who is looking at the board, and what that lets them do.
 *
 * A coordinator builds: fill any place with anyone, take anyone off. Everyone
 * else reads the published rota and may add *themselves* to an open place —
 * never remove themselves, and never anyone else.
 */
interface Viewer {
  id: string;
  isDriver: boolean;
  isCoordinator: boolean;
  /** The schedule is published, so open places are there to be taken. */
  canSignUp: boolean;
  /** Whether the viewer already holds a duty overlapping this shift. */
  overlaps: (date: string, shift: ScheduleShiftBoard) => boolean;
}

// ─── Small pieces ──────────────────────────────────────────────────────────────

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
  isSelf,
  onRemove,
}: {
  assignment: ScheduleAssignment;
  conflict?: ScheduleConflict;
  isSelf?: boolean;
  onRemove?: () => void;
}) => {
  const name = personName(assignment);
  // Someone who put themselves forward is not someone a coordinator overrode,
  // so it is never read as one however the availability lines up.
  const signedUp = assignment.selfAssigned;
  const title = conflict
    ? `Double-booked: also on ${conflict.otherWindowLabel}, ${conflict.otherLabel}`
    : signedUp
      ? `Signed up on ${new Date(assignment.assignedAt).toLocaleString()}`
      : assignment.isOverride
        ? `Override — did not submit for this shift. Assigned by ${
            assignment.assignedBy
              ? `${assignment.assignedBy.firstName} ${assignment.assignedBy.lastName}`
              : 'a coordinator'
          } on ${new Date(assignment.assignedAt).toLocaleString()}`
        : assignment.availability === 'submitted'
          ? 'Submitted availability for this shift'
          : 'No longer available for this shift';

  const color = conflict
    ? 'error'
    : signedUp
      ? 'info'
      : assignment.isOverride
        ? 'warning'
        : 'default';

  return (
    <Tooltip title={title}>
      <Chip
        size="small"
        variant={isSelf ? 'filled' : 'outlined'}
        color={color}
        icon={
          conflict ? (
            <ErrorOutlineIcon fontSize="small" />
          ) : signedUp ? (
            <HowToRegIcon fontSize="small" />
          ) : assignment.isOverride ? (
            <SwapHorizIcon fontSize="small" />
          ) : assignment.user.isDriver ? (
            <DirectionsCarIcon fontSize="small" />
          ) : undefined
        }
        // The name alone. Whether someone drives is read from the column they
        // are in and from the shift's own driver warning — spelling it out on
        // every chip says nothing the board is not already saying.
        label={name}
        {...(onRemove ? { onDelete: onRemove } : {})}
        aria-label={`${name}${signedUp ? ', signed up' : ''}${
          !signedUp && assignment.isOverride ? ', override' : ''
        }${conflict ? ', double-booked' : ''}${isSelf ? ', you' : ''}`}
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
      color: 'error.dark',
    }}
  >
    <WarningAmberIcon sx={{ fontSize: 14 }} />
    <Typography variant="caption">{formatGap(gap)}</Typography>
  </Box>
);

/**
 * An open place.
 *
 * A coordinator fills it with anyone; a member may only put themselves in it,
 * and only where the rules allow — so the button says which of the two it is,
 * and explains itself rather than failing when it cannot be used.
 */
const OpenSlotButton = ({
  onClick,
  label,
  mode,
  blockedReason,
}: {
  onClick: () => void;
  label: string;
  mode: 'assign' | 'signUp';
  blockedReason?: string | null;
}) => {
  const button = (
    <Button
      size="small"
      startIcon={mode === 'signUp' ? <HowToRegIcon /> : <AddIcon />}
      onClick={onClick}
      disabled={Boolean(blockedReason)}
      aria-label={label}
      sx={{
        justifyContent: 'flex-start',
        width: '100%',
        color: 'text.secondary',
        border: '1px dashed',
        borderColor: 'grey.400',
      }}
    >
      {mode === 'signUp' ? 'Add me' : 'Assign'}
    </Button>
  );

  return blockedReason ? (
    <Tooltip title={blockedReason}>
      <span>{button}</span>
    </Tooltip>
  ) : (
    button
  );
};

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
        ['signUp', 'Signed up by the person themselves'],
        ['override', 'Override — did not submit for this shift'],
        ['open', 'An open place, one per person the role still wants'],
        ['gap', 'No driver for the vehicles this shift crews'],
        ['conflict', 'Double-booked'],
      ] as const
    ).map(([kind, label]) => (
      <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {kind === 'signUp' && <HowToRegIcon sx={{ fontSize: 16, color: 'info.dark' }} />}
        {kind === 'override' && <SwapHorizIcon sx={{ fontSize: 16, color: 'warning.dark' }} />}
        {kind === 'open' && (
          <Box
            sx={{
              width: 16,
              height: 16,
              border: '1px dashed',
              borderColor: 'grey.400',
              borderRadius: 1,
            }}
          />
        )}
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
  viewer,
  date,
  dayLabel,
}: {
  role: AvailabilityWindowRole | null;
  shift: ScheduleShiftBoard;
  gaps: ScheduleGap[];
  conflictFor: (assignment: ScheduleAssignment) => ScheduleConflict | undefined;
  onAssign: () => void;
  onRemove: (assignment: ScheduleAssignment) => void;
  viewer: Viewer;
  /** The day this cell sits on — needed to spot an overlapping duty. */
  date: string;
  dayLabel: string;
}) => {
  const people = shift.assignments.filter(
    (assignment) => (assignment.roleId ?? null) === (role?.id ?? null),
  );
  const canTakeMore = !role || role.maxPeople === 0 || people.length < role.maxPeople;

  const mode = viewer.isCoordinator ? 'assign' : 'signUp';
  const blockedReason =
    mode === 'signUp'
      ? selfAssignBlockedReason({
          role,
          isDriver: viewer.isDriver,
          filledInRole: people.length,
          alreadyOnShift: shift.assignments.some(
            (assignment) => assignment.userId === viewer.id,
          ),
          overlaps: viewer.overlaps(date, shift),
        })
      : null;

  // Only a published rota is open to members; a coordinator works on drafts too.
  const canFill = canTakeMore && (viewer.isCoordinator || viewer.canSignUp);

  /**
   * One open place per person the role still wants.
   *
   * The empty places *are* how a short role reads — three of them says "three
   * people needed" more directly than a sentence saying so, and a role filled
   * to its headcount simply shows none. An unlimited role has no number to
   * count down to, so it keeps one open place for as long as it exists.
   */
  const openPlaces = !canFill
    ? 0
    : role && role.maxPeople !== UNLIMITED_ROLE_PEOPLE
      ? Math.max(0, role.maxPeople - people.length)
      : 1;

  const placeLabel = (index: number) => {
    const verb = mode === 'signUp' ? 'Add me to' : 'Assign to';
    const where = `${role?.name ?? CREW_COLUMN} on ${dayLabel}, ${shift.label}`;
    // Several identical buttons in one cell need telling apart by name.
    return openPlaces > 1
      ? `${verb} ${where} — place ${index + 1} of ${openPlaces}`
      : `${verb} ${where}`;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 150 }}>
      {people.map((assignment) => (
        <AssignmentChip
          key={assignment.id}
          assignment={assignment}
          conflict={conflictFor(assignment)}
          isSelf={assignment.userId === viewer.id}
          onRemove={viewer.isCoordinator ? () => onRemove(assignment) : undefined}
        />
      ))}
      {Array.from({ length: openPlaces }, (_, index) => (
        <OpenSlotButton
          key={index}
          onClick={onAssign}
          mode={mode}
          blockedReason={blockedReason}
          label={placeLabel(index)}
        />
      ))}
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
  viewer,
}: {
  board: ScheduleBoardResponse;
  columns: Array<AvailabilityWindowRole | null>;
  conflictFor: (assignment: ScheduleAssignment) => ScheduleConflict | undefined;
  onAssign: (target: AssignTarget) => void;
  onRemove: (assignment: ScheduleAssignment) => void;
  viewer: Viewer;
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
                    viewer={viewer}
                    date={day.date}
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
 * Which gaps are worth writing out under a column.
 *
 * Only the missing-driver one. A role short of people already says so by
 * showing that many empty places, and repeating it in words under every column
 * of every shift buries the one gap those places cannot express: certified
 * drivers are counted across the whole shift against the vehicles it crews, so
 * a shift can be full to every role and still have nobody able to drive.
 *
 * It belongs to the shift rather than to a role, so it is written under the
 * driver post where the window has one, and under the first column otherwise —
 * never nowhere.
 */
function gapsForColumn(
  gaps: ScheduleGap[],
  role: AvailabilityWindowRole | null,
  columns: Array<AvailabilityWindowRole | null>,
): ScheduleGap[] {
  const driverColumn =
    columns.find((column) => column?.requiresDriverCertification) ?? columns[0] ?? null;
  return gaps.filter(
    (gap) =>
      gap.kind === 'MISSING_DRIVER' &&
      (driverColumn?.id ?? null) === (role?.id ?? null),
  );
}

// ─── Mobile day cards ──────────────────────────────────────────────────────────

const MobileBoard = ({
  board,
  columns,
  conflictFor,
  onAssign,
  onRemove,
  viewer,
}: {
  board: ScheduleBoardResponse;
  columns: Array<AvailabilityWindowRole | null>;
  conflictFor: (assignment: ScheduleAssignment) => ScheduleConflict | undefined;
  onAssign: (target: AssignTarget) => void;
  onRemove: (assignment: ScheduleAssignment) => void;
  viewer: Viewer;
}) => (
  <Stack spacing={1}>
    {board.days.map((day: ScheduleDayBoard) => (
      <Card key={day.date} variant="outlined">
        <CardContent>
          <Typography variant="subtitle2">{formatDayLabel(day.date)}</Typography>
          <Stack spacing={2} sx={{ mt: 1.5 }}>
            {day.shifts.map((shift) => (
              <Box key={shift.slot}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {shift.label}
                </Typography>
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
                        viewer={viewer}
                        date={day.date}
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
  const { permissions } = usePermissions<UserRole>();
  const { identity } = useGetIdentity();
  const [board, setBoard] = useState<ScheduleBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<AssignTarget | null>(null);
  const [signUpTarget, setSignUpTarget] = useState<AssignTarget | null>(null);
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

  const viewer = useMemo<Viewer>(() => {
    const id = String(identity?.id ?? '');
    const mine = (board?.days ?? []).flatMap((day) =>
      day.shifts
        .filter((shift) => shift.assignments.some((a) => a.userId === id))
        .map((shift) => ({ date: day.date, shift })),
    );
    return {
      id,
      isDriver: Boolean((identity as { isDriver?: boolean } | undefined)?.isDriver),
      isCoordinator: permissions
        ? hasPermission(permissions, Action.MANAGE_SCHEDULES)
        : false,
      canSignUp: board?.schedule.status === ScheduleStatus.PUBLISHED,
      overlaps: (date, shift) =>
        mine.some(
          (held) =>
            held.date === date &&
            held.shift.slot !== shift.slot &&
            shiftsOverlap(held.shift, shift),
        ),
    };
  }, [board, identity, permissions]);

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
          {viewer.isCoordinator && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AutoFixHighIcon />}
              onClick={() => setAutofillOpen(true)}
            >
              Auto-fill draft
            </Button>
          )}
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
          {viewer.isCoordinator && !isPublished && (
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

      {isPublished && viewer.isCoordinator && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Published — everyone can see this rota, and members can add themselves to
          an open place. Changes you make now are live straight away.
        </Alert>
      )}

      {isPublished && !viewer.isCoordinator && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You can add yourself to any open place you are able to cover. Once you are
          on a shift you cannot take yourself off — ask a coordinator, who can arrange
          cover at the same time.
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
          onAssign={viewer.isCoordinator ? setTarget : setSignUpTarget}
          onRemove={(assignment) => void handleRemove(assignment)}
          viewer={viewer}
        />
      ) : (
        <DesktopBoard
          board={board}
          columns={columns}
          conflictFor={conflictFor}
          onAssign={viewer.isCoordinator ? setTarget : setSignUpTarget}
          onRemove={(assignment) => void handleRemove(assignment)}
          viewer={viewer}
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
        {viewer.isCoordinator
          ? 'People who submitted availability for a shift are offered first. Anyone else can still be assigned — cover is often agreed by phone — and is recorded as an override.'
          : 'Only places you are able to cover are offered: the driver posts need the driver certification, and a role that is already full cannot take another person.'}
      </Typography>

      <SignUpDialog
        scheduleId={scheduleId}
        target={signUpTarget}
        vehiclesNeeded={
          board.days
            .find((day) => day.date === signUpTarget?.date)
            ?.shifts.find((shift) => shift.slot === signUpTarget?.slot)?.vehiclesNeeded ?? 0
        }
        onClose={() => setSignUpTarget(null)}
        onSignedUp={() => {
          setSignUpTarget(null);
          void load();
        }}
      />

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
