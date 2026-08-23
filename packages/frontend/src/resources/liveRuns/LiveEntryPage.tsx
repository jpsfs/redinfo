import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BoltIcon from '@mui/icons-material/Bolt';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { LiveRunState } from '@redinfo/shared';
import { liveScreenLabel, t } from '../../i18n/labels';
import { colorRedCrossRedDark } from '../../layout/design-tokens';
import { timeOfDay } from '../eventReports/reportDraft';
import { StoredRun, listRuns } from './liveRunDb';
import { emptyRun, newRunId, screenForRun, writeCurrentRunId } from './liveRun';
import { saveRun } from './liveRunDb';

/**
 * Start a run, or pick up one already open.
 *
 * Several unfinished runs can coexist — a crew that took two calls in a shift and
 * has not filed either — so this lists them rather than assuming there is one.
 * The list is deliberately *above* the "new run" button: during a real call the
 * dangerous mistake is starting a second run for the call already in progress.
 */
export const LiveEntryPage = () => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<StoredRun[] | null>(null);

  useEffect(() => {
    void listRuns().then((stored) =>
      // A closed run is finished with; it lives on as a report now.
      setRuns(stored.filter((entry) => entry.run.state !== LiveRunState.CLOSED)),
    );
  }, []);

  const start = useCallback(async () => {
    const run = emptyRun(newRunId());
    await saveRun(run);
    writeCurrentRunId(run.id);
    navigate(`/live/${run.id}/intake`);
  }, [navigate]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Dark red, so the white title clears AA at 16px bold — see the note on
          `colorRedCrossRedDark`. */}
      <Toolbar sx={{ bgcolor: colorRedCrossRedDark, color: '#fff' }}>
        <IconButton
          color="inherit"
          aria-label={t('action.back')}
          onClick={() => navigate('/my-reports')}
          sx={{ mr: 1, minWidth: 44, minHeight: 44 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography sx={{ fontWeight: 800 }}>{t('live.title')}</Typography>
      </Toolbar>

      <Container maxWidth="sm" sx={{ py: 3 }}>
        <Stack spacing={2.5}>
          {runs && runs.length > 0 && (
            <Box>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>{t('live.openRuns')}</Typography>
              <Stack spacing={1.5}>
                {runs.map(({ run, savedAt }) => (
                  <Paper key={run.id} variant="outlined">
                    <Button
                      fullWidth
                      endIcon={<ChevronRightIcon />}
                      onClick={() => {
                        writeCurrentRunId(run.id);
                        navigate(`/live/${run.id}/${screenForRun(run)}`);
                      }}
                      sx={{
                        minHeight: 76,
                        justifyContent: 'flex-start',
                        textAlign: 'left',
                        px: 2,
                      }}
                    >
                      <Box sx={{ flex: 1 }}>
                        <Typography
                          sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
                        >
                          {run.externalReference?.trim() || t('live.newRun')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {liveScreenLabel(screenForRun(run))}
                          {run.chiefComplaint ? ` · ${run.chiefComplaint}` : ''}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                          {t('sync.saved')} · {timeOfDay(savedAt)}
                        </Typography>
                      </Box>
                    </Button>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}

          {runs && runs.length === 0 && (
            <Typography color="text.secondary">{t('live.noOpenRuns')}</Typography>
          )}

          <Button
            fullWidth
            variant="contained"
            startIcon={<BoltIcon />}
            onClick={() => void start()}
            sx={{ minHeight: 72, fontWeight: 800, fontSize: '1.0625rem', borderRadius: 2 }}
          >
            {t('live.newRun')}
          </Button>

          <Typography variant="body2" color="text.secondary">
            {t('live.startHint')}
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
};
