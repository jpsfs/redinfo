import { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormControl,
  FormControlLabel as RadioLabel,
  Paper,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { AutofillMode, AutofillReport, ScheduleFillStats } from '@redinfo/shared';
import { apiFetch } from '../../api';
import { useT } from '../../i18n/useT';

/**
 * Generating a first draft.
 *
 * The generator only ever places people who submitted for the shift — putting
 * someone on who did not is an override, and that is a human decision. What it
 * does do is the tedious part: drivers first for every vehicle, then each role
 * in the window's own order, spreading the load if asked.
 */
export const AutofillDialog = ({
  scheduleId,
  open,
  stats,
  onClose,
  onFilled,
}: {
  scheduleId: string;
  open: boolean;
  stats: ScheduleFillStats;
  onClose: () => void;
  onFilled: () => void;
}) => {
  const t = useT();
  const [mode, setMode] = useState<AutofillMode>('EMPTY');
  const [fairness, setFairness] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AutofillReport | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<AutofillReport>(`/schedules/${scheduleId}/autofill`, {
        method: 'POST',
        body: { mode, fairness },
      });
      setReport(result);
      onFilled();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('autofillDialog.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <AutoFixHighIcon color="primary" />
        {t('autofillDialog.title')}
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('autofillDialog.description')}
        </Typography>

        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {report && !error && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {t('autofillDialog.result', {
              placed: report.placed,
              unfilled: report.unfilled,
              withoutDriver: report.shiftsWithoutDriver,
            })}
          </Alert>
        )}

        <FormControl>
          <RadioGroup
            value={mode}
            onChange={(event) => setMode(event.target.value as AutofillMode)}
          >
            <RadioLabel
              value="EMPTY"
              control={<Radio />}
              label={
                <>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t('autofillDialog.modeEmptyTitle')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('autofillDialog.modeEmptyHint')}
                  </Typography>
                </>
              }
            />
            <RadioLabel
              value="REPLACE"
              control={<Radio />}
              label={
                <>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t('autofillDialog.modeReplaceTitle')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('autofillDialog.modeReplaceHint')}
                  </Typography>
                </>
              }
            />
          </RadioGroup>
        </FormControl>

        <FormControlLabel
          sx={{ mt: 1 }}
          control={
            <Checkbox checked={fairness} onChange={(e) => setFairness(e.target.checked)} />
          }
          label={
            <>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {t('autofillDialog.fairnessTitle')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('autofillDialog.fairnessHint')}
              </Typography>
            </>
          }
        />

        <Paper variant="outlined" sx={{ p: 1.5, mt: 2, backgroundColor: 'grey.50' }}>
          <Typography variant="body2">
            {t('autofillDialog.currentFill', {
              filled: stats.filledSlots,
              required: stats.requiredSlots,
            })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {mode === 'REPLACE'
              ? t('autofillDialog.replaceWarning')
              : t('autofillDialog.emptyOnlyNote')}
          </Typography>
        </Paper>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('action.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={() => void run()}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {t('autofillDialog.fillButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
