import { Box, Typography } from '@mui/material';
import { HourTick, TimelineWindow, hourTicks, minutesToX } from './planningTime';

export const RULER_HEIGHT = 26;

/**
 * The hour scale the board's blocks are read against (#235).
 *
 * The first version of this board drew blocks onto a blank strip with no axis
 * at all, which made every position meaningless — a planner could see that two
 * legs overlapped but not when either happened. Every hour gets a gridline;
 * labels thin out rather than overprint (see `hourTicks`).
 */
export const TimelineRuler = ({
  timelineWindow,
  labelColumnWidth,
}: {
  timelineWindow: TimelineWindow;
  /** Width of the sticky vehicle/journey column the ticks must clear. */
  labelColumnWidth: number;
}) => {
  const ticks: HourTick[] = hourTicks(timelineWindow);
  return (
    <Box sx={{ display: 'flex', alignItems: 'stretch', position: 'sticky', top: 0, zIndex: 4 }}>
      <Box
        sx={{
          width: labelColumnWidth,
          flexShrink: 0,
          position: 'sticky',
          left: 0,
          zIndex: 5,
          bgcolor: 'background.paper',
          borderRight: 1,
          borderColor: 'divider',
        }}
      />
      <Box
        sx={{
          position: 'relative',
          flexGrow: 1,
          height: RULER_HEIGHT,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {ticks.map((tick) => (
          <Box
            key={tick.minutes}
            sx={{
              position: 'absolute',
              left: minutesToX(tick.minutes, timelineWindow),
              top: 0,
              bottom: 0,
              borderLeft: 1,
              borderColor: tick.labelled ? 'divider' : 'action.hover',
            }}
          >
            {tick.labelled && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ pl: 0.5, lineHeight: `${RULER_HEIGHT}px`, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
              >
                {tick.label}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

/** The same hour gridlines, drawn behind a lane's blocks so a block's position
 * stays readable away from the ruler at the top of a tall board. */
export const TimelineGridlines = ({ timelineWindow }: { timelineWindow: TimelineWindow }) => (
  <>
    {hourTicks(timelineWindow).map((tick) => (
      <Box
        key={tick.minutes}
        aria-hidden
        sx={{
          position: 'absolute',
          left: minutesToX(tick.minutes, timelineWindow),
          top: 0,
          bottom: 0,
          borderLeft: 1,
          borderColor: tick.labelled ? 'divider' : 'action.hover',
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      />
    ))}
  </>
);
