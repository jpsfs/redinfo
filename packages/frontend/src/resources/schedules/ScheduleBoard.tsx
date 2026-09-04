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
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AddIcon from '@mui/icons-material/Add';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import DownloadIcon from '@mui/icons-material/Download';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import PrintIcon from '@mui/icons-material/Print';
import PublishIcon from '@mui/icons-material/Publish';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Action,
  AvailabilityWindowRole,
  AvailabilityWindowStatus,
  CertificationType,
  formatGap,
  formatRoleCapacity,
  formatShiftLabel,
  hasPermission,
  HeldCertification,
  holdsCertification,
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
import { certificationLabel } from '../../i18n/labels';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import { useT } from '../../i18n/useT';
import { formatDateRange, formatDayLabel } from '../../utils/dates';
import { WindowIdentity } from '../availability/WindowIdentity';
import { AdjustShiftDialog, AdjustShiftTarget } from './AdjustShiftDialog';
import { AssignPersonDialog, AssignTarget } from './AssignPersonDialog';
import { AutofillDialog } from './AutofillDialog';
import { PublishDialog } from './PublishDialog';
import { SignUpDialog } from './SignUpDialog';

/**
 * A window with no roles still schedules people — it just has one unnamed
 * column instead of one per post. Not displayed: see `t('scheduleBoard.crewColumn')`.
 */
const CREW_COLUMN_KEY = 'CREW';

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
  certifications: HeldCertification[];
  isCoordinator: boolean;
  /** The schedule is published, so open places are there to be taken. */
  canSignUp: boolean;
  /** Whether the viewer already holds a duty overlapping this shift. */
  overlaps: (date: string, shift: ScheduleShiftBoard) => boolean;
}

/** Today, as the ISO date the shared certification functions expect. */
const today = () => new Date().toISOString().slice(0, 10);

/** Why an assignment is flagged, or nothing — see `AssignmentChip`. */
type CertificationIssue = 'exception' | 'lapsed' | null;

