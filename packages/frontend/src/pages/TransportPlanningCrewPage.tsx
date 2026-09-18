import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Title } from 'react-admin';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { MyTransportTripsResponse } from '@redinfo/shared';
import { apiFetch, ApiError } from '../api';
import { apiErrorLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';
import { toIsoDate } from '../utils/dates';
import { TripCard } from './MyTransportTripsPage';
import './myTransportTrips.css';

/**
 * Planner-side counterpart to `MyTransportTripsPage` (#247 stage 6,
 * `/transport-planning/crew/:userId?date=`) — reached from the journey
 * inspector by clicking a crew member's own name, same no-drawer-entry
 * precedent as the journey and vehicle-day pages. Reuses `TripCard`/
 * `StopRow` unchanged: the manifest a driver reads on the road is exactly
 * what a coordinator needs to see when checking someone else's day, just
 * served by `GET /trips/crew/:userId` (gated `PLAN_TRANSPORT_TRIPS`, patient
 * identity degrading per the *viewer's* `VIEW_PATIENT_IDENTITY`) instead of
 * the self-scoped, never-degrading `GET /trips/me`.
 */
export const TransportPlanningCrewPage = () => {
  const { userId } = useParams<{ userId: string }>();
  const [searchParams] = useSearchParams();
  const date = searchParams.get('date') ?? toIsoDate(new Date());
  const crewMemberName = searchParams.get('name');
  const navigate = useNavigate();
  const t = useT();
  const [data, setData] = useState<MyTransportTripsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setData(await apiFetch<MyTransportTripsResponse>(`/trips/crew/${userId}?date=${date}`));
    } catch (cause) {
      setLoadError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportCrewDay.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [userId, date, t]);

  useEffect(() => {
    load();
  }, [load]);

  const pageTitle = crewMemberName
    ? `${crewMemberName} · ${t('transportCrewDay.pageTitle')}`
    : t('transportCrewDay.pageTitle');

  return (
    <Box className="my-transport-trips-app-chrome" sx={{ minWidth: 0 }}>
      <Title title={pageTitle} />

      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/transport-planning')}>
          {t('transportJourney.backToBoard')}
        </Button>
      </Stack>

      <Typography variant="h6">{pageTitle}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('transportCrewDay.dateLabel')} {date}
      </Typography>

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}
      {loading && <CircularProgress />}

      {!loading && data && data.trips.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('transportCrewDay.noTrips')}
        </Typography>
      )}

      {data?.trips.map((trip) => <TripCard key={trip.trip.id} trip={trip} />)}
    </Box>
  );
};
