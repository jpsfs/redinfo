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
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SmartphoneIcon from '@mui/icons-material/Smartphone';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { LiveRunInput, LiveScreen } from '@redinfo/shared';
import { liveScreenLabel, syncStateLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { colorRedCrossRedDark } from '../../layout/design-tokens';
import { elapsedLabel, previousStep, screenForState, visitedScreens } from './liveRun';
import { SyncState } from './liveRunSync';

/** Which icon says which state, kept for the screen-reader-only label's neighbours. */
const SYNC_ICON: Record<SyncState, JSX.Element> = {
  saved: <SmartphoneIcon fontSize="small" />,
  syncing: <CloudSyncIcon fontSize="small" />,
  synced: <CheckCircleIcon fontSize="small" />,
  offline: <CloudOffIcon fontSize="small" />,
  failed: <ErrorOutlineIcon fontSize="small" />,
};

/**
 * `saved` and `syncing` are resting/transient states, not alarms — see
 * `syncState`'s own doc. Only these two mean the crew should notice.
 */
const SYNC_NEEDS_ATTENTION: Record<SyncState, boolean> = {
  saved: false,
  syncing: false,
  synced: false,
  offline: true,
  failed: true,
};

export interface LiveTopBarProps {
  run: LiveRunInput;
  sync: SyncState;
  /** The screen actually on display — not necessarily the run's real one. */
  screen: LiveScreen;
  /** Jumps to a screen already visited. Never offered for one that is not. */
  onJump: (screen: LiveScreen) => void;
  /** Dialling is the OS's job; this is only offered when a number is configured. */
  coduDadosHref?: string | null;
  onCoduDados?: () => void;
  onBack: () => void;
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
  screen,
  onJump,
  coduDadosHref,
  onCoduDados,
  onBack,
  onCorrectTimes,
  onAbandon,
}: LiveTopBarProps) => {
  const t = useT();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [elapsed, setElapsed] = useState(() => elapsedLabel(run));
  const back = previousStep(run);
  const visited = visitedScreens(run);

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
          {/*
            The chip this used to be had its own row; that cost a line of
            height on every screen for something the crew needs to notice only
            when it goes wrong. `saved` and `syncing` say nothing here for the
            same reason `syncState` treats them as resting, not alarming — see
            its doc. The icon rides next to the clock because that is the one
            other thing on this bar tied to *this* occurrence.
          */}
          {SYNC_NEEDS_ATTENTION[sync] && (
            <Tooltip title={syncStateLabel(t, sync)}>
              {/* Amber, not `colorWarning` (`#F57C00`, 2.64:1 on this red — under
                  the 3:1 floor for a graphical icon): `#FFD54F` measures 5.05:1
                  on `colorRedCrossRedDark` and is what actually reads as "look
                  at me" against the bar's white text and chips. */}
              <Box component="span" aria-hidden="true" sx={{ display: 'flex', color: '#FFD54F' }}>
                {SYNC_ICON[sync]}
              </Box>
            </Tooltip>
          )}
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
        mid-vital to be told the network came back. Visually hidden — the icon
        above already carries this for sighted crews, and only when it is bad
        news — but always present, because the crew's question ("will I lose
        this") deserves an answer for every state, not only the alarming ones.
      */}
      <Box
        aria-live="polite"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        {syncStateLabel(t, sync)}
      </Box>

      {/*
        Only once there is somewhere to jump: a run still on intake has
        nowhere else visited yet, and `screen === 'assessment'` is a branch
        with its own chevron back to `scene`, not a stop on this walk.
      */}
      {visited.length > 1 && screen !== 'assessment' && (
        <Stack
          direction="row"
          spacing={1}
          role="tablist"
          aria-label={t('live.visited')}
          sx={{
            px: 2,
            py: 0.75,
            overflowX: 'auto',
            bgcolor: 'rgba(0, 0, 0, 0.08)',
          }}
        >
          {visited.map((step) => (
            <Chip
              key={step}
              component="button"
              type="button"
              role="tab"
              aria-selected={step === screen}
              clickable
              size="small"
              label={liveScreenLabel(t, step)}
              onClick={() => onJump(step)}
              sx={{
                flexShrink: 0,
                fontWeight: 700,
                color: '#fff',
                border: 'none',
                bgcolor: step === screen ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.12)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.32)' },
              }}
            />
          ))}
        </Stack>
      )}

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
        {back && (
          <MenuItem
            onClick={() => {
              onBack();
              setMenu(null);
            }}
            sx={{ minHeight: 48 }}
          >
            <ArrowBackIcon fontSize="small" sx={{ mr: 1.5 }} />
            {`${t('live.back')} — ${liveScreenLabel(t, screenForState(back.state))}`}
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
