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
      setError(e instanceof Error ? e.message : 'Could not fill the draft.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <AutoFixHighIcon color="primary" />
        Auto-fill draft
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Fills from submitted availability, drivers first for every vehicle a shift
          needs. Nobody who did not submit is placed.
        </Typography>

        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {report && !error && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Placed {report.placed}. {report.unfilled} slots still open,{' '}
            {report.shiftsWithoutDriver} shifts without a driver for every vehicle.
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
                    Only empty slots
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Keeps everyone you placed by hand, overrides included.
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
                    Clear and refill everything
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Discards every current assignment on this schedule first.
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
                Spread duties evenly
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Prefers whoever has fewest duties so far in this window.
              </Typography>
            </>
          }
        />

        <Paper variant="outlined" sx={{ p: 1.5, mt: 2, backgroundColor: 'grey.50' }}>
          <Typography variant="body2">
            <strong>{stats.filledSlots}</strong> of <strong>{stats.requiredSlots}</strong> slots
            are filled right now.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {mode === 'REPLACE'
              ? 'Everything currently on this schedule will be discarded first.'
              : 'Only the empty slots will be touched.'}
          </Typography>
        </Paper>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void run()}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Fill draft
        </Button>
      </DialogActions>
    </Dialog>
  );
};
