import { Box, Typography } from '@mui/material';
import { Title } from 'react-admin';
import { LiveRunBoard } from '../resources/liveRuns';

/**
 * The emergencies being run right now, as its own screen rather than only a
 * Dashboard tile — see #181's approved navigation design. Gated by
 * `VIEW_LIVE_RUNS` in `layout/navigation.tsx`; this component itself does no
 * permission check, the same way the Dashboard's copy of the board does not.
 *
 * `LiveRunBoard` renders its own `Card`, so this page wraps it in a `Box`
 * rather than a second card.
 */
export const LiveRunsPage = () => (
  <Box sx={{ mt: 2 }}>
    <Title title="Live Emergencies" />
    <Typography variant="h6" sx={{ mb: 2 }}>
      Live Emergencies
    </Typography>
    <LiveRunBoard
      emptyState={
        <Typography variant="body2" color="text.secondary">
          No emergency is being run right now.
        </Typography>
      }
    />
  </Box>
);
