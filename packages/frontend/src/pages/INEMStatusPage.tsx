import { useCallback, useEffect, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import {
  Alert,
  Box,
  Button,
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
import SaveIcon from '@mui/icons-material/Save';
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
 * only records the desired state, and `InemReconcilerService` pushes it —
 * right away, not just on its next scheduled pass — in the background. The
 * gap between "desired" and "reported" is normal and shown as a syncing
 * badge, not an error — and when the session itself is down, the banner
 * below says so plainly and names the fallback (INEM's own portal), because
 * a silently stale toggle here is the worst failure this feature has.
 *
 * Flipping the switch or picking a reason only edits `UnitCard`'s own local
 * state — nothing reaches the server until the crew member hits "Save".
 * Earlier this fired a request on every click, which meant a slip of the
 * thumb (or an accidental double-tap while scrolling) could report an
 * ambulance INOP on INEM's own portal without the crew ever meaning to
 * commit that change; requiring an explicit save makes that intent real.
 */
export const INEMStatusPage = () => {
  const t = useT();
  const notify = useNotify();
  const [overview, setOverview] = useState<INEMStatusOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingUnitId, setSavingUnitId] = useState<string | null>(null);
  const [syncingNow, setSyncingNow] = useState(false);

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

  // The server's last-committed intent — what a Save would overwrite if the
  // crew member hasn't started editing.
  const serverCode = unit.desiredInopCode ?? '';

  // Buffers the crew member's in-progress choice until they hit Save — no
  // request goes out just from flipping the switch or picking a reason.
  // Synced from the server only while there's no unsaved edit (`!dirty`);
  // once one starts, a poll landing mid-edit must not stomp on it, the same
  // concern the old `editing` flag existed for.
  const [pending, setPending] = useState(serverCode);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setPending(serverCode);
  }, [serverCode, dirty]);

  const setPendingCode = (code: string) => {
    setPending(code);
    setDirty(code !== serverCode);
  };

  const checked = pending === INEM_AVAILABLE_INOP_CODE;
  const reasonValue = !checked ? pending : '';
  // A reason must actually be picked before "Save" means anything — an
  // empty `pending` (switch just flipped off) is dirty but not yet savable.
  const canSave = dirty && pending !== '';
  const syncing = !dirty && unit.desiredInopCode !== unit.reportedInopCode;

  // `reasons` (the live map, or its compile-time fallback) may not have a
  // key for the code already selected here — e.g. it was set while the live
  // map was up, then the backend fell back to the compile-time table on a
  // restart. Without this, the select would silently render blank for a
  // value it can't find among its own options, hiding what's actually
  // selected. Synthesize an entry from the code itself rather than drop it.
  const reasonEntries =
    reasonValue && !(reasonValue in reasons) ? { ...reasons, [reasonValue]: reasonValue } : reasons;

  const vehicleLabel = unit.vehicle
    ? `${unit.vehicle.licensePlate} – ${unit.vehicle.numeroCauda}`
    : (unit.carId ?? unit.unitId);

  const handleSave = () => {
    setDirty(false);
    onSetStatus(unit.unitId, pending);
  };

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
          {dirty && <Chip size="small" label={t('inem.unsavedChanges')} color="warning" variant="outlined" />}
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
              onChange={(event) => setPendingCode(event.target.checked ? INEM_AVAILABLE_INOP_CODE : '')}
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
            onChange={(event) => setPendingCode(event.target.value)}
            sx={{ mt: 1 }}
          >
            <MenuItem value="" disabled>
              {t('inem.reasonPlaceholder')}
            </MenuItem>
            {Object.entries(reasonEntries).map(([code, apiLabel]) => (
              <MenuItem key={code} value={code}>
                {inemReasonLabel(t, code, apiLabel)}
              </MenuItem>
            ))}
          </TextField>
        )}

        <Button
          size="small"
          variant={canSave ? 'contained' : 'outlined'}
          startIcon={<SaveIcon fontSize="small" />}
          disabled={!canSave || saving}
          onClick={handleSave}
          sx={{ mt: 1 }}
        >
          {t('inem.save')}
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
