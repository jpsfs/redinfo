import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, Notification, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { StaffAbsenceKind } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { StaffAbsenceDialog } from './StaffAbsenceDialog';
import { apiFetch } from '../api';

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  apiFetch: vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;
const i18nProvider = polyglotI18nProvider(messages, 'en');

const ANA = { id: 'u-ana', firstName: 'Ana', lastName: 'Silva' };
const BRUNO = { id: 'u-bruno', firstName: 'Bruno', lastName: 'Costa' };

const EXISTING = {
  id: 'abs-1',
  userId: ANA.id,
  kind: StaffAbsenceKind.SICK_LEAVE,
  startDate: '2026-10-06',
  endDate: '2026-10-08',
  notes: 'Flu',
  createdById: 'u-coord',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function renderDialog(props: Partial<Parameters<typeof StaffAbsenceDialog>[0]> = {}) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <StaffAbsenceDialog
        open
        person={ANA}
        people={[ANA, BRUNO]}
        startDate="2026-10-10"
        endDate="2026-10-12"
        onClose={onClose}
        onSaved={onSaved}
        {...props}
      />
      <Notification />
    </AdminContext>,
  );
  return { onSaved, onClose };
}

describe('StaffAbsenceDialog', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({});
  });

  it('proposes the selected range for a new absence, defaulting to vacation', () => {
    renderDialog();
    expect(screen.getByText('Record absence')).toBeInTheDocument();
    expect(screen.getByLabelText('Start')).toHaveValue('2026-10-10');
    expect(screen.getByLabelText('End')).toHaveValue('2026-10-12');
    expect(screen.queryByRole('button', { name: /delete absence/i })).not.toBeInTheDocument();
  });

  it('creates a new absence with the chosen kind and notes', async () => {
    const user = userEvent.setup();
    const { onSaved, onClose } = renderDialog();

    await user.click(screen.getByLabelText('Kind'));
    await user.click(await screen.findByRole('option', { name: 'Sick leave' }));
    await user.type(screen.getByLabelText('Notes'), 'Planned time off');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/staff-absences', {
        method: 'POST',
        body: {
          userId: ANA.id,
          kind: StaffAbsenceKind.SICK_LEAVE,
          startDate: '2026-10-10',
          endDate: '2026-10-12',
          notes: 'Planned time off',
        },
      }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('prefills an existing absence and offers to delete it', () => {
    renderDialog({ existing: EXISTING, startDate: EXISTING.startDate, endDate: EXISTING.endDate });
    expect(screen.getByText('Edit absence')).toBeInTheDocument();
    expect(screen.getByLabelText('Start')).toHaveValue('2026-10-06');
    expect(screen.getByDisplayValue('Flu')).toBeInTheDocument();
  });

  it('saves a correction to an existing absence with PATCH', async () => {
    const user = userEvent.setup();
    renderDialog({ existing: EXISTING, startDate: EXISTING.startDate, endDate: EXISTING.endDate });

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/staff-absences/abs-1', {
        method: 'PATCH',
        body: {
          kind: StaffAbsenceKind.SICK_LEAVE,
          startDate: '2026-10-06',
          endDate: '2026-10-08',
          notes: 'Flu',
        },
      }),
    );
  });

  it('deletes an existing absence', async () => {
    const user = userEvent.setup();
    const { onSaved } = renderDialog({ existing: EXISTING, startDate: EXISTING.startDate, endDate: EXISTING.endDate });

    await user.click(screen.getByRole('button', { name: /delete absence/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/staff-absences/abs-1', { method: 'DELETE' }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('surfaces a save failure without closing', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText('Could not save the absence.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  describe('partial-day times (rare, other paid leave only — full day is the default)', () => {
    const pickOtherPaidLeave = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByLabelText('Kind'));
      await user.click(await screen.findByRole('option', { name: 'Other paid leave' }));
    };

    it('offers no partial-day option at all for vacation, the default kind', () => {
      renderDialog({ startDate: '2026-10-10', endDate: '2026-10-10' });
      expect(screen.queryByLabelText(/Partial day/)).not.toBeInTheDocument();
    });

    it('offers no partial-day option for sick leave either', async () => {
      const user = userEvent.setup();
      renderDialog({ startDate: '2026-10-10', endDate: '2026-10-10' });
      await user.click(screen.getByLabelText('Kind'));
      await user.click(await screen.findByRole('option', { name: 'Sick leave' }));
      expect(screen.queryByLabelText(/Partial day/)).not.toBeInTheDocument();
    });

    it('offers the checkbox once other paid leave is picked, for a single-day range', async () => {
      const user = userEvent.setup();
      renderDialog({ startDate: '2026-10-10', endDate: '2026-10-10' });
      await pickOtherPaidLeave(user);
      expect(screen.getByLabelText(/Partial day/)).not.toBeChecked();
      expect(screen.queryByLabelText('Start time')).not.toBeInTheDocument();
    });

    it('disables the checkbox for a multi-day range even on other paid leave', async () => {
      const user = userEvent.setup();
      renderDialog({ startDate: '2026-10-10', endDate: '2026-10-12' });
      await pickOtherPaidLeave(user);
      expect(screen.getByLabelText(/Partial day/)).toBeDisabled();
    });

    it('checking it reveals start/end time fields and sends them on save', async () => {
      const user = userEvent.setup();
      renderDialog({ startDate: '2026-10-10', endDate: '2026-10-10' });
      await pickOtherPaidLeave(user);

      await user.click(screen.getByLabelText(/Partial day/));
      await user.clear(screen.getByLabelText('Start time'));
      await user.type(screen.getByLabelText('Start time'), '09:00');
      await user.clear(screen.getByLabelText('End time'));
      await user.type(screen.getByLabelText('End time'), '11:00');
      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/staff-absences',
          expect.objectContaining({
            body: expect.objectContaining({ startTime: '09:00', endTime: '11:00' }),
          }),
        ),
      );
    });

    it('unchecking after checking omits the times again', async () => {
      const user = userEvent.setup();
      renderDialog({ startDate: '2026-10-10', endDate: '2026-10-10' });
      await pickOtherPaidLeave(user);

      await user.click(screen.getByLabelText(/Partial day/));
      await user.click(screen.getByLabelText(/Partial day/));
      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/staff-absences',
          expect.objectContaining({
            body: expect.not.objectContaining({ startTime: expect.anything() }),
          }),
        ),
      );
    });

    it('disables Save when the end time is not after the start time', async () => {
      const user = userEvent.setup();
      renderDialog({ startDate: '2026-10-10', endDate: '2026-10-10' });
      await pickOtherPaidLeave(user);

      await user.click(screen.getByLabelText(/Partial day/));
      await user.clear(screen.getByLabelText('Start time'));
      await user.type(screen.getByLabelText('Start time'), '11:00');
      await user.clear(screen.getByLabelText('End time'));
      await user.type(screen.getByLabelText('End time'), '09:00');

      expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    });

    it('switching away from other paid leave hides and clears a checked partial day', async () => {
      const user = userEvent.setup();
      renderDialog({ startDate: '2026-10-10', endDate: '2026-10-10' });
      await pickOtherPaidLeave(user);
      await user.click(screen.getByLabelText(/Partial day/));
      expect(screen.getByLabelText('Start time')).toBeInTheDocument();

      await user.click(screen.getByLabelText('Kind'));
      await user.click(await screen.findByRole('option', { name: 'Vacation' }));

      expect(screen.queryByLabelText(/Partial day/)).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^save$/i }));
      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/staff-absences',
          expect.objectContaining({ body: expect.not.objectContaining({ startTime: expect.anything() }) }),
        ),
      );
    });

    it('prefills the checkbox and times when editing an existing partial-day absence', () => {
      renderDialog({
        existing: {
          ...EXISTING,
          kind: StaffAbsenceKind.OTHER_PAID_LEAVE,
          startDate: '2026-10-06',
          endDate: '2026-10-06',
          startTime: '09:00',
          endTime: '11:00',
        },
        startDate: '2026-10-06',
        endDate: '2026-10-06',
      });
      expect(screen.getByLabelText(/Partial day/)).toBeChecked();
      expect(screen.getByLabelText('Start time')).toHaveValue('09:00');
      expect(screen.getByLabelText('End time')).toHaveValue('11:00');
    });
  });

  describe('without a preset person (the page-level "Add absence" button)', () => {
    it('shows a picker defaulting to the first person on the roster', () => {
      renderDialog({ person: undefined });
      expect(screen.getByLabelText('Person')).toHaveTextContent('Ana Silva');
    });

    it('saves for whoever is picked', async () => {
      const user = userEvent.setup();
      renderDialog({ person: undefined });

      await user.click(screen.getByLabelText('Person'));
      await user.click(await screen.findByRole('option', { name: 'Bruno Costa' }));
      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/staff-absences',
          expect.objectContaining({ method: 'POST', body: expect.objectContaining({ userId: BRUNO.id }) }),
        ),
      );
    });
  });
});