function certificationIssue(
  assignment: ScheduleAssignment,
  role: AvailabilityWindowRole | null,
): CertificationIssue {
  if (assignment.certificationOverrideReason) return 'exception';
  if (
    role?.requiredCertification &&
    !holdsCertification(assignment.user.certifications, role.requiredCertification, today())
  ) {
    return 'lapsed';
  }
  return null;
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
  role,
  conflict,
  isSelf,
  onRemove,
}: {
  assignment: ScheduleAssignment;
  role: AvailabilityWindowRole | null;
  conflict?: ScheduleConflict;
  isSelf?: boolean;
  onRemove?: () => void;
}) => {
  const t = useT();
  const intlLocale = useIntlLocale();
  const name = personName(assignment);
  // Someone who put themselves forward is not someone a coordinator overrode,
  // so it is never read as one however the availability lines up.
  const signedUp = assignment.selfAssigned;
  const issue = certificationIssue(assignment, role);
  const certLabel = role?.requiredCertification ? certificationLabel(t, role.requiredCertification) : '';

  const title = conflict
    ? t('scheduleBoard.doubleBookedTooltip', { window: conflict.otherWindowLabel, label: conflict.otherLabel })
    : issue === 'lapsed'
      ? t('scheduleBoard.lapsedTooltip', { certification: certLabel })
      : issue === 'exception'
        ? t('scheduleBoard.exceptionTooltip', {
            certification: certLabel,
            reason: assignment.certificationOverrideReason,
          })
        : signedUp
          ? t('scheduleBoard.signedUpTooltip', { date: new Date(assignment.assignedAt).toLocaleString(intlLocale) })
          : assignment.isOverride
            ? t('scheduleBoard.overrideTooltip', {
                assigner: assignment.assignedBy
                  ? `${assignment.assignedBy.firstName} ${assignment.assignedBy.lastName}`
                  : t('scheduleBoard.aCoordinator'),
                date: new Date(assignment.assignedAt).toLocaleString(intlLocale),
              })
            : assignment.availability === 'submitted'
              ? t('scheduleBoard.submittedTooltip')
              : t('scheduleBoard.noLongerAvailableTooltip');

  const color = conflict
    ? 'error'
    : issue === 'lapsed'
      ? 'error'
      : issue === 'exception'
        ? 'warning'
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
          conflict || issue === 'lapsed' ? (
            <ErrorOutlineIcon fontSize="small" />
          ) : issue === 'exception' ? (
            <WarningAmberIcon fontSize="small" />
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
        aria-label={`${name}${signedUp ? t('scheduleBoard.suffixSignedUp') : ''}${
          !signedUp && assignment.isOverride ? t('scheduleBoard.suffixOverride') : ''
        }${conflict ? t('scheduleBoard.suffixDoubleBooked') : ''}${
          issue
            ? t('scheduleBoard.suffixCertification', {
                issue: t(issue === 'exception' ? 'scheduleBoard.issueException' : 'scheduleBoard.issueLapsed'),
              })
            : ''
        }${isSelf ? t('scheduleBoard.suffixYou') : ''}`}
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
  const t = useT();
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
      {mode === 'signUp' ? t('scheduleBoard.addMe') : t('scheduleBoard.assign')}
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

const BoardLegend = () => {
  const t = useT();
  return (
  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
    {(
      [
        [undefined, t('scheduleBoard.legendAssigned')],
        ['signUp', t('scheduleBoard.legendSignedUp')],
        ['override', t('scheduleBoard.legendOverride')],
        ['adjusted', t('scheduleBoard.legendAdjusted')],
        ['exception', t('scheduleBoard.legendException')],
        ['lapsed', t('scheduleBoard.legendLapsed')],
        ['open', t('scheduleBoard.legendOpen')],
        ['gap', t('scheduleBoard.legendGap')],
        ['conflict', t('scheduleBoard.legendConflict')],
      ] as const
    ).map(([kind, label]) => (
      <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {kind === 'signUp' && <HowToRegIcon sx={{ fontSize: 16, color: 'info.dark' }} />}
        {kind === 'override' && <SwapHorizIcon sx={{ fontSize: 16, color: 'warning.dark' }} />}
        {kind === 'adjusted' && <AccessTimeIcon sx={{ fontSize: 16, color: 'warning.dark' }} />}
        {kind === 'exception' && <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.dark' }} />}
        {kind === 'lapsed' && <ErrorOutlineIcon sx={{ fontSize: 16, color: 'error.dark' }} />}
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
          <Chip size="small" variant="outlined" label={t('scheduleBoard.legendNameChip')} sx={{ height: 18 }} />
        )}
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Box>
    ))}
  </Stack>
  );
};

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
  const t = useT();
  const people = shift.assignments.filter(
    (assignment) => (assignment.roleId ?? null) === (role?.id ?? null),
  );
  const canTakeMore = !role || role.maxPeople === 0 || people.length < role.maxPeople;

  const mode = viewer.isCoordinator ? 'assign' : 'signUp';
  const blockedReason =
    mode === 'signUp'
      ? selfAssignBlockedReason({
          role,
          certifications: viewer.certifications,
          today: today(),
          date,
          // `isCoordinator` *is* `MANAGE_SCHEDULES` (see the viewer built at
          // the bottom of this file), which is the same key the API checks
          // before letting anyone onto a shift that has already passed. Always
          // false while `mode` is `signUp`, but stated rather than assumed.
          canManageSchedules: viewer.isCoordinator,
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
    const verb = mode === 'signUp' ? t('scheduleBoard.addMeToVerb') : t('scheduleBoard.assignToVerb');
    const where = `${role?.name ?? t('scheduleBoard.crewColumn')} on ${dayLabel}, ${shift.label}`;
    // Several identical buttons in one cell need telling apart by name.
    return openPlaces > 1
      ? t('scheduleBoard.placeLabelWithIndex', { verb, where, index: index + 1, total: openPlaces })
      : t('scheduleBoard.placeLabel', { verb, where });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 150 }}>
      {people.map((assignment) => (
        <AssignmentChip
          key={assignment.id}
          assignment={assignment}
          role={role}
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
  onAdjust,
  viewer,
}: {
  board: ScheduleBoardResponse;
  columns: Array<AvailabilityWindowRole | null>;
  conflictFor: (assignment: ScheduleAssignment) => ScheduleConflict | undefined;
  onAssign: (target: AssignTarget) => void;
  onRemove: (assignment: ScheduleAssignment) => void;
  onAdjust: (target: AdjustShiftTarget) => void;
  viewer: Viewer;
}) => {
  const t = useT();
  return (
  <TableContainer component={Paper} variant="outlined">
    <Table size="small">
      <TableHead>
        <TableRow sx={{ backgroundColor: 'grey.100' }}>
          <TableCell sx={{ minWidth: 150 }}>
            <strong>{t('scheduleBoard.colDate')}</strong>
          </TableCell>
          <TableCell sx={{ minWidth: 140 }}>
            <strong>{t('scheduleBoard.colShift')}</strong>
          </TableCell>
          {columns.map((role) => (
            <TableCell key={role?.id ?? CREW_COLUMN_KEY}>
              <strong>{role?.name ?? t('scheduleBoard.crewColumn')}</strong>
              <Typography variant="caption" color="text.secondary" display="block">
                {role ? formatRoleCapacity(role.maxPeople) : t('scheduleBoard.noRolesOnWindow')}
                {role?.requiredCertification
                  ? t('scheduleBoard.certRequiredSuffix', {
                      certification: certificationLabel(t, role.requiredCertification),
                    })
                  : ''}
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
                      {formatDayLabel(t, day.date)}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                      {day.isHoliday && (
                        <Chip
                          size="small"
                          color="warning"
                          variant="outlined"
                          label={
                            day.holidayName
                              ? t('dayType.holidayNamed', { name: day.holidayName })
                              : t('dayType.holiday')
                          }
                        />
                      )}
                      {day.isWeekend && !day.isHoliday && (
                        <Chip size="small" variant="outlined" label={t('dayType.weekend')} />
                      )}
                    </Stack>
                  </>
                )}
              </TableCell>
              <TableCell>
                {viewer.isCoordinator ? (
                  <Button
                    size="small"
                    variant="text"
                    sx={{ p: 0, minWidth: 0, fontWeight: 600, textTransform: 'none' }}
                    aria-label={t('scheduleBoard.adjustShiftAria', {
                      day: formatDayLabel(t, day.date),
                      label: shift.label,
                    })}
                    onClick={() =>
                      onAdjust({
                        date: day.date,
                        slot: shift.slot,
                        shift,
                        otherShiftsThatDay: day.shifts
                          .filter((other) => other.slot !== shift.slot)
                          .map((other) => ({
                            startMinute: other.startMinute,
                            endMinute: other.endMinute,
                          })),
                      })
                    }
                  >
                    {shift.label}
                  </Button>
                ) : (
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {shift.label}
                  </Typography>
                )}
                {shift.adjustment && (
                  <Typography variant="caption" color="warning.dark" display="block">
                    {t('scheduleBoard.adjustedWas', {
                      label: formatShiftLabel(shift.adjustment.original),
                    })}
                  </Typography>
                )}
              </TableCell>
              {columns.map((role) => (
                <TableCell key={role?.id ?? CREW_COLUMN_KEY} sx={{ verticalAlign: 'top' }}>
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
                    dayLabel={formatDayLabel(t, day.date)}
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
};

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
    columns.find((column) => column?.requiredCertification === CertificationType.DRIVER) ??
    columns[0] ??
    null;
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
  onAdjust,
  viewer,
}: {
  board: ScheduleBoardResponse;
  columns: Array<AvailabilityWindowRole | null>;
  conflictFor: (assignment: ScheduleAssignment) => ScheduleConflict | undefined;
  onAssign: (target: AssignTarget) => void;
  onRemove: (assignment: ScheduleAssignment) => void;
  onAdjust: (target: AdjustShiftTarget) => void;
  viewer: Viewer;
}) => {
  const t = useT();
  return (
  <Stack spacing={1}>
    {board.days.map((day: ScheduleDayBoard) => (
      <Card key={day.date} variant="outlined">
        <CardContent>
          <Typography variant="subtitle2">{formatDayLabel(t, day.date)}</Typography>
          <Stack spacing={2} sx={{ mt: 1.5 }}>
            {day.shifts.map((shift) => (
              <Box key={shift.slot}>
                {viewer.isCoordinator ? (
                  <Button
                    size="small"
                    variant="text"
                    sx={{ p: 0, minWidth: 0, fontWeight: 600, textTransform: 'none' }}
                    aria-label={t('scheduleBoard.adjustShiftAria', {
                      day: formatDayLabel(t, day.date),
                      label: shift.label,
                    })}
                    onClick={() =>
                      onAdjust({
                        date: day.date,
                        slot: shift.slot,
                        shift,
                        otherShiftsThatDay: day.shifts
                          .filter((other) => other.slot !== shift.slot)
                          .map((other) => ({
                            startMinute: other.startMinute,
                            endMinute: other.endMinute,
                          })),
                      })
                    }
                  >
                    {shift.label}
                  </Button>
                ) : (
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {shift.label}
                  </Typography>
                )}
                {shift.adjustment && (
                  <Typography variant="caption" color="warning.dark" display="block">
                    {t('scheduleBoard.adjustedWas', {
                      label: formatShiftLabel(shift.adjustment.original),
                    })}
                  </Typography>
                )}
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {columns.map((role) => (
                    <Box key={role?.id ?? CREW_COLUMN_KEY}>
                      <Typography variant="caption" color="text.secondary">
                        {role?.name ?? t('scheduleBoard.crewColumn')}
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
                        dayLabel={formatDayLabel(t, day.date)}
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
};

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
  const t = useT();
  const isMobile = useIsMobile();
  const { permissions } = usePermissions<UserRole[]>();
  const { identity } = useGetIdentity();
  const [board, setBoard] = useState<ScheduleBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<AssignTarget | null>(null);
  const [signUpTarget, setSignUpTarget] = useState<AssignTarget | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<AdjustShiftTarget | null>(null);
  const [autofillOpen, setAutofillOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBoard(await apiFetch<ScheduleBoardResponse>(`/schedules/${scheduleId}/board`));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('scheduleBoard.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [scheduleId, t]);

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
      setError(e instanceof Error ? e.message : t('scheduleBoard.removeFailed'));
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await apiDownload(`/schedules/${scheduleId}/csv`, `schedule-${scheduleId}.csv`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('scheduleBoard.exportFailed'));
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
    const self = identity as { isDriver?: boolean; certifications?: HeldCertification[] } | undefined;
    return {
      id,
      isDriver: Boolean(self?.isDriver),
      certifications: self?.certifications ?? [],
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
            <Typography variant="h6">{t('scheduleBoard.heading')}</Typography>
            <Chip
              size="small"
              variant="outlined"
              color={isPublished ? 'success' : 'default'}
              label={isPublished ? t('schedule.statusPublished') : t('schedule.statusDraft')}
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {formatDateRange(t, board.window.startDate, board.window.endDate)}
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
              {t('scheduleBoard.autofillButton')}
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
            {t('common.exportCsv')}
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            startIcon={<PrintIcon />}
            aria-label={t('scheduleBoard.printButton')}
            // A new tab keeps the board's own state (dialogs, scroll position)
            // intact — printing is a side trip, not a navigation away from it.
            // The app uses hash-based routing (react-admin's <Admin>), so the
            // URL must include the `/#/` segment or the tab won't land on
            // SchedulePrintPage.
            onClick={() => window.open(`/#/schedules/${scheduleId}/print`, '_blank', 'noopener')}
          >
            {t('action.print')}
          </Button>
          {viewer.isCoordinator && !isPublished && (
            <Button
              size="small"
              variant="contained"
              startIcon={<PublishIcon />}
              onClick={() => setPublishOpen(true)}
            >
              {t('scheduleBoard.publishButton')}
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
          {t('scheduleBoard.windowOpenInfo')}
        </Alert>
      )}

      {isPublished && viewer.isCoordinator && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {t('scheduleBoard.publishedCoordinatorInfo')}
        </Alert>
      )}

      {isPublished && !viewer.isCoordinator && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('scheduleBoard.publishedMemberInfo')}
        </Alert>
      )}

      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <StatTile
          value={`${stats.filledSlots} / ${stats.requiredSlots}`}
          label={t('scheduleBoard.statSlotsFilled')}
          color="#2E7D32"
        />
        <StatTile value={stats.shiftsWithGaps} label={t('scheduleBoard.statShiftsWithGaps')} color="#C62828" />
        <StatTile value={stats.overrideCount} label={t('scheduleBoard.statOverrides')} color="#616161" />
        <StatTile value={board.conflicts.length} label={t('scheduleBoard.doubleBooked')} color="#C62828" />
      </Stack>

      <BoardLegend />

      {board.conflicts.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t('scheduleBoard.doubleBooked')}
          </Typography>
          {board.conflicts.map((conflict) => (
            <Typography
              key={`${conflict.userId}-${conflict.date}-${conflict.slot}-${conflict.otherWindowId}`}
              variant="body2"
            >
              {t('scheduleBoard.conflictLine', {
                user: conflict.userName,
                day: formatDayLabel(t, conflict.date),
                window: conflict.otherWindowLabel,
                label: conflict.otherLabel,
              })}
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
          onAdjust={setAdjustTarget}
          viewer={viewer}
        />
      ) : (
        <DesktopBoard
          board={board}
          columns={columns}
          conflictFor={conflictFor}
          onAssign={viewer.isCoordinator ? setTarget : setSignUpTarget}
          onRemove={(assignment) => void handleRemove(assignment)}
          onAdjust={setAdjustTarget}
          viewer={viewer}
        />
      )}

      {board.days.length === 0 && (
        <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('scheduleBoard.noShifts')}
          </Typography>
        </Paper>
      )}

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary">
        {viewer.isCoordinator
          ? t('scheduleBoard.footerCoordinator')
          : t('scheduleBoard.footerMember')}
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
      <AdjustShiftDialog
        scheduleId={scheduleId}
        target={adjustTarget}
        isPublished={isPublished}
        onClose={() => setAdjustTarget(null)}
        onSaved={() => {
          setAdjustTarget(null);
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
