import { useCallback, useEffect, useState } from 'react';
import { useNotify, usePermissions, useRecordContext } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import {
  Action,
  EmploymentContract,
  EmploymentContractKind,
  EmploymentContractsResponse,
  hasPermission,
  User,
  UserRole,
} from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';

const today = () => new Date().toISOString().slice(0, 10);

const contractKindLabel = (t: (key: string) => string, kind: EmploymentContractKind) =>
  kind === EmploymentContractKind.FULL_TIME
    ? t('employmentContracts.kindFullTime')
    : t('employmentContracts.kindPartTime');

/**
 * A person's employment contracts (Stage 1 of the paid-staff rework) — the
 * dated fact that replaces #223's timeless `User.isPaidStaff`. Ending a
 * contract dates it closed rather than deleting it: a past assignment's
 * `SALARY` resolution depends on the contract staying on file for the date it
 * covered (`isOnContractClock`).
 *
 * `PaidStaffSchedulePanel` nests its recurring pattern under whichever
 * contract is selected there — a fetch of its own, not driven from here —
 * this panel only manages the contracts themselves. `onChanged` lets that
 * sibling panel know to re-fetch after an add/end, without the two sharing
 * state directly.
 */
export const EmploymentContractsPanel = ({ onChanged }: { onChanged: () => void }) => {
  const t = useT();
  const record = useRecordContext<User>();
  const { permissions } = usePermissions<UserRole[]>();
  const notify = useNotify();
  const canManage = Boolean(permissions && hasPermission(permissions, Action.MANAGE_PERSONNEL));

  const [contracts, setContracts] = useState<EmploymentContract[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<EmploymentContractKind>(EmploymentContractKind.FULL_TIME);
  const [startDate, setStartDate] = useState(today);

  const [endingId, setEndingId] = useState<string | null>(null);
  const [endDate, setEndDate] = useState(today);

  const [saving, setSaving] = useState(false);

  const userId = record?.id;

  const load = useCallback(async () => {
    if (!userId || !canManage) return;
    try {
      const response = await apiFetch<EmploymentContractsResponse>(`/employment-contracts/${userId}`);
      setContracts(response?.contracts ?? []);
    } catch (e) {
      setLoadError(e instanceof ApiError ? apiErrorLabel(t, e) : t('employmentContracts.loadFailed'));
    }
  }, [userId, canManage, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!userId || !canManage) return null;

  const submitCreate = async () => {
    setSaving(true);
    try {
      await apiFetch(`/employment-contracts/${userId}`, {
        method: 'POST',
        body: { kind, startDate },
      });
      notify(t('employmentContracts.saved'), { type: 'success' });
      setAdding(false);
      await load();
      onChanged();
    } catch (e) {
      notify(e instanceof ApiError ? apiErrorLabel(t, e) : t('employmentContracts.saveFailed'), {
        type: 'warning',
      });
    } finally {
      setSaving(false);
    }
  };

  const submitEnd = async (contractId: string) => {
    setSaving(true);
    try {
      await apiFetch(`/employment-contracts/${userId}/${contractId}`, {
        method: 'PATCH',
        body: { endDate },
      });
      notify(t('employmentContracts.ended'), { type: 'success' });
      setEndingId(null);
      await load();
      onChanged();
    } catch (e) {
      notify(e instanceof ApiError ? apiErrorLabel(t, e) : t('employmentContracts.endFailed'), {
        type: 'warning',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6">{t('employmentContracts.heading')}</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding((value) => !value)}>
          {t('employmentContracts.add')}
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {t('employmentContracts.hint')}
      </Typography>

      {loadError && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          {loadError}
        </Alert>
      )}

      {(contracts?.length ?? 0) === 0 && !adding && (
        <Typography variant="body2" color="text.secondary">
          {t('employmentContracts.none')}
        </Typography>
      )}

      <Stack spacing={1}>
        {contracts?.map((contract) => (
          <Stack
            key={contract.id}
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {contractKindLabel(t, contract.kind)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {contract.startDate} – {contract.endDate ?? t('employmentContracts.stillActive')}
              </Typography>
            </Box>
            {!contract.endDate && endingId !== contract.id && (
              <Tooltip title={t('employmentContracts.end')}>
                <IconButton
                  size="small"
                  onClick={() => {
                    setEndingId(contract.id);
                    setEndDate(today());
                  }}
                >
                  <EventBusyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        ))}
      </Stack>

      {endingId && (
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{ mt: 1.5, p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}
        >
          <TextField
            type="date"
            size="small"
            label={t('employmentContracts.endDateLabel')}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button size="small" variant="contained" disabled={saving} onClick={() => void submitEnd(endingId)}>
            {t('employmentContracts.confirmEnd')}
          </Button>
          <Button size="small" disabled={saving} onClick={() => setEndingId(null)}>
            {t('action.cancel')}
          </Button>
        </Stack>
      )}

      {adding && (
        <Stack spacing={1.5} sx={{ mt: 1.5, p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
          <TextField
            select
            size="small"
            label={t('employmentContracts.kindLabel')}
            value={kind}
            onChange={(e) => setKind(e.target.value as EmploymentContractKind)}
          >
            <MenuItem value={EmploymentContractKind.FULL_TIME}>{t('employmentContracts.kindFullTime')}</MenuItem>
            <MenuItem value={EmploymentContractKind.PART_TIME}>{t('employmentContracts.kindPartTime')}</MenuItem>
          </TextField>
          <TextField
            type="date"
            size="small"
            label={t('employmentContracts.startDateLabel')}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" disabled={saving} onClick={() => void submitCreate()}>
              {t('employmentContracts.save')}
            </Button>
            <Button size="small" disabled={saving} onClick={() => setAdding(false)}>
              {t('action.cancel')}
            </Button>
          </Stack>
        </Stack>
      )}
    </Paper>
  );
};
