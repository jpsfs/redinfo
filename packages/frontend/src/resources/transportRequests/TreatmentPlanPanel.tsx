import { useCallback, useEffect, useState } from 'react';
import { usePermissions, useNotify } from 'react-admin';
import { Alert, Autocomplete, Box, Button, Chip, Paper, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { Action, TreatmentPlan, UserRole, hasPermission } from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { useTransportFacilities } from './useTransportFacilities';

/**
 * `TreatmentPlan` CRUD on a request's detail (#230) — the recurring series
 * editor. Every create/update immediately (re)generates the request's legs
 * server-side (`TransportRequestTreatmentPlansService`), so `onLegsChanged`
 * lets the sibling `TransportLegPanel` know to re-fetch, the same
 * cross-panel wiring `EmploymentContractsPanel`/`PaidStaffSchedulePanel` use.
 *
 * `Date#getDay()` convention for `daysOfWeek` (0 = Sunday … 6 = Saturday) —
 * reuses the existing `date.weekday.*` labels (keyed MON..SUN) rather than
 * inventing a second set.
 */

const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

interface PlanFormValues {
  destinationFacilityId: string;
  daysOfWeek: number[];
  treatmentStartTime: string;
  treatmentEndTime: string;
  validFrom: string;
  validTo: string;
  notes: string;
}

const emptyForm = (): PlanFormValues => ({
  destinationFacilityId: '',
  daysOfWeek: [],
  treatmentStartTime: '',
  treatmentEndTime: '',
  validFrom: '',
  validTo: '',
  notes: '',
});

const formFromPlan = (plan: TreatmentPlan): PlanFormValues => ({
  destinationFacilityId: plan.destinationFacilityId,
  daysOfWeek: plan.daysOfWeek,
  treatmentStartTime: plan.treatmentStartTime,
  treatmentEndTime: plan.treatmentEndTime ?? '',
  validFrom: plan.validFrom,
  validTo: plan.validTo,
  notes: plan.notes ?? '',
});

const toPayload = (values: PlanFormValues) => ({
  destinationFacilityId: values.destinationFacilityId,
  daysOfWeek: values.daysOfWeek,
  treatmentStartTime: values.treatmentStartTime,
  treatmentEndTime: values.treatmentEndTime.trim() || null,
  validFrom: values.validFrom,
  validTo: values.validTo,
  notes: values.notes.trim() || null,
});

const TreatmentPlanForm = ({
  initial,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: PlanFormValues;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: PlanFormValues) => void;
}) => {
  const t = useT();
  const facilities = useTransportFacilities();
  const [values, setValues] = useState(initial);
  const chosenFacility = (facilities ?? []).find((f) => f.id === values.destinationFacilityId) ?? null;

  const toggleDay = (day: number) => {
    setValues((v) => ({
      ...v,
      daysOfWeek: v.daysOfWeek.includes(day)
        ? v.daysOfWeek.filter((d) => d !== day)
        : [...v.daysOfWeek, day].sort((a, b) => a - b),
    }));
  };

  const canSubmit =
    values.destinationFacilityId && values.daysOfWeek.length > 0 && values.treatmentStartTime && values.validFrom && values.validTo;

  return (
    <Stack spacing={1.5} sx={{ mt: 1.5, p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
      <Autocomplete
        options={facilities ?? []}
        loading={facilities === null}
        value={chosenFacility}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        onChange={(_event, value) => setValues((v) => ({ ...v, destinationFacilityId: value?.id ?? '' }))}
        renderInput={(params) => (
          <TextField {...params} size="small" label={t('treatmentPlan.destinationFacilityLabel')} />
        )}
      />
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          {t('treatmentPlan.daysOfWeekLabel')}
        </Typography>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {WEEKDAY_CODES.map((code, day) => (
            <Chip
              key={code}
              size="small"
              label={t(`date.weekday.${code}`)}
              color={values.daysOfWeek.includes(day) ? 'primary' : 'default'}
              variant={values.daysOfWeek.includes(day) ? 'filled' : 'outlined'}
              onClick={() => toggleDay(day)}
            />
          ))}
        </Stack>
      </Box>
      <Stack direction="row" spacing={1.5}>
        <TextField
          type="time"
          size="small"
          label={t('treatmentPlan.treatmentStartTimeLabel')}
          value={values.treatmentStartTime}
          onChange={(e) => setValues((v) => ({ ...v, treatmentStartTime: e.target.value }))}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          type="time"
          size="small"
          label={t('treatmentPlan.treatmentEndTimeLabel')}
          value={values.treatmentEndTime}
          onChange={(e) => setValues((v) => ({ ...v, treatmentEndTime: e.target.value }))}
          InputLabelProps={{ shrink: true }}
        />
      </Stack>
      <Stack direction="row" spacing={1.5}>
        <TextField
          type="date"
          size="small"
          label={t('treatmentPlan.validFromLabel')}
          value={values.validFrom}
          onChange={(e) => setValues((v) => ({ ...v, validFrom: e.target.value }))}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          type="date"
          size="small"
          label={t('treatmentPlan.validToLabel')}
          value={values.validTo}
          onChange={(e) => setValues((v) => ({ ...v, validTo: e.target.value }))}
          InputLabelProps={{ shrink: true }}
        />
      </Stack>
      <TextField
        size="small"
        multiline
        minRows={2}
        label={t('treatmentPlan.notesLabel')}
        value={values.notes}
        onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
      />
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" disabled={saving || !canSubmit} onClick={() => onSubmit(values)}>
          {t('treatmentPlan.save')}
        </Button>
        <Button size="small" disabled={saving} onClick={onCancel}>
          {t('action.cancel')}
        </Button>
      </Stack>
    </Stack>
  );
};

const PlanCard = ({ plan, onEdit }: { plan: TreatmentPlan; onEdit: () => void }) => {
  const t = useT();
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {plan.destinationFacility?.name ?? plan.destinationFacilityId}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {plan.daysOfWeek.map((day) => t(`date.weekday.${WEEKDAY_CODES[day]}`)).join(', ')}
            {' · '}
            {plan.treatmentStartTime}
            {plan.treatmentEndTime ? `–${plan.treatmentEndTime}` : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {plan.validFrom} – {plan.validTo}
          </Typography>
          {plan.notes && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {plan.notes}
            </Typography>
          )}
        </Box>
        <Button size="small" onClick={onEdit}>
          {t('action.edit')}
        </Button>
      </Stack>
    </Paper>
  );
};

export const TreatmentPlanPanel = ({
  transportRequestId,
  onLegsChanged,
  onPlansLoaded,
}: {
  transportRequestId: string;
  onLegsChanged: () => void;
  /** Told after every (re)fetch, not just a create — so a request that
   * already had a plan before this screen opened is known immediately,
   * not only once someone edits one in this session. */
  onPlansLoaded: (hasAny: boolean) => void;
}) => {
  const t = useT();
  const notify = useNotify();
  const { permissions } = usePermissions<UserRole[]>();
  const canManage = Boolean(permissions && hasPermission(permissions, Action.MANAGE_TRANSPORT_REQUESTS));

  const [plans, setPlans] = useState<TreatmentPlan[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const found = await apiFetch<TreatmentPlan[]>(`/transport-requests/${transportRequestId}/treatment-plans`);
      setPlans(found);
      onPlansLoaded(found.length > 0);
    } catch (e) {
      setLoadError(e instanceof ApiError ? apiErrorLabel(t, e) : t('treatmentPlan.loadFailed'));
    }
  }, [transportRequestId, t, onPlansLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canManage) return null;

  const notifyError = (e: unknown) =>
    notify(e instanceof ApiError ? apiErrorLabel(t, e) : t('treatmentPlan.saveFailed'), { type: 'warning' });

  const submitCreate = async (values: PlanFormValues) => {
    setSaving(true);
    try {
      await apiFetch(`/transport-requests/${transportRequestId}/treatment-plans`, {
        method: 'POST',
        body: toPayload(values),
      });
      notify(t('treatmentPlan.saved'), { type: 'success' });
      setAdding(false);
      await load();
      onLegsChanged();
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async (planId: string, values: PlanFormValues) => {
    setSaving(true);
    try {
      await apiFetch(`/transport-requests/treatment-plans/${planId}`, { method: 'PATCH', body: toPayload(values) });
      notify(t('treatmentPlan.saved'), { type: 'success' });
      setEditingId(null);
      await load();
      onLegsChanged();
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6">{t('treatmentPlan.heading')}</Typography>
        {!adding && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditingId(null);
              setAdding(true);
            }}
          >
            {t('treatmentPlan.add')}
          </Button>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {t('treatmentPlan.hint')}
      </Typography>

      {loadError && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          {loadError}
        </Alert>
      )}

      {(plans?.length ?? 0) === 0 && !adding && (
        <Typography variant="body2" color="text.secondary">
          {t('treatmentPlan.none')}
        </Typography>
      )}

      <Stack spacing={1}>
        {plans?.map((plan) =>
          editingId === plan.id ? (
            <TreatmentPlanForm
              key={plan.id}
              initial={formFromPlan(plan)}
              saving={saving}
              onCancel={() => setEditingId(null)}
              onSubmit={(values) => void submitEdit(plan.id, values)}
            />
          ) : (
            <PlanCard
              key={plan.id}
              plan={plan}
              onEdit={() => {
                setAdding(false);
                setEditingId(plan.id);
              }}
            />
          ),
        )}
      </Stack>

      {adding && (
        <TreatmentPlanForm
          initial={emptyForm()}
          saving={saving}
          onCancel={() => setAdding(false)}
          onSubmit={(values) => void submitCreate(values)}
        />
      )}
    </Paper>
  );
};
