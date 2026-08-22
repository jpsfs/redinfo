import { Show, useRecordContext } from 'react-admin';
import { Box } from '@mui/material';
import { Schedule } from '@redinfo/shared';
import { ScheduleBoard } from './ScheduleBoard';

const BoardForRecord = () => {
  const record = useRecordContext<Schedule>();
  if (!record) return null;
  return <ScheduleBoard scheduleId={record.id} />;
};

/**
 * The builder.
 *
 * The record itself only supplies the id: everything on screen — the window's
 * days, its shifts, its roles, the assignments and what is missing — comes from
 * `GET /schedules/:id/board`, so the coverage rules are computed in one place
 * rather than reassembled here.
 */
export const ScheduleShow = () => (
  // `Show` already wraps its children in the page Card, so this adds padding
  // rather than a second surface.
  <Show actions={false} title="Schedule">
    <Box sx={{ p: 2 }}>
      <BoardForRecord />
    </Box>
  </Show>
);
