import { useNavigate } from 'react-router-dom';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { t } from '../../i18n/labels';
import { colorRedCrossRedDark } from '../../layout/design-tokens';
import { readCurrentRunId } from './liveRun';

/**
 * The door into live mode, at the top of `/my-reports`.
 *
 * At the *top*, not behind the bottom Fab: during a real call the crew must not
 * scroll or choose. One tap from opening the app to the intake screen.
 *
 * Whether a run is already open is read **synchronously** from `localStorage`
 * rather than from IndexedDB, so the label is right on the first paint. A card
 * that says "Registar em direto" for 200ms on a phone that is halfway through a
 * call is wrong exactly when it matters, and IndexedDB cannot answer before the
 * first frame.
 */
export const LiveRunEntryCard = () => {
  const navigate = useNavigate();
  const openRunId = readCurrentRunId();

  return (
    <Paper
      elevation={0}
      sx={{
        bgcolor: colorRedCrossRedDark,
        color: '#fff',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Button
        fullWidth
        onClick={() => navigate(openRunId ? `/live/${openRunId}` : '/live')}
        endIcon={<ChevronRightIcon />}
        sx={{
          color: 'inherit',
          minHeight: 88,
          px: 2,
          justifyContent: 'flex-start',
          textAlign: 'left',
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1 }}>
          <BoltIcon sx={{ fontSize: 32 }} />
          <Box sx={{ flex: 1 }}>
            {/*
              Dark red, so both lines clear AA: white on the brand `#ED1B24` is
              4.39:1 and would only be safe for the headline, while the caption
              below it is 14px. Neither line is dimmed, for the same reason.
            */}
            <Typography sx={{ fontWeight: 800, fontSize: '1.125rem', lineHeight: 1.2 }}>
              {openRunId ? t('live.resume') : t('live.start').toUpperCase()}
            </Typography>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {t('live.startHint')}
            </Typography>
          </Box>
        </Stack>
      </Button>
    </Paper>
  );
};
