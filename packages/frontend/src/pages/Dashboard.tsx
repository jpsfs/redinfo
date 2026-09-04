import {
  Card,
  CardContent,
  Typography,
  Box,
  Alert,
  Chip,
  Stack,
  Divider,
  CircularProgress,
} from '@mui/material';
import { DelegacaoCampoLogo } from '../components/DelegacaoCampoLogo';
import { useGetList, Link, useGetIdentity, usePermissions } from 'react-admin';
import { useEffect, useState } from 'react';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import AssignmentLateIcon from '@mui/icons-material/AssignmentLate';
import EventNoteIcon from '@mui/icons-material/EventNote';
import TodayIcon from '@mui/icons-material/Today';
import CakeIcon from '@mui/icons-material/Cake';
import {
  Action,
  BirthdaysTodayResponse,
  MyDutiesResponse,
  MyDuty,
  TodayRosterResponse,
  hasPermission,
  UserRole,
} from '@redinfo/shared';
import { apiFetch } from '../api';
import { useIntlLocale } from '../i18n/useIntlLocale';
import { useT } from '../i18n/useT';
import { LiveRunBoard } from '../resources/liveRuns';
import { WindowCategoryChip } from '../resources/availability/WindowIdentity';
import { addIsoDays, formatDayLabel, toIsoDate } from '../utils/dates';

const DAYS_WARN = 30;

function isExpiringSoon(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const target = new Date(dateStr);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= DAYS_WARN * 24 * 60 * 60 * 1000;
}

function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

interface VehicleRecord {
  id: string;
  licensePlate: string;
  numeroCauda: string;
  vehicleType: 'EMERGENCY' | 'TRANSPORT';
  insuranceRenewalDate: string;
  nextImtInspectionDate: string;
}

interface LowStockVehicle {
  vehicle: {
    id: string;
    licensePlate: string;
    numeroCauda: string;
    vehicleType: 'EMERGENCY' | 'TRANSPORT';
  };
  hasLowStock: boolean;
  lowStockItems: Array<{
    templateItem: { name: string; recommendedQuantity: number | null; unit: string };
    vehicleInventoryItem: { actualQuantity: number | null } | null;
  }>;
}

interface LowStockResponse {
  grouped: Record<string, LowStockVehicle[]>;
  total: number;
}

