import { useEffect, useState } from 'react';
import {
  AppBar,
  Box,
  Chip,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SmartphoneIcon from '@mui/icons-material/Smartphone';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { LiveRunInput } from '@redinfo/shared';
import { syncStateLabel, t } from '../../i18n/labels';
import { colorRedCrossRedDark } from '../../layout/design-tokens';
import { elapsedLabel } from './liveRun';
import { SyncState } from './liveRunSync';

/** Which icon says which state, so the chip is readable without reading. */
const SYNC_ICON: Record<SyncState, JSX.Element> = {
  saved: <SmartphoneIcon fontSize="small" />,
  syncing: <CloudSyncIcon fontSize="small" />,
  synced: <CheckCircleIcon fontSize="small" />,
  offline: <CloudOffIcon fontSize="small" />,
  failed: <ErrorOutlineIcon fontSize="small" />,
};

export interface LiveTopBarProps {
  run: LiveRunInput;
  sync: SyncState;
  /** Dialling is the OS's job; this is only offered when a number is configured. */
  coduDadosHref?: string | null;
  onCoduDados?: () => void;
  onCorrectTimes: () => void;
  onAbandon: () => void;
}

/**
 * The run's identity, its clock, and everything rare or destructive.
 *
 * Two deliberate placements. The CODU number is in **tabular numerals** because
 * it is what distinguishes two back-to-back runs at a glance, and proportional
 * digits make `2608 4471` and `2608 4477` look the same shape. And the overflow
 * menu holds *everything* destructive — abandon, time correction, the support
 * call — because the bottom half of the screen is thumb-sweep territory and a
 * crew reaching for "cheguei ao local" must not be one mis-tap from discarding
 * the run.
 */
export const LiveTopBar = ({
  run,
  sync,
  coduDadosHref,
  onCoduDados,
  onCorrectTimes,
  onAbandon,
}: LiveTopBarProps) => {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [elapsed, setElapsed] = useState(() => elapsedLabel(run));

  /** One interval for the whole screen; the label is derived, not stored. */
  useEffect(() => {
    setElapsed(elapsedLabel(run));
    const timer = setInterval(() => setElapsed(elapsedLabel(run)), 1000);
    return () => clearInterval(timer);
  }, [run]);

  return (
    // `colorRedCrossRedDark` and not the brand red: white on `#ED1B24` is
    // 4.39:1, which clears AA only for large bold text — and this bar carries a
    // caption, a clock and a chip. On `#B01218` every one of them is 7.2:1.
    <AppBar position="sticky" elevation={2} sx={{ bgcolor: colorRedCrossRedDark }}>
      <Toolbar sx={{ gap: 1, minHeight: 56 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="caption"
            // Full opacity: dimming white on red is what takes a caption below
            // the contrast floor, and the hierarchy is carried by size already.
            sx={{ display: 'block', lineHeight: 1.1 }}
          >
            {t('field.coduReference')}
          </Typography>
          <Typography
            sx={{
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {run.externalReference?.trim() || '—'}
          </Typography>
        </Box>

        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
          <ScheduleIcon fontSize="small" />
          <Typography
            sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
            aria-label={t('live.clock')}
          >
            {elapsed}
          </Typography>
        </Stack>

        <IconButton
          color="inherit"
          aria-label={t('live.menu')}
          onClick={(event) => setMenu(event.currentTarget)}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <MoreVertIcon />
        </IconButton>
      </Toolbar>

      {/*
        `polite`, never `assertive`: a screen reader must not be interrupted
        mid-vital to be told the network came back. And the words always name
        *where the data is*, because the crew's question is "will I lose this".
      */}
      <Box
        aria-live="polite"
        sx={{
          // A shade over the bar rather than another colour, so the band reads as
          // part of it while still being separable.
          bgcolor: 'rgba(0, 0, 0, 0.16)',
          px: 2,
          py: 0.75,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Chip
          size="small"
          icon={SYNC_ICON[sync]}
          label={syncStateLabel(sync)}
          sx={{
            bgcolor: 'rgba(255,255,255,0.18)',
            color: '#fff',
            fontWeight: 600,
            '& .MuiChip-icon': { color: '#fff' },
          }}
        />
      </Box>

      <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
        {coduDadosHref && (
          <MenuItem
            component="a"
            href={coduDadosHref}
            onClick={() => {
              onCoduDados?.();
              setMenu(null);
            }}
            sx={{ minHeight: 48 }}
          >
            <PhoneInTalkIcon fontSize="small" sx={{ mr: 1.5 }} />
            {t('live.coduDados')}
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            onCorrectTimes();
            setMenu(null);
          }}
          sx={{ minHeight: 48 }}
        >
          <ScheduleIcon fontSize="small" sx={{ mr: 1.5 }} />
          {t('live.correctTimes')}
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            onAbandon();
            setMenu(null);
          }}
          sx={{ minHeight: 48, color: 'error.main' }}
        >
          <DeleteOutlineIcon fontSize="small" sx={{ mr: 1.5 }} />
          {t('live.abandon')}
        </MenuItem>
      </Menu>
    </AppBar>
  );
};
