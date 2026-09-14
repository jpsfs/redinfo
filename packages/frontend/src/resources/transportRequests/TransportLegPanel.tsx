import { useCallback, useEffect, useState } from 'react';
import { usePermissions, useNotify } from 'react-admin';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Action,
  LegCancellationSource,
  LegDirection,
  LegStatus,
  TransportLeg,
  UserRole,
  hasPermission,
} from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { useTransportFacilities } from './useTransportFacilities';

/**
 * The durable `TransportLeg` list on a request's detail (#230) — per-leg
 * edit, cancel and no-show, none of which ever touch the `TreatmentPlan`
 * above a leg (see the backend service's own banner comment). `reloadToken`
 * is bumped by `TransportRequestShow` whenever `TreatmentPlanPanel`
 * (re)generates legs, so this panel re-fetches without the two managing
 * shared state directly — same wiring as `EmploymentContractsPanel` /
 * `PaidStaffSchedulePanel`.
 */

const statusColor = (status: LegStatus): 'default' | 'info' | 'success' | 'error' | 'warning' => {
  switch (status) {
    case LegStatus.COMPLETED:
      return 'success';
    case LegStatus.CANCELLED:
      return 'error';
    case LegStatus.NO_SHOW:
      return 'warning';
    case LegStatus.ASSIGNED:
      return 'info';
    default:
      return 'default';
  }
};

const originSummary = (leg: TransportLeg) => leg.originFacility?.name ?? leg.originAddress ?? '—';
const destinationSummary = (leg: TransportLeg) => leg.destinationFacility?.name ?? leg.destinationAddress ?? '—';

interface LegFormValues {
  date: string;
  originAddress: string;
  originFacilityId: string;
  destinationAddress: string;
  destinationFacilityId: string;
  plannedPickupAt: string;
  plannedDropoffAt: string;
}

const formFromLeg = (leg: TransportLeg): LegFormValues => ({
  date: leg.date,
  originAddress: leg.originAddress ?? '',
  originFacilityId: leg.originFacilityId ?? '',
  destinationAddress: leg.destinationAddress ?? '',
  destinationFacilityId: leg.destinationFacilityId ?? '',
  plannedPickupAt: leg.plannedPickupAt ? leg.plannedPickupAt.slice(0, 16) : '',
  plannedDropoffAt: leg.plannedDropoffAt ? leg.plannedDropoffAt.slice(0, 16) : '',
});

const toUpdatePayload = (values: LegFormValues) => ({
  date: values.date || undefined,
  originAddress: values.originAddress.trim() || null,
  originFacilityId: values.originFacilityId || null,
  destinationAddress: values.destinationAddress.trim() || null,
  destinationFacilityId: values.destinationFacilityId || null,
  plannedPickupAt: values.plannedPickupAt ? new Date(values.plannedPickupAt).toISOString() : null,
  plannedDropoffAt: values.plannedDropoffAt ? new Date(values.plannedDropoffAt).toISOString() : null,
});