const LowStockPanel = () => {
  const t = useT();
  const [data, setData] = useState<LowStockResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Was reading the bearer token out of a `localStorage['auth']` key that
    // has never existed in this app (the token lives under the key
    // `authProvider.ts` uses) — every request 401'd, and the panel then threw
    // trying to read `.grouped` off the error body, taking the whole
    // Dashboard down. `apiFetch` is the one place that knows where the token
    // actually is, and rejects on a non-2xx instead of resolving to it.
    apiFetch<LowStockResponse>('/vehicles/low-stock')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <CircularProgress size={20} />;
  if (!data || data.total === 0) return null;

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <InventoryIcon color="error" />
          <Typography variant="h6" fontWeight={700} color="error">
            {t('dashboard.lowStockTitle', { count: data.total })}
          </Typography>
        </Box>
        <Stack spacing={1.5} divider={<Divider flexItem />}>
          {Object.entries(data.grouped).flatMap(([, vehicles]) =>
            vehicles.map((item) => (
              <Box
                key={item.vehicle.id}
                component={Link}
                to={`/vehicles/${item.vehicle.id}/show`}
                sx={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  {item.vehicle.vehicleType === 'EMERGENCY' ? (
                    <DirectionsCarIcon fontSize="small" color="error" />
                  ) : (
                    <LocalShippingIcon fontSize="small" color="primary" />
                  )}
                  <Typography variant="body2" fontWeight={600}>
                    {item.vehicle.licensePlate} – {item.vehicle.numeroCauda}
                  </Typography>
                  {item.lowStockItems.slice(0, 3).map((li, idx) => (
                    <Chip
                      key={idx}
                      size="small"
                      color="error"
                      variant="outlined"
                      label={`${li.templateItem.name}: ${li.vehicleInventoryItem?.actualQuantity ?? 0}/${li.templateItem.recommendedQuantity} ${li.templateItem.unit}`}
                    />
                  ))}
                  {item.lowStockItems.length > 3 && (
                    <Chip
                      size="small"
                      label={t('dashboard.moreItems', { count: item.lowStockItems.length - 3 })}
                      variant="outlined"
                    />
                  )}
                </Box>
              </Box>
            )),
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

/**
 * Who is on the rota today, right across the delegation.
 *
 * The first thing on the Dashboard, and the one card that is always rendered:
 * "nobody is on today" is itself the answer someone came for, so unlike every
 * other panel here this one says so in words instead of disappearing.
 *
 * Grouped by *category*, not by schedule — two Emergency rotas running today
 * read as one "Emergency" heading, because "is there emergency cover tonight?"
 * is the question, not "which of the two rotas is it on". The rota's own name
 * still sits beside each slot for anyone who needs to tell them apart.
 *
 * `GET /schedules/today` has already dropped every shift short of its
 * mandatory posts, so everything here is cover that will actually run.
 */
export const TodayScheduleCard = () => {
  const t = useT();
  const { identity } = useGetIdentity();
  const [roster, setRoster] = useState<TodayRosterResponse | null>(null);

  useEffect(() => {
    apiFetch<TodayRosterResponse>('/schedules/today')
      .then(setRoster)
      .catch(() => setRoster({ date: toIsoDate(new Date()), groups: [] }));
  }, []);

  if (!roster) return null;

  return (
    <Card data-testid="today-schedule-card">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <TodayIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>
            {t('dashboard.todayScheduleTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatDayLabel(t, roster.date)}
          </Typography>
        </Box>

        {roster.groups.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('dashboard.todayNoShift')}
          </Typography>
        ) : (
          <Stack spacing={2} divider={<Divider flexItem />}>
            {roster.groups.map((group) => (
              <Box key={group.category}>
                <WindowCategoryChip category={group.category} />
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  {group.slots.map((slot) => (
                    <Box key={`${slot.scheduleId}#${slot.slot}`}>
                      <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
                        <Typography variant="body2" fontWeight={700}>
                          {slot.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {slot.windowLabel}
                        </Typography>
                      </Stack>
                      <Stack
                        direction="row"
                        spacing={0.75}
                        flexWrap="wrap"
                        useFlexGap
                        sx={{ mt: 0.5 }}
                      >
                        {slot.crew.map((member) => {
                          // Spotting yourself in a delegation-wide list is the
                          // one thing this card can't leave to reading names.
                          const isMe = identity?.id === member.userId;
                          const name = `${member.firstName} ${member.lastName}`;
                          return (
                            <Chip
                              key={member.userId}
                              size="small"
                              variant={isMe ? 'filled' : 'outlined'}
                              color={isMe ? 'primary' : 'default'}
                              label={
                                member.roleName
                                  ? `${name} · ${member.roleName}`
                                  : name
                              }
                            />
                          );
                        })}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Whose birthday it is — nothing at all on an ordinary day.
 *
 * `GET /users/birthdays` returns names only, never the date or the year, which
 * is what lets this be ungated: `birthDate` is a sensitive personnel field,
 * but "it's Ana's birthday" is not.
 */
export const BirthdaysCard = () => {
  const t = useT();
  const [birthdays, setBirthdays] = useState<BirthdaysTodayResponse | null>(null);

  useEffect(() => {
    apiFetch<BirthdaysTodayResponse>('/users/birthdays')
      .then(setBirthdays)
      .catch(() => setBirthdays(null));
  }, []);

  if (!birthdays || birthdays.people.length === 0) return null;

  return (
    <Card data-testid="birthdays-card">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <CakeIcon color="secondary" />
          <Typography variant="h6" fontWeight={700}>
            {t('dashboard.birthdaysTitle', { smart_count: birthdays.people.length })}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {birthdays.people.map((person) => (
            <Chip
              key={person.id}
              size="small"
              color="secondary"
              variant="outlined"
              label={`${person.firstName} ${person.lastName}`}
            />
          ))}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {t('dashboard.birthdayWish')}
        </Typography>
      </CardContent>
    </Card>
  );
};

/** One card per schedule the caller is on, grouping its shifts together. */
interface UpcomingShiftGroup {
  scheduleId: string;
  windowCategory: MyDuty['windowCategory'];
  windowLabel: string;
  duties: MyDuty[];
}

const DAYS_AHEAD = 7;

/**
 * What's next for the signed-in person, across every rota they're on.
 *
 * Grouped by schedule rather than listed flat: two Emergency shifts and one
 * Apoio Local shift is one heading each, not three unrelated rows — the same
 * reading `MyDutiesPage` gives the full list, condensed to a week and to a
 * dashboard-sized card. Ungated and self-scoped, the same way `/my-duties`
 * itself is; renders nothing when there is nothing due this week.
 */
export const UpcomingShiftsPanel = () => {
  const t = useT();
  const [duties, setDuties] = useState<MyDutiesResponse | null>(null);

  useEffect(() => {
    apiFetch<MyDutiesResponse>('/schedules/me')
      .then(setDuties)
      .catch(() => setDuties(null));
  }, []);

  if (!duties) return null;

  const horizon = addIsoDays(toIsoDate(new Date()), DAYS_AHEAD);
  const dueThisWeek = duties.upcoming.filter((duty) => duty.date <= horizon);
  if (dueThisWeek.length === 0) return null;

  // `duties.upcoming` is already date-then-slot ordered, so grouping while
  // walking it keeps each group's own shifts in that order too, and gives
  // the groups themselves the order their earliest shift falls in.
  const groups: UpcomingShiftGroup[] = [];
  for (const duty of dueThisWeek) {
    const group = groups.find((candidate) => candidate.scheduleId === duty.scheduleId);
    if (group) {
      group.duties.push(duty);
    } else {
      groups.push({
        scheduleId: duty.scheduleId,
        windowCategory: duty.windowCategory,
        windowLabel: duty.windowLabel,
        duties: [duty],
      });
    }
  }

  return (
    <Card data-testid="upcoming-shifts-panel">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <EventNoteIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>
            {t('dashboard.upcomingShiftsTitle')}
          </Typography>
        </Box>
        <Stack spacing={2} divider={<Divider flexItem />}>
          {groups.map((group) => (
            <Box key={group.scheduleId}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <WindowCategoryChip category={group.windowCategory} />
                <Typography variant="subtitle2">{group.windowLabel}</Typography>
              </Stack>
              <Stack spacing={0.75}>
                {group.duties.map((duty) => (
                  <Box
                    key={duty.id}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
                  >
                    <Typography variant="body2" fontWeight={600}>
                      {formatDayLabel(t, duty.date)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {duty.label}
                    </Typography>
                    {duty.roleName && (
                      <Chip size="small" variant="outlined" label={duty.roleName} />
                    )}
                  </Box>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
};

interface CertificationAlerts {
  expiring: number;
  expired: number;
}

const certificationFilterLink = (status: 'EXPIRING' | 'EXPIRED') =>
  `/users?filter=${encodeURIComponent(JSON.stringify({ certificationStatus: status }))}`;

/**
 * Coordinators/admins only — a plain operational already sees their own
 * lapsed certifications on `MyProfilePage`. Backed by
 * `GET /users/certification-alerts`, which counts *people*, not
 * certifications, the same way the personnel registry's own
 * `certificationStatus` filter does — so the numbers here always match what
 * clicking through actually lists.
 */
export const CertificationAlertsTile = () => {
  const t = useT();
  const { permissions, isLoading } = usePermissions<UserRole[]>();
  const [alerts, setAlerts] = useState<CertificationAlerts | null>(null);
  const canView = Boolean(permissions && hasPermission(permissions, Action.MANAGE_PERSONNEL));

  useEffect(() => {
    if (!canView) return;
    apiFetch<CertificationAlerts>('/users/certification-alerts')
      .then(setAlerts)
      .catch(() => setAlerts(null));
  }, [canView]);

  if (isLoading || !canView || !alerts || (alerts.expired === 0 && alerts.expiring === 0)) return null;

  return (
    <Card data-testid="certification-alerts-tile">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AssignmentLateIcon color="warning" />
          <Typography variant="h6" fontWeight={700}>
            {t('dashboard.certificationsTitle')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          {alerts.expired > 0 && (
            <Box component={Link} to={certificationFilterLink('EXPIRED')} sx={{ textDecoration: 'none' }}>
              <Chip
                color="error"
                label={t('dashboard.certExpiredCount', { smart_count: alerts.expired })}
                clickable
              />
            </Box>
          )}
          {alerts.expiring > 0 && (
            <Box component={Link} to={certificationFilterLink('EXPIRING')} sx={{ textDecoration: 'none' }}>
              <Chip
                color="warning"
                label={t('dashboard.certExpiringCount', { smart_count: alerts.expiring })}
                clickable
              />
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

const UpcomingAlertsPanel = () => {
  const t = useT();
  const intlLocale = useIntlLocale();
  const { data: vehicles, isLoading } = useGetList<VehicleRecord>('vehicles', {
    pagination: { page: 1, perPage: 100 },
    sort: { field: 'insuranceRenewalDate', order: 'ASC' },
  });

  if (isLoading || !vehicles) return null;

  const flagged = vehicles.filter(
    (v) =>
      isOverdue(v.insuranceRenewalDate) ||
      isExpiringSoon(v.insuranceRenewalDate) ||
      isOverdue(v.nextImtInspectionDate) ||
      isExpiringSoon(v.nextImtInspectionDate),
  );

  if (flagged.length === 0) return null;

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <WarningAmberIcon color="warning" />
          <Typography variant="h6" fontWeight={700}>
            {t('dashboard.renewalsTitle', { count: flagged.length })}
          </Typography>
        </Box>
        <Stack spacing={1.5} divider={<Divider flexItem />}>
          {flagged.map((v) => (
            <Box
              key={v.id}
              component={Link}
              to={`/vehicles/${v.id}/show`}
              sx={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                {v.vehicleType === 'EMERGENCY' ? (
                  <DirectionsCarIcon fontSize="small" color="error" />
                ) : (
                  <LocalShippingIcon fontSize="small" color="primary" />
                )}
                <Typography variant="body2" fontWeight={600}>
                  {v.licensePlate} – {v.numeroCauda}
                </Typography>
                {(isOverdue(v.insuranceRenewalDate) ||
                  isExpiringSoon(v.insuranceRenewalDate)) && (
                  <Chip
                    size="small"
                    color={isOverdue(v.insuranceRenewalDate) ? 'error' : 'warning'}
                    label={`${t('dashboard.insuranceLabel')}: ${new Date(v.insuranceRenewalDate).toLocaleDateString(intlLocale)}${isOverdue(v.insuranceRenewalDate) ? t('vehicleShow.overdueSuffix') : ''}`}
                    variant="outlined"
                  />
                )}
                {(isOverdue(v.nextImtInspectionDate) ||
                  isExpiringSoon(v.nextImtInspectionDate)) && (
                  <Chip
                    size="small"
                    color={isOverdue(v.nextImtInspectionDate) ? 'error' : 'warning'}
                    label={`IMT: ${new Date(v.nextImtInspectionDate).toLocaleDateString(intlLocale)}${isOverdue(v.nextImtInspectionDate) ? t('vehicleShow.overdueSuffix') : ''}`}
                    variant="outlined"
                  />
                )}
              </Box>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
};

/**
 * The Dashboard's own shape.
 *
 * Three bands, in the order someone actually scans them:
 *
 *  1. A slim identity strip. This used to be a full-height hero that pushed
 *     everything operational below the fold on a phone — it is decoration, so
 *     it now costs one row rather than a screen.
 *  2. The two full-width cards: who is on today, then a live emergency if one
 *     is running. Both are about *right now* and both can be wide.
 *  3. Everything else, two columns from `md` up and one below. These are
 *     independent alerts of varying height, and most render nothing at all on
 *     a quiet day — a CSS grid handles that by itself (a panel returning
 *     `null` simply takes no cell), which is why this is a grid rather than
 *     hand-placed columns.
 */
export const Dashboard = () => {
  const t = useT();
  return (
    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardContent
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
            // The last child of a MUI CardContent gets 24px of bottom padding
            // it does not need here; without this the strip is visibly
            // lopsided against the cards below it.
            '&:last-child': { pb: 2 },
          }}
        >
          <DelegacaoCampoLogo sx={{ width: { xs: 48, sm: 56 }, height: 'auto', borderRadius: 1 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} noWrap>
              {t('dashboard.welcomeTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('dashboard.welcomeSubtitle')}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Always rendered, even with nobody on: "there is no shift today" is
          the answer someone opened this to get. */}
      <TodayScheduleCard />

      {/* An emergency being run right now outranks an insurance renewal in
          three weeks. Renders nothing at all when there are no open runs, or
          when the reader has no oversight permission. */}
      <LiveRunBoard />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
          gap: 2,
          // Cards keep their own height instead of stretching to match the
          // tallest in the row — a two-chip birthday card next to a ten-row
          // low-stock list should not become ten rows of whitespace.
          alignItems: 'start',
        }}
      >
        <BirthdaysCard />
        <UpcomingShiftsPanel />
        <CertificationAlertsTile />
        <UpcomingAlertsPanel />
        <LowStockPanel />
      </Box>

      <Alert severity="info">
        {t('dashboard.warningPrefix')}{' '}
        <strong>
          {DAYS_WARN} {t('dashboard.daysUnit')}
        </strong>{' '}
        {t('dashboard.warningSuffix')}
      </Alert>
    </Box>
  );
};
