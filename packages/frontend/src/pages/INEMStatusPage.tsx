import { useCallback, useEffect, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import {
  INEM_AVAILABLE_INOP_CODE,
  INEMSessionStatus,
  INEMStatusOverview,
  INEMUnit,
} from '@redinfo/shared';
import { apiFetch, ApiError } from '../api';
import { apiErrorLabel, inemReasonLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';
import { useIntlLocale } from '../i18n/useIntlLocale';

/**
 * How often the page re-polls `GET /inem/status`. Same cadence as
 * `LiveRunBoard` — often enough that a unit's "syncing" badge clears itself
 * once the reconciler catches up, rarely enough to be cheap.
 */
const REFRESH_MS = 20_000;

/**
 * The delegation's INEM units — in practice its emergency ambulances — with a
 * per-unit availability toggle and INOP reason (#216).
 *
 * Read-and-write, but never talks to INEM directly: `PUT /inem/units/:id`
 * only records the desired state, and `InemReconcilerService` pushes it
 * asynchronously on its own schedule. The gap between "desired" and
 * "reported" is normal and shown as a syncing badge, not an error — and when
 * the session itself is down, the banner below says so plainly and names the
 * fallback (INEM's own portal), because a silently stale toggle here is the
 * worst failure this feature has.
 */
export const INEMStatusPage = () => {
  const t = useT();
  const notify = useNotify();
  const [overview, setOverview] = useState<INEMStatusOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingUnitId, setSavingUnitId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<INEMStatusOverview>('/inem/status');
      setOverview(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? apiErrorLabel(t, e) : t('inem.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const setUnitStatus = async (unitId: string, inopCode: string) => {
    setSavingUnitId(unitId);
    // Optimistic: the write returns immediately and the reconciler pushes
    // asynchronously, so waiting on a full reload here would make every
    // toggle feel like it did nothing for a moment.
    setOverview((prev) =>
      prev
        ? {
            ...prev,
            units: prev.units.map((u) => (u.unitId === unitId ? { ...u, desiredInopCode: inopCode } : u)),
          }
        : prev,
    );
    try {
      await apiFetch(`/inem/units/${unitId}`, { method: 'PUT', body: { inopCode } });
    } catch (e) {
      notify(e instanceof ApiError ? apiErrorLabel(t, e) : t('inem.saveFailed'), { type: 'warning' });
      void load(); // revert the optimistic write to server truth
    } finally {
      setSavingUnitId(null);
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Title title={t('inem.pageTitle')} />
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {t('inem.heading')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('inem.subheading')}
      </Typography>

      {overview && overview.sessionStatus !== INEMSessionStatus.ACTIVE && (
        <DegradedBanner status={overview.sessionStatus} />
      )}

      {!overview && !loadError && <CircularProgress size={24} />}
      {loadError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}

      {overview && overview.units.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('inem.noUnits')}
        </Typography>
      )}

      {overview && overview.units.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(320px, 1fr))' },
            gap: 2,
          }}
        >
          {overview.units.map((unit) => (
            <UnitCard
              key={unit.unitId}
              unit={unit}
              reasons={overview.inopReasons}
              saving={savingUnitId === unit.unitId}
              onSetStatus={setUnitStatus}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

const DegradedBanner = ({ status }: { status: INEMSessionStatus }) => {
  const t = useT();
  if (status !== INEMSessionStatus.FAILED && status !== INEMSessionStatus.EXPIRED) return null;
  return (
    <Alert severity={status === INEMSessionStatus.FAILED ? 'error' : 'warning'} sx={{ mb: 2 }}>
      {t(status === INEMSessionStatus.FAILED ? 'inem.degradedBanner.FAILED' : 'inem.degradedBanner.EXPIRED')}
    </Alert>
  );
};

interface UnitCardProps {
  unit: INEMUnit;
  /** The live `GET /api/INOP` map (code → INEM's own label), or its offline fallback. */
  reasons: Record<string, string>;
  saving: boolean;
  onSetStatus: (unitId: string, inopCode: string) => void;
}

const UnitCard = ({ unit, reasons, saving, onSetStatus }: UnitCardProps) => {
  const t = useT();
  const intlLocale = useIntlLocale();
  const isAvailable = unit.desiredInopCode === INEM_AVAILABLE_INOP_CODE;
  // Tracks the reason picker's visibility from `isAvailable`, but only when
  // *that* actually changes — set directly (not derived inline) so a click
  // on the switch reveals the picker immediately, before any request has
  // gone out and before `isAvailable` itself has moved. Without that, the
  // next poll would land with server truth still unchanged and flip the
  // switch back on under the coordinator's thumb.
  const [editing, setEditing] = useState(!isAvailable);
  useEffect(() => setEditing(!isAvailable), [isAvailable]);

  const checked = isAvailable && !editing;
  const reasonValue = !checked && unit.desiredInopCode && unit.desiredInopCode !== INEM_AVAILABLE_INOP_CODE
    ? unit.desiredInopCode
    : '';
  const syncing = unit.desiredInopCode !== unit.reportedInopCode;

  const vehicleLabel = unit.vehicle
    ? `${unit.vehicle.licensePlate} – ${unit.vehicle.numeroCauda}`
    : (unit.carId ?? unit.unitId);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="flex-start" spacing={1}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800 }} noWrap>
              {vehicleLabel}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {[unit.station, unit.unitId].filter(Boolean).join(' · ')}
              {!unit.vehicle && ` · ${t('inem.noVehicleMatch')}`}
            </Typography>
          </Box>
          {syncing && (
            <Chip
              size="small"
              icon={<SyncIcon fontSize="small" />}
              label={t('inem.syncing')}
              color="info"
              variant="outlined"
            />
          )}
        </Stack>

        <FormControlLabel
          sx={{ mt: 1, ml: 0 }}
          control={
            <Switch
              checked={checked}
              disabled={saving}
              onChange={(event) => {
                if (event.target.checked) {
                  setEditing(false);
                  onSetStatus(unit.unitId, INEM_AVAILABLE_INOP_CODE);
                } else {
                  setEditing(true);
                }
              }}
            />
          }
          label={t('inem.available')}
        />

        {!checked && (
          <TextField
            select
            fullWidth
            size="small"
            label={t('inem.reasonLabel')}
            value={reasonValue}
            disabled={saving}
            onChange={(event) => onSetStatus(unit.unitId, event.target.value)}
            sx={{ mt: 1 }}
          >
            <MenuItem value="" disabled>
              {t('inem.reasonPlaceholder')}
            </MenuItem>
            {Object.entries(reasons).map(([code, apiLabel]) => (
              <MenuItem key={code} value={code}>
                {inemReasonLabel(t, code, apiLabel)}
              </MenuItem>
            ))}
          </TextField>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {unit.lastSyncedAt
            ? t('inem.lastSyncedAt', { time: new Date(unit.lastSyncedAt).toLocaleString(intlLocale) })
            : t('inem.neverSynced')}
        </Typography>
        {unit.lastError && (
          <Typography variant="caption" color="error" sx={{ display: 'block' }}>
            {t('inem.lastError', { error: unit.lastError })}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};
