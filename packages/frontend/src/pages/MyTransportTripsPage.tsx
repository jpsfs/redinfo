import { useCallback, useEffect, useState } from 'react';
import { Title } from 'react-admin';
import { Alert, Box, Card, CardContent, Chip, CircularProgress, IconButton, Stack, TextField, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PrintIcon from '@mui/icons-material/Print';
import PersonPinCircleIcon from '@mui/icons-material/PersonPinCircle';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import HomeIcon from '@mui/icons-material/Home';
import { CrewManifestStop, CrewManifestTrip, LegDirection, MyTransportTripsResponse, TripStopKind } from '@redinfo/shared';
import { ApiError, apiFetch } from '../api';
import { apiErrorLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';
import { useIntlLocale } from '../i18n/useIntlLocale';
import { addIsoDays, formatDayLabel, toIsoDate } from '../utils/dates';
import { MobilityChip } from '../resources/patients/patientChips';
import './myTransportTrips.css';

/** How often the page re-polls `GET /trips/me` — same cadence as
 * `INEMStatusPage`/`LiveRunBoard`: often enough that a return leg
 * re-assigned to another crew disappears from this page without a manual
 * reload (#236's own acceptance criterion), rarely enough to be cheap. */
const REFRESH_MS = 20_000;

const STOP_ICON: Record<TripStopKind, typeof PersonPinCircleIcon> = {
  [TripStopKind.PICKUP]: PersonPinCircleIcon,
  [TripStopKind.DROPOFF]: LocalHospitalIcon,
  [TripStopKind.WAIT]: HourglassEmptyIcon,
  [TripStopKind.RETURN_TO_BASE]: HomeIcon,
  [TripStopKind.DEPART_FROM_BASE]: HomeIcon,
};

const StopRow = ({ stop }: { stop: CrewManifestStop }) => {
  const t = useT();
  const intlLocale = useIntlLocale();
  const Icon = STOP_ICON[stop.kind];
  const time = new Date(stop.plannedAt).toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' });
  const isReturnPickup = stop.kind === TripStopKind.PICKUP && stop.legDirection === LegDirection.RETURN;

  return (
    <Box
      className="my-transport-trip-stop"
      sx={{
        display: 'flex',
        gap: 1.5,
        p: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      <Box sx={{ flex: 'none', textAlign: 'center', width: 56 }}>
        <Icon color="action" />
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
          {time}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {t(`myTransportTrips.stopKind.${stop.kind}`)}
          </Typography>
          {stop.patientMobility && <MobilityChip value={stop.patientMobility} />}
          {stop.kind === TripStopKind.WAIT && <Chip size="small" color="warning" label={t('myTransportTrips.waitsHere')} />}
          {isReturnPickup && (
            <Chip
              size="small"
              color={stop.actualAt ? 'success' : 'default'}
              label={
                stop.actualAt
                  ? t('myTransportTrips.readyAt', {
                      time: new Date(stop.actualAt).toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' }),
                    })
                  : t('myTransportTrips.readyAwaiting')
              }
            />
          )}
        </Stack>
        {stop.patientName && (
          <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 500 }}>
            {stop.patientName}
          </Typography>
        )}
        {(stop.facilityName || stop.address) && (
          <Typography variant="body2" color="text.secondary">
            {stop.facilityName ?? stop.address}
          </Typography>
        )}
        {stop.appointmentAt && stop.treatmentEndAt && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {t('myTransportTrips.treatmentWindow', {
              start: new Date(stop.appointmentAt).toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' }),
              end: new Date(stop.treatmentEndAt).toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' }),
            })}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

/** Exported for `TransportPlanningCrewPage` (#247 stage 6) — the planner's
 * read of someone else's day reuses the same manifest card this page built
 * for a crew member's own, rather than a second implementation of it. */
export const TripCard = ({ trip }: { trip: CrewManifestTrip }) => {
  const t = useT();
  return (
    <Card variant="outlined" className="my-transport-trip-card" sx={{ mb: 2 }}>
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6">{t('myTransportTrips.vehicleLabel', { plate: trip.vehicle.licensePlate })}</Typography>
        </Box>
        {trip.stops.map((stop) => (
          <StopRow key={stop.id} stop={stop} />
        ))}
      </CardContent>
    </Card>
  );
};

/**
 * A crew member's own transport trips for a date (#236) — the crew manifest,
 * ordered stops with planned times, the artefact a driver actually works
 * from. Self-scoped, following `MyDutiesPage`/`GET /schedules/me`: no action
 * beyond being the assigned crew member on `GET /trips/me`.
 *
 * Live and print in one screen rather than two: the same data a driver reads
 * on the road is what `window.print()` turns into paper via
 * `myTransportTrips.css`'s `@media print` rules, one page per trip — no
 * server-generated PDF, same choice `SchedulePrintPage` made.
 *
 * Polls every `REFRESH_MS` so a return leg re-assigned to another crew
 * disappears here without a manual reload — the one acceptance criterion a
 * one-shot fetch couldn't satisfy.
 */
export const MyTransportTripsPage = () => {
  const t = useT();
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [data, setData] = useState<MyTransportTripsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<MyTransportTripsResponse>(`/trips/me?date=${date}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? apiErrorLabel(t, e) : t('myTransportTrips.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [date, t]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <Card sx={{ mt: 2 }} className="my-transport-trips-app-chrome">
      <Title title={t('myTransportTrips.pageTitle')} />
      <CardContent>
        <Typography variant="h6">{t('myTransportTrips.heading')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('myTransportTrips.subheading')}
        </Typography>

        <Stack
          className="my-transport-trips-toolbar"
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ mb: 2 }}
        >
          <IconButton
            aria-label={t('myTransportTrips.previousDay')}
            onClick={() => setDate((d) => addIsoDays(d, -1))}
            sx={{ minWidth: 48, minHeight: 48 }}
          >
            <ChevronLeftIcon />
          </IconButton>
          <TextField
            type="date"
            size="small"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            inputProps={{ 'aria-label': formatDayLabel(t, date) }}
          />
          <IconButton
            aria-label={t('myTransportTrips.nextDay')}
            onClick={() => setDate((d) => addIsoDays(d, 1))}
            sx={{ minWidth: 48, minHeight: 48 }}
          >
            <ChevronRightIcon />
          </IconButton>
          <IconButton
            aria-label={t('myTransportTrips.printButton')}
            onClick={() => window.print()}
            sx={{ minWidth: 48, minHeight: 48, ml: 'auto' }}
          >
            <PrintIcon />
          </IconButton>
        </Stack>

        {loading && <CircularProgress size={24} />}

        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {data && data.trips.length === 0 && !loading && (
          <Typography variant="body2" color="text.secondary">
            {t('myTransportTrips.noTrips')}
          </Typography>
        )}

        {data?.trips.map((trip) => <TripCard key={trip.trip.id} trip={trip} />)}
      </CardContent>
    </Card>
  );
};