const LegEditForm = ({
  initial,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: LegFormValues;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: LegFormValues) => void;
}) => {
  const t = useT();
  const facilities = useTransportFacilities();
  const [values, setValues] = useState(initial);
  const originFacility = (facilities ?? []).find((f) => f.id === values.originFacilityId) ?? null;
  const destinationFacility = (facilities ?? []).find((f) => f.id === values.destinationFacilityId) ?? null;

  return (
    <Stack spacing={1.5} sx={{ mt: 1.5, p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
      <TextField
        type="date"
        size="small"
        label={t('transportLeg.dateLabel')}
        value={values.date}
        onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
        InputLabelProps={{ shrink: true }}
      />
      <Typography variant="caption" color="text.secondary">
        {t('transportLeg.originLabel')}
      </Typography>
      <TextField
        size="small"
        label={t('transportLeg.addressLabel')}
        value={values.originAddress}
        onChange={(e) => setValues((v) => ({ ...v, originAddress: e.target.value }))}
      />
      <Autocomplete
        options={facilities ?? []}
        loading={facilities === null}
        value={originFacility}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        onChange={(_event, value) => setValues((v) => ({ ...v, originFacilityId: value?.id ?? '' }))}
        renderInput={(params) => <TextField {...params} size="small" label={t('transportLeg.facilityLabel')} />}
      />
      <Typography variant="caption" color="text.secondary">
        {t('transportLeg.destinationLabel')}
      </Typography>
      <TextField
        size="small"
        label={t('transportLeg.addressLabel')}
        value={values.destinationAddress}
        onChange={(e) => setValues((v) => ({ ...v, destinationAddress: e.target.value }))}
      />
      <Autocomplete
        options={facilities ?? []}
        loading={facilities === null}
        value={destinationFacility}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        onChange={(_event, value) => setValues((v) => ({ ...v, destinationFacilityId: value?.id ?? '' }))}
        renderInput={(params) => <TextField {...params} size="small" label={t('transportLeg.facilityLabel')} />}
      />
      <Stack direction="row" spacing={1.5}>
        <TextField
          type="datetime-local"
          size="small"
          label={t('transportLeg.plannedPickupAtLabel')}
          value={values.plannedPickupAt}
          onChange={(e) => setValues((v) => ({ ...v, plannedPickupAt: e.target.value }))}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          type="datetime-local"
          size="small"
          label={t('transportLeg.plannedDropoffAtLabel')}
          value={values.plannedDropoffAt}
          onChange={(e) => setValues((v) => ({ ...v, plannedDropoffAt: e.target.value }))}
          InputLabelProps={{ shrink: true }}
        />
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" disabled={saving} onClick={() => onSubmit(values)}>
          {t('transportLeg.save')}
        </Button>
        <Button size="small" disabled={saving} onClick={onCancel}>
          {t('action.cancel')}
        </Button>
      </Stack>
    </Stack>
  );
};

const LegCancelForm = ({
  saving,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  onCancel: () => void;
  onSubmit: (reason: string, source: LegCancellationSource) => void;
}) => {
  const t = useT();
  const [reason, setReason] = useState('');
  const [source, setSource] = useState<LegCancellationSource>(LegCancellationSource.PATIENT);

  return (
    <Stack spacing={1.5} sx={{ mt: 1.5, p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
      <TextField
        size="small"
        select
        label={t('transportLeg.cancellationSourceLabel')}
        value={source}
        onChange={(e) => setSource(e.target.value as LegCancellationSource)}
      >
        <MenuItem value={LegCancellationSource.PATIENT}>{t('transportLeg.cancellationSource.PATIENT')}</MenuItem>
        <MenuItem value={LegCancellationSource.FACILITY}>{t('transportLeg.cancellationSource.FACILITY')}</MenuItem>
        <MenuItem value={LegCancellationSource.DELEGATION}>{t('transportLeg.cancellationSource.DELEGATION')}</MenuItem>
      </TextField>
      <TextField
        size="small"
        multiline
        minRows={2}
        label={t('transportLeg.cancellationReasonLabel')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="contained"
          color="error"
          disabled={saving || !reason.trim()}
          onClick={() => onSubmit(reason.trim(), source)}
        >
          {t('transportLeg.confirmCancel')}
        </Button>
        <Button size="small" disabled={saving} onClick={onCancel}>
          {t('action.cancel')}
        </Button>
      </Stack>
    </Stack>
  );
};

const LegCard = ({
  leg,
  saving,
  onEdit,
  onCancel,
  onNoShow,
}: {
  leg: TransportLeg;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onNoShow: () => void;
}) => {
  const t = useT();
  const editable = leg.status !== LegStatus.CANCELLED;
  const cancellable = leg.status !== LegStatus.CANCELLED && leg.status !== LegStatus.COMPLETED;
  const canMarkNoShow = leg.status === LegStatus.PLANNED || leg.status === LegStatus.ASSIGNED;

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" spacing={1}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {leg.date}
            </Typography>
            <Chip
              size="small"
              label={t(`transportLeg.direction.${leg.direction}`)}
            />
            <Chip
              size="small"
              color={statusColor(leg.status)}
              label={t(`transportLeg.status.${leg.status}`)}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {originSummary(leg)} → {destinationSummary(leg)}
          </Typography>
          {leg.status === LegStatus.CANCELLED && leg.cancellationReason && (
            <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
              {t('transportLeg.cancellationReasonLabel')}: {leg.cancellationReason}
              {leg.cancellationSource
                ? ` (${t(`transportLeg.cancellationSource.${leg.cancellationSource}`)})`
                : ''}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          {editable && (
            <Button size="small" onClick={onEdit}>
              {t('action.edit')}
            </Button>
          )}
          {cancellable && (
            <Button size="small" color="error" onClick={onCancel}>
              {t('transportLeg.cancelButton')}
            </Button>
          )}
          {canMarkNoShow && (
            <Button size="small" disabled={saving} onClick={onNoShow}>
              {t('transportLeg.noShowButton')}
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
};

export const TransportLegPanel = ({
  transportRequestId,
  hasTreatmentPlan,
  reloadToken,
}: {
  transportRequestId: string;
  hasTreatmentPlan: boolean;
  reloadToken: number;
}) => {
  const t = useT();
  const notify = useNotify();
  const { permissions } = usePermissions<UserRole[]>();
  const canManage = Boolean(permissions && hasPermission(permissions, Action.MANAGE_TRANSPORT_REQUESTS));

  const [legs, setLegs] = useState<TransportLeg[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const found = await apiFetch<TransportLeg[]>(`/transport-requests/${transportRequestId}/legs`);
      setLegs(found);
    } catch (e) {
      setLoadError(e instanceof ApiError ? apiErrorLabel(t, e) : t('transportLeg.loadFailed'));
    }
  }, [transportRequestId, t]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  if (!canManage) return null;

  const notifyError = (e: unknown, fallbackKey: Parameters<typeof t>[0]) =>
    notify(e instanceof ApiError ? apiErrorLabel(t, e) : t(fallbackKey), { type: 'warning' });

  const generateOneOff = async () => {
    setGenerating(true);
    try {
      const created = await apiFetch<number>(`/transport-requests/${transportRequestId}/legs/generate-one-off`, {
        method: 'POST',
      });
      notify(created > 0 ? t('transportLeg.generated') : t('transportLeg.alreadyGenerated'), { type: 'success' });
      await load();
    } catch (e) {
      notifyError(e, 'transportLeg.generateFailed');
    } finally {
      setGenerating(false);
    }
  };

  const submitEdit = async (legId: string, values: LegFormValues) => {
    setSaving(true);
    try {
      await apiFetch(`/transport-requests/legs/${legId}`, { method: 'PATCH', body: toUpdatePayload(values) });
      notify(t('transportLeg.saved'), { type: 'success' });
      setEditingId(null);
      await load();
    } catch (e) {
      notifyError(e, 'transportLeg.saveFailed');
    } finally {
      setSaving(false);
    }
  };

  const submitCancel = async (legId: string, reason: string, source: LegCancellationSource) => {
    setSaving(true);
    try {
      await apiFetch(`/transport-requests/legs/${legId}/cancel`, { method: 'POST', body: { reason, source } });
      notify(t('transportLeg.cancelled'), { type: 'success' });
      setCancellingId(null);
      await load();
    } catch (e) {
      notifyError(e, 'transportLeg.cancelFailed');
    } finally {
      setSaving(false);
    }
  };

  const markNoShow = async (legId: string) => {
    if (!window.confirm(t('transportLeg.noShowConfirm'))) return;
    setSaving(true);
    try {
      await apiFetch(`/transport-requests/legs/${legId}/no-show`, { method: 'POST' });
      notify(t('transportLeg.markedNoShow'), { type: 'success' });
      await load();
    } catch (e) {
      notifyError(e, 'transportLeg.noShowFailed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6">{t('transportLeg.heading')}</Typography>
        {!hasTreatmentPlan && (legs?.length ?? 0) === 0 && (
          <Button size="small" disabled={generating} onClick={() => void generateOneOff()}>
            {generating ? <CircularProgress size={16} /> : t('transportLeg.generateOneOffButton')}
          </Button>
        )}
      </Stack>

      {loadError && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          {loadError}
        </Alert>
      )}

      {legs === null && !loadError && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <CircularProgress size={20} />
        </Box>
      )}

      {legs?.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('transportLeg.none')}
        </Typography>
      )}

      <Stack spacing={1}>
        {legs?.map((leg) => (
          <Box key={leg.id}>
            <LegCard
              leg={leg}
              saving={saving}
              onEdit={() => {
                setCancellingId(null);
                setEditingId((current) => (current === leg.id ? null : leg.id));
              }}
              onCancel={() => {
                setEditingId(null);
                setCancellingId((current) => (current === leg.id ? null : leg.id));
              }}
              onNoShow={() => void markNoShow(leg.id)}
            />
            {editingId === leg.id && (
              <LegEditForm
                initial={formFromLeg(leg)}
                saving={saving}
                onCancel={() => setEditingId(null)}
                onSubmit={(values) => void submitEdit(leg.id, values)}
              />
            )}
            {cancellingId === leg.id && (
              <LegCancelForm
                saving={saving}
                onCancel={() => setCancellingId(null)}
                onSubmit={(reason, source) => void submitCancel(leg.id, reason, source)}
              />
            )}
          </Box>
        ))}
      </Stack>
    </Paper>
  );
};
