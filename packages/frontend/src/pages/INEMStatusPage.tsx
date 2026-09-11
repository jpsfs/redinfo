import { useCallback, useEffect, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SyncIcon from '@mui/icons-material/Sync';
import { INEM_AVAILABLE_INOP_CODE, INEMSessionStatus, INEMStatusOverview, INEMUnit } from '@redinfo/shared';
import { apiFetch, ApiError } from '../api';
import { apiErrorLabel, inemReasonLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';
import { useIntlLocale } from '../i18n/useIntlLocale';
import { SetUnitStatusDialog } from './inem/SetUnitStatusDialog';

/**
 * How often the page re-polls `GET /inem/status`. Same cadence as
 * `LiveRunBoard` — often enough that a unit's "syncing" badge clears itself
 * once the reconciler catches up, rarely enough to be cheap.
 */
const REFRESH_MS = 20_000;

/**
 * The delegation's INEM units — in practice its emergency ambulances — with a
 * per-unit availability status and INOP reason (#216).
 *
 * Read-and-write, but never talks to INEM directly: `PUT /inem/units/:id`
 * only records the desired state, and `InemReconcilerService` pushes it —
 * right away, not just on its next scheduled pass — in the background. The
 * gap between "desired" and "reported" is normal and shown as a syncing
 * badge, not an error — and when the session itself is down, the banner
 * below says so plainly and names the fallback (INEM's own portal), because
 * a silently stale status here is the worst failure this feature has.
 *
 * `UnitCard` is a pure display — a status a non-tech crew member can read at
 * a glance, no toggle to interpret — and `SetUnitStatusDialog` is the only
 * thing that writes: its title names the one vehicle it edits, so it can
 * never read as a fleet-wide action. Earlier this fired a request on every
 * click of an inline switch, which meant a slip of the thumb (or an
 * accidental double-tap while scrolling) could report an ambulance INOP on
 * INEM's own portal without the crew ever meaning to commit that change;
 * routing every edit through an explicit dialog Save keeps that intent real.
 */
export const INEMStatusPage = () => {
  const t = useT();
  const notify = useNotify();
  const [overview, setOverview] = useState<INEMStatusOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingUnitId, setSavingUnitId] = useState<string | null>(null);
  const [syncingNow, setSyncingNow] = useState(false);
  const [dialogUnitId, setDialogUnitId] = useState<string | null>(null);

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

  // "Sync now" (unlike a per-unit Save) waits on the pass itself — it's a
  // direct request for feedback, so it's worth the round trip to be able to
  // say whether it actually worked instead of firing and hoping.
  const handleSyncNow = async () => {
    setSyncingNow(true);
    try {
      await apiFetch('/inem/sync-now', { method: 'POST' });
      notify(t('inem.syncNowSuccess'), { type: 'info' });
      void load();
    } catch (e) {
      notify(e instanceof ApiError ? apiErrorLabel(t, e) : t('inem.syncNowFailed'), { type: 'warning' });
    } finally {
      setSyncingNow(false);
    }
  };

  const setUnitStatus = async (unitId: string, inopCode: string) => {
    setSavingUnitId(unitId);
    // Optimistic: the write returns immediately and the reconciler pushes
    // asynchronously, so waiting on a full reload here would make every
    // save feel like it did nothing for a moment.
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
      setDialogUnitId(null); // close on success
    } catch (e) {
      notify(e instanceof ApiError ? apiErrorLabel(t, e) : t('inem.saveFailed'), { type: 'warning' });
      void load(); // revert the optimistic write to server truth
      // The dialog stays open (`dialogUnitId` untouched) so the crew member
      // can just retry Save instead of having to reopen and redo the edit.
    } finally {
      setSavingUnitId(null);
    }
  };

  const dialogUnit = overview?.units.find((u) => u.unitId === dialogUnitId) ?? null;

  return (
    <Box sx={{ mt: 2 }}>
      <Title title={t('inem.pageTitle')} />
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }} spacing={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            {t('inem.heading')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('inem.subheading')}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={syncingNow ? <CircularProgress size={16} /> : <SyncIcon fontSize="small" />}
          disabled={!overview || syncingNow}
          onClick={handleSyncNow}
          sx={{ flexShrink: 0 }}
        >
          {t('inem.syncNow')}
        </Button>
      </Stack>

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
              onChangeStatus={() => setDialogUnitId(unit.unitId)}
            />
          ))}
        </Box>
      )}

      <SetUnitStatusDialog
        unit={dialogUnit}
        reasons={overview?.inopReasons ?? {}}
        saving={savingUnitId === dialogUnitId}
        onConfirm={setUnitStatus}
        onClose={() => setDialogUnitId(null)}
      />
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
  onChangeStatus: () => void;
}

/**
 * Purely a display — see the page's own doc comment for why editing moved
 * out of here and into `SetUnitStatusDialog`. Status reads off the *desired*
 * code (what the crew last asked for), same as before; the syncing chip is
 * what tells a reader whether INEM has actually confirmed it yet.
 */
const UnitCard = ({ unit, reasons, onChangeStatus }: UnitCardProps) => {
  const t = useT();
  const intlLocale = useIntlLocale();

  const code = unit.desiredInopCode;
  const syncing = code !== null && code !== unit.reportedInopCode;

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

        <Box sx={{ mt: 1.5 }}>
          <StatusChip code={code} reasons={reasons} />
        </Box>

        <Button size="small" variant="outlined" onClick={onChangeStatus} sx={{ mt: 1.5 }}>
          {t('inem.changeStatus')}
        </Button>

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

/**
 * The whole point of this pass: a status a non-tech crew member reads at a
 * glance, not one they have to infer from a switch's position. Three states —
 * available, INOP-with-reason, or "nobody's told INEM anything yet" — never
 * a bare toggle.
 */
const StatusChip = ({ code, reasons }: { code: string | null; reasons: Record<string, string> }) => {
  const t = useT();

  if (code === null) {
    return <Chip size="small" icon={<HelpOutlineIcon fontSize="small" />} label={t('inem.statusUnset')} variant="outlined" />;
  }

  if (code === INEM_AVAILABLE_INOP_CODE) {
    return <Chip size="small" icon={<CheckCircleIcon fontSize="small" />} label={t('inem.available')} color="success" />;
  }

  return (
    <Stack spacing={0.5} alignItems="flex-start">
      <Chip size="small" icon={<CancelIcon fontSize="small" />} label={t('inem.statusUnavailable')} color="error" />
      <Typography variant="body2" color="text.secondary">
        {inemReasonLabel(t, code, reasons[code] ?? code)}
      </Typography>
    </Stack>
  );
};
