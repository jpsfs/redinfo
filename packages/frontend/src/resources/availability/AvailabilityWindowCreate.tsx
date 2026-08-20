import { useEffect, useState } from 'react';
import {
  Create,
  DateInput,
  SaveButton,
  SimpleForm,
  Toolbar,
  required,
  useNotify,
} from 'react-admin';
import { Alert, CircularProgress } from '@mui/material';
import { AvailabilityWindow } from '@redinfo/shared';
import { apiFetch } from '../../api';
import { formatDateRange } from '../../utils/dates';

/** Blocks Save while a window is already open, mirroring the API's 409. */
const CreateToolbar = ({ blocked }: { blocked: boolean }) => (
  <Toolbar>
    <SaveButton label="Open window" disabled={blocked} />
  </Toolbar>
);

const validateRange = (values: { startDate?: string; endDate?: string }) => {
  const errors: Record<string, string> = {};
  if (values.startDate && values.endDate && values.endDate < values.startDate) {
    errors.endDate = 'End date must be on or after the start date.';
  }
  return errors;
};

export const AvailabilityWindowCreate = () => {
  const notify = useNotify();
  const [activeWindow, setActiveWindow] = useState<AvailabilityWindow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AvailabilityWindow | null>('/availability-windows/active')
      .then((window) => {
        if (!cancelled) setActiveWindow(window ?? null);
      })
      .catch(() => notify('Could not check for an open window', { type: 'warning' }))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Create redirect="list" title="Open availability window">
      <SimpleForm
        validate={validateRange}
        toolbar={<CreateToolbar blocked={loading || activeWindow !== null} />}
      >
        {loading && <CircularProgress size={20} />}

        {!loading && activeWindow && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            An availability window is already open (
            {formatDateRange(activeWindow.startDate, activeWindow.endDate)}). Close it
            before opening the next one.
          </Alert>
        )}

        {!loading && !activeWindow && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Volunteers will be able to submit availability for every day in this range.
            Workdays have one shift (20:00–24:00); weekends and holidays have two
            (08:00–16:00 and 16:00–24:00).
          </Alert>
        )}

        <DateInput source="startDate" label="Start date" validate={required()} />
        <DateInput source="endDate" label="End date" validate={required()} />
      </SimpleForm>
    </Create>
  );
};
