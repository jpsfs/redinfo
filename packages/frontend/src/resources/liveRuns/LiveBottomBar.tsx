import { Badge, Box, Button, CircularProgress, IconButton, Paper, Stack, Typography } from '@mui/material';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import NavigationIcon from '@mui/icons-material/Navigation';
import { LiveRunInput, LiveRunState, LiveScreen } from '@redinfo/shared';
import { liveStampLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { timeOfDay } from '../eventReports/reportDraft';
import { nextStampForScreen } from './liveRun';

export interface LiveBottomBarProps {
  run: LiveRunInput;
  /**
   * The screen actually on display, which the Android back gesture can leave
   * behind the run's real one — the bar reads off this, not off `run.state`
   * directly, so it never disagrees with what is on screen above it.
   */
  screen: LiveScreen;
  /** Writes the stamp and advances the run. */
  onStamp: () => void;
  /** Opens the correction sheet for a transition already marked. */
  onCorrect: () => void;
  /** Present only on the screens that hand off to a map, and only with an address. */
  navigateHref?: string | null;
  /**
   * The assessment screen's own exit. When set, the bar shows one full-width
   * primary button and nothing else that could advance the run — no stamp
   * button (there never is one on `assessment`, see `nextStampForScreen`) and
   * no `NAVEGAR` button either, so the only tap available here is the safe one.
   */
  onDone?: () => void;
  /** The closing screen's second act, once the run is stamped available. */
  onFinish?: () => void;
  /**
   * The closing screen's other exit: same close, straight back to the home
   * page instead of into the fresh draft report. Rendered beside `onFinish`
   * only when both are set.
   */
  onFinishAndExit?: () => void;
  finishing?: boolean;
  /** Why the run cannot be closed yet, already translated. */
  blockedReason?: string | null;
  /** How many taps the material log holds, for the entry button's badge. */
  materialsCount: number;
  /** Opens the material log — available throughout the run, not one screen of it. */
  onOpenMaterials: () => void;
}

/**
 * The one control in thumb reach.
 *
 * Its whole state table is `nextStampForScreen` — a pure function over the run
 * *and the screen on display* — so what the button says, what it writes and
 * where the run goes next are three views of one fact rather than three places
 * to keep in sync. Reading off the screen rather than off `run.state` directly
 * is what keeps the bar honest when the crew has browsed back with the OS
 * gesture to an earlier screen than the run is really on: it offers that
 * earlier step's own correction, never the live action for a step that is not
 * the one on screen.
 *
 * Tapping an already-stamped transition **re-labels to "Alterar" and opens the
 * correction sheet** rather than silently overwriting: the same
 * `value ? change : now` rule the report form already follows, and for the same
 * reason — a stamp records a moment, and quietly moving one is how a chronology
 * stops being evidence.
 *
 * Nothing destructive is ever rendered here. That lives in the top bar's
 * overflow, out of thumb sweep.
 */
export const LiveBottomBar = ({
  run,
  screen,
  onStamp,
  onCorrect,
  navigateHref,
  onDone,
  onFinish,
  onFinishAndExit,
  finishing = false,
  blockedReason,
  materialsCount,
  onOpenMaterials,
}: LiveBottomBarProps) => {
  const t = useT();
  const step = nextStampForScreen(run, screen);
  // Logging stops making sense once the run has already become a report —
  // stock only moves on submit, and by then the picker belongs to the report
  // editor's own `MaterialsSection`, not to this bar.
  const canLogMaterials = run.state !== LiveRunState.CLOSED;

  return (
    <Paper
      square
      elevation={8}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        px: 2,
        pt: 1.5,
        // Clears the Android navigation bar, which otherwise sits on top of the
        // one control the crew needs.
        pb: 'calc(12px + env(safe-area-inset-bottom))',
      }}
    >
      {blockedReason && (
        <Typography
          variant="body2"
          sx={{ mb: 1, fontWeight: 600, color: 'warning.dark' }}
          role="status"
        >
          {blockedReason}
        </Typography>
      )}

      <Stack direction="row" spacing={1.5} alignItems="stretch">
        {/*
          `onDone` replaces the whole row's stamp/navigate half with one safe
          exit: on `assessment`, `nextStampForScreen` is always `null` (see its
          own doc comment), so `step` never renders here anyway — but
          `navigateHref` is skipped explicitly too, so a caller passing both by
          accident cannot resurrect a button that advances the run.
        */}
        {onDone ? (
          <Button
            fullWidth
            variant="contained"
            onClick={onDone}
            sx={{
              minHeight: 64,
              borderRadius: 2,
              fontWeight: 800,
              fontSize: '1.0625rem',
              letterSpacing: '0.02em',
            }}
          >
            {t('live.assessmentDone')}
          </Button>
        ) : (
          <>
            {step && (
              <Button
                fullWidth
                variant={step.done ? 'outlined' : 'contained'}
                onClick={step.done ? onCorrect : onStamp}
                sx={{
                  minHeight: 64,
                  borderRadius: 2,
                  fontWeight: 800,
                  fontSize: '1.0625rem',
                  letterSpacing: '0.02em',
                  lineHeight: 1.15,
                }}
              >
                {step.done ? (
                  <Box>
                    <Box sx={{ fontSize: '0.75rem', fontWeight: 700, opacity: 0.8 }}>
                      {liveStampLabel(t, step.field)}
                    </Box>
                    <Box sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {timeOfDay(run[step.field])} · {t('live.stamp.change')}
                    </Box>
                  </Box>
                ) : (
                  liveStampLabel(t, step.field)
                )}
              </Button>
            )}

            {/*
              A real anchor, not `window.open` from an onClick. Chrome on
              Android keeps the SPA alive behind `target="_blank"` (so the run,
              the timers and the wake lock survive), long-press gives "open in
              app / copy" for free, and it is keyboard- and screen-reader-correct
              with no ARIA patch.
            */}
            {navigateHref && (
              <Button
                component="a"
                href={navigateHref}
                target="_blank"
                rel="noopener noreferrer"
                variant="outlined"
                startIcon={<NavigationIcon />}
                sx={{ minHeight: 64, minWidth: 132, borderRadius: 2, fontWeight: 800 }}
              >
                {t('live.navigate')}
              </Button>
            )}
          </>
        )}

        {canLogMaterials && (
          <IconButton
            aria-label={t('live.materials.entryButton')}
            onClick={onOpenMaterials}
            sx={{
              minHeight: 64,
              minWidth: 64,
              borderRadius: 2,
              border: 1,
              borderColor: 'divider',
            }}
          >
            <Badge badgeContent={materialsCount} color="primary" max={99}>
              <Inventory2Icon />
            </Badge>
          </IconButton>
        )}
      </Stack>

      {/*
        Two ways out of the run, once it can close: the everyday path into a
        fresh draft report, and — new — straight back to the home page for a
        crew that will finish the report later from a desk. Side by side rather
        than stacked so neither reads as the "real" ending; both respect
        `finishing` so a slow request cannot be double-submitted through the
        other button.
      */}
      {(onFinish || onFinishAndExit) && (
        <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
          {onFinish && (
            <Button
              fullWidth
              variant="contained"
              color="primary"
              disabled={finishing}
              onClick={onFinish}
              startIcon={finishing ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{
                minHeight: 64,
                borderRadius: 2,
                fontWeight: 800,
                whiteSpace: 'normal',
                lineHeight: 1.15,
              }}
            >
              {finishing ? t('live.finishing') : t('live.finish')}
            </Button>
          )}
          {onFinishAndExit && (
            <Button
              fullWidth
              variant="outlined"
              disabled={finishing}
              onClick={onFinishAndExit}
              sx={{
                minHeight: 64,
                borderRadius: 2,
                fontWeight: 800,
                whiteSpace: 'normal',
                lineHeight: 1.15,
              }}
            >
              {t('live.finishAndExit')}
            </Button>
          )}
        </Stack>
      )}
    </Paper>
  );
};
