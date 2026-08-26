import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { ScheduleShiftBoard } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { AdjustShiftDialog, AdjustShiftTarget } from './AdjustShiftDialog';
import { apiFetch, ApiError } from '../../api';
import { SCHEDULE_ID } from '../../test/fixtures';

// Partial mock — the real `ApiError` comes through (needed for the
// `instanceof ApiError` check in the component's own catch block), only
// `apiFetch` is replaced.
vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  apiFetch: vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;

// Matches ScheduleBoard.test.tsx's convention — this screen has not gone
// through #180 phase 3 yet.
const i18nProvider = polyglotI18nProvider(messages, 'en');

const shift = (overrides: Partial<ScheduleShiftBoard> = {}): ScheduleShiftBoard => ({
  slot: 1,
  startMinute: 8 * 60,
  endMinute: 16 * 60,
  vehiclesNeeded: 1,
  label: '08:00–16:00',
  driverCount: 0,
  assignments: [],
  gaps: [],
  ...overrides,
});

const target = (overrides: Partial<AdjustShiftTarget> = {}): AdjustShiftTarget => ({
  date: '2026-10-03',
  slot: 1,
  shift: shift(),
  otherShiftsThatDay: [],
  ...overrides,
});

/** Sets a time input the way the native picker commits one. */
const setTime = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

function renderDialog(props: Partial<Parameters<typeof AdjustShiftDialog>[0]> = {}) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <AdjustShiftDialog
        scheduleId={SCHEDULE_ID}
        target={target()}
        isPublished={false}
        onClose={onClose}
        onSaved={onSaved}
        {...props}
      />
    </AdminContext>,
  );
  return { onSaved, onClose };
}

describe('AdjustShiftDialog', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({});
  });

  it('prefills the shift\'s current start and end', () => {
    renderDialog();

    expect(screen.getByLabelText('Start')).toHaveValue('08:00');
    expect(screen.getByLabelText('End')).toHaveValue('16:00');
  });

  it('saves the new hours to the right shift', async () => {
    const { onSaved } = renderDialog();
    const user = userEvent.setup();

    setTime('Start', '07:00');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/schedules/${SCHEDULE_ID}/shifts/2026-10-03/1`,
      { method: 'PUT', body: { startMinute: 7 * 60, endMinute: 16 * 60 } },
    );
  });

  it('blocks Save when the end is not after the start', () => {
    renderDialog();

    setTime('End', '08:00');

    expect(screen.getByText('A shift must end after it starts.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('blocks Save when the new hours overlap another shift that day', () => {
    renderDialog({
      target: target({
        otherShiftsThatDay: [{ startMinute: 15 * 60, endMinute: 20 * 60 }],
      }),
    });

    setTime('End', '18:00');

    expect(screen.getByText('Overlaps 15:00–20:00.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('offers no reset button on an unadjusted shift', () => {
    renderDialog();
    expect(screen.queryByRole('button', { name: 'Reset to window hours' })).not.toBeInTheDocument();
  });

  it('shows the window\'s own hours and a reset button on an adjusted shift', async () => {
    const { onSaved } = renderDialog({
      target: target({
        shift: shift({
          startMinute: 7 * 60,
          endMinute: 16 * 60,
          label: '07:00–16:00',
          adjustment: {
            original: { startMinute: 8 * 60, endMinute: 16 * 60 },
            adjustedBy: null,
            adjustedAt: '2026-09-20T10:00:00.000Z',
          },
        }),
      }),
    });

    expect(screen.getByText(/08:00–16:00/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reset to window hours' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/schedules/${SCHEDULE_ID}/shifts/2026-10-03/1`,
      { method: 'DELETE' },
    );
  });

  it('shows the published warning only when the schedule is published', () => {
    renderDialog({ isPublished: true });
    expect(
      screen.getByText('This rota is published — everyone on this shift will see the new hours.'),
    ).toBeInTheDocument();
  });

  it('has no published warning on a draft', () => {
    renderDialog({ isPublished: false });
    expect(
      screen.queryByText('This rota is published — everyone on this shift will see the new hours.'),
    ).not.toBeInTheDocument();
  });

  it('surfaces a coded API error in translation', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError('Overlap', 400, 'SHIFT_ADJUSTMENT_OVERLAPS', { other: '18:00–22:00' }),
    );
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('This overlaps 18:00–22:00.')).toBeInTheDocument();
  });
});
