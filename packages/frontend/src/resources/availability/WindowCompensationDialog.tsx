import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { AvailabilityWindow, CompensationOfferKind } from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';

/** Cents from a euro string as typed (comma or dot), or null if unusable. */
function eurosToCents(value: string): number | null {
  const normalised = value.trim().replace(',', '.');
  if (!normalised) return null;
  const euros = Number(normalised);
  if (!Number.isFinite(euros) || euros < 0) return null;
  return Math.round(euros * 100);
}

const centsToEuros = (cents?: number | null): string => (cents == null ? '' : (cents / 100).toFixed(2));

/**
 * Publishing (or withdrawing) the window's own compensation offer —
 * `PATCH /availability-windows/:id` (#246 Stage 2). Only reachable while the
 * window is still `OPEN` (see `AvailabilityWindowShow`'s own gate): once
 * closed, submissions were made against the window as it stood, and a rate
 * change belongs on the schedule instead.
 */
export const WindowCompensationDialog = ({
  window,
  open,
  onClose,
  onSaved,
}: {
  window: AvailabilityWindow;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const t = useT();
  const [kind, setKind] = useState<CompensationOfferKind>(CompensationOfferKind.NONE);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(window.compensationKind ?? CompensationOfferKind.NONE);
    setAmount(
      window.compensationKind === CompensationOfferKind.FIXED
        ? centsToEuros(window.compensationAmountCents)
        : centsToEuros(window.compensationRateCents),
    );
    setNote(window.compensationNote ?? '');
    setError(null);
  }, [open, window]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const cents = eurosToCents(amount);
      await apiFetch(`/availability-windows/${window.id}`, {
        method: 'PATCH',
        body: {
          kind,
          rateCents: kind === CompensationOfferKind.HOURLY ? cents : undefined,
          amountCents: kind === CompensationOfferKind.FIXED ? cents : undefined,
          note: note.trim() || null,
        },
      });
      onSaved();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? apiErrorLabel(t, e)
          : e instanceof Error
            ? e.message
            : t('windowCompensationDialog.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  const needsAmount = kind !== CompensationOfferKind.NONE;
  const invalidAmount = needsAmount && eurosToCents(amount) == null;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('windowCompensationDialog.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{t('windowCompensationDialog.hint')}</DialogContentText>

        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack spacing={2}>
          <ToggleButtonGroup
            fullWidth
            exclusive
            value={kind}
            disabled={busy}
            onChange={(_event, next: CompensationOfferKind | null) => {
              if (!next) return;
              setKind(next);
            }}
            aria-label={t('windowCompensationDialog.kindAria')}
          >
            <ToggleButton value={CompensationOfferKind.NONE}>
              {t('windowCompensationDialog.kindNone')}
            </ToggleButton>
            <ToggleButton value={CompensationOfferKind.HOURLY}>
              {t('windowCompensationDialog.kindHourly')}
            </ToggleButton>
            <ToggleButton value={CompensationOfferKind.FIXED}>
              {t('windowCompensationDialog.kindFixed')}
            </ToggleButton>
          </ToggleButtonGroup>

          {needsAmount && (
            <TextField
              label={
                kind === CompensationOfferKind.HOURLY
                  ? t('windowCompensationDialog.rateLabel')
                  : t('windowCompensationDialog.amountLabel')
              }
              value={amount}
              disabled={busy}
              onChange={(event) => setAmount(event.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start">€</InputAdornment> }}
              error={invalidAmount}
              helperText={
                invalidAmount
                  ? t('windowCompensationDialog.amountInvalid')
                  : kind === CompensationOfferKind.FIXED
                    ? t('windowCompensationDialog.amountFixedHint')
                    : undefined
              }
              fullWidth
            />
          )}

          <TextField
            label={t('windowCompensationDialog.noteLabel')}
            value={note}
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('action.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={() => void save()}
          disabled={busy || invalidAmount}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {t('windowCompensationDialog.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
