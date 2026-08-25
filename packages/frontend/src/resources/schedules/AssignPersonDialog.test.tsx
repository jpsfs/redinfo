import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { messages } from '../../i18n/i18nProvider';
import { AssignPersonDialog, AssignTarget } from './AssignPersonDialog';
import { apiFetch } from '../../api';
import {
  CARLA_PERSON,
  EMERGENCY_ROLES,
  SCHEDULE_ID,
  scheduleCandidates,
} from '../../test/fixtures';

vi.mock('../../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn() }));

const mockApiFetch = apiFetch as unknown as Mock;

const [DRIVER_ROLE, , MEMBER_ROLE] = EMERGENCY_ROLES;

// This screen has not gone through #180 phase 3 yet — English by convention.
const i18nProvider = polyglotI18nProvider(messages, 'en');

const target = (overrides: Partial<AssignTarget> = {}): AssignTarget => ({
  date: '2026-10-03',
  slot: 1,
  shiftLabel: '08:00–16:00',
  role: MEMBER_ROLE,
  ...overrides,
});

function renderDialog(props: Partial<Parameters<typeof AssignPersonDialog>[0]> = {}) {
  const onAssigned = vi.fn();
  const onClose = vi.fn();
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <AssignPersonDialog
        scheduleId={SCHEDULE_ID}
        target={target()}
        onClose={onClose}
        onAssigned={onAssigned}
        {...props}
      />
    </AdminContext>,
  );
  return { onAssigned, onClose };
}

describe('AssignPersonDialog', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(scheduleCandidates());
  });

  it('names the role and shift being filled', async () => {
    renderDialog();

    expect(await screen.findByText(/Assign · Team Member/)).toBeInTheDocument();
    expect(screen.getByText('Sat, 3 Oct · 08:00–16:00')).toBeInTheDocument();
  });

  // AC: "the people who submitted availability for it are surfaced first,
  // marked as available, and assignable in one action".
  it('shows the people who submitted for the shift up front', async () => {
    renderDialog();

    expect(await screen.findByText('Available for this shift')).toBeInTheDocument();
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
  });

  it('assigns a submitter in one action', async () => {
    const user = userEvent.setup();
    const { onAssigned } = renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Assign' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(`/schedules/${SCHEDULE_ID}/assignments`, {
        method: 'POST',
        body: {
          date: '2026-10-03',
          slot: 1,
          userId: 'u-bruno',
          roleId: MEMBER_ROLE.id,
        },
      }),
    );
    expect(onAssigned).toHaveBeenCalled();
  });

  // AC: "Coordinators can assign a person who did not submit availability …
  // cover is often agreed off-platform".
  it('keeps everyone else behind a disclosure, labelled as an override', async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText('Available for this shift');
    expect(screen.queryByText('Carla Ferreira')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show everyone else \(1\)/i }));

    expect(screen.getByText('Carla Ferreira')).toBeInTheDocument();
    expect(screen.getByText(/recorded as an override/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /assign as override/i })).toBeInTheDocument();
  });

  it('says when someone declared no availability, rather than hiding them', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole('button', { name: /show everyone else/i }));

    expect(screen.getByText('Declined')).toBeInTheDocument();
    expect(screen.getByText(/agree it with them before assigning/i)).toBeInTheDocument();
  });

  // Reversed from the old "driver is a bar" behaviour (ADO #163): everyone
  // eligible is listed, and someone lacking the post's requirement is flagged
  // and needs a typed reason before they can be assigned.
  it('explains that an uncertified person is listed rather than hidden, for a role with a requirement', async () => {
    renderDialog({ target: target({ role: DRIVER_ROLE }) });

    expect(
      await screen.findByText(/listed rather than hidden/i),
    ).toBeInTheDocument();
  });

  it('does not say that for a role which has no such requirement', async () => {
    renderDialog();

    await screen.findByText('Available for this shift');
    expect(screen.queryByText(/listed rather than hidden/i)).not.toBeInTheDocument();
  });

  it('flags someone lacking the required certification and asks for a reason before assigning them', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(
      scheduleCandidates({
        available: [],
        others: [
          {
            ...CARLA_PERSON,
            availability: 'pending',
            submittedForShift: false,
            alreadyOnShift: false,
            currentRoleName: null,
            dutyCount: 0,
            conflictLabel: null,
          },
        ],
      }),
    );
    renderDialog({ target: target({ role: DRIVER_ROLE }) });

    await user.click(await screen.findByRole('button', { name: /show everyone else/i }));
    expect(screen.getByText('No Driver')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Assign by exception' }));

    const confirmDialog = (
      await screen.findByRole('heading', { name: /assign without the required certification/i })
    ).closest('[role="dialog"]') as HTMLElement;
    expect(within(confirmDialog).getByText(/Driver requires Driver\./i)).toBeInTheDocument();
    const confirmButton = within(confirmDialog).getByRole('button', { name: 'Assign by exception' });
    expect(confirmButton).toBeDisabled();

    await user.type(within(confirmDialog).getByLabelText(/Reason/), 'Only driver available tonight');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(`/schedules/${SCHEDULE_ID}/assignments`, {
        method: 'POST',
        body: {
          date: '2026-10-03',
          slot: 1,
          userId: CARLA_PERSON.id,
          roleId: DRIVER_ROLE.id,
          overrideReason: 'Only driver available tonight',
        },
      }),
    );
  });

  it('will not assign someone already on the shift', async () => {
    mockApiFetch.mockResolvedValue(
      scheduleCandidates({
        available: [
          {
            ...CARLA_PERSON,
            availability: 'submitted',
            submittedForShift: true,
            alreadyOnShift: true,
            currentRoleName: 'Driver',
            dutyCount: 1,
            conflictLabel: null,
          },
        ],
      }),
    );
    renderDialog();

    expect(await screen.findByRole('button', { name: 'Assigned' })).toBeDisabled();
    expect(screen.getByText(/Already on Driver for this shift/)).toBeInTheDocument();
  });

  it('warns about an overlapping duty the same day', async () => {
    mockApiFetch.mockResolvedValue(
      scheduleCandidates({
        available: [
          {
            ...CARLA_PERSON,
            availability: 'submitted',
            submittedForShift: true,
            alreadyOnShift: false,
            currentRoleName: null,
            dutyCount: 2,
            conflictLabel: 'Already on 16:00–24:00 this day',
          },
        ],
      }),
    );
    renderDialog();

    expect(await screen.findByText('Already on 16:00–24:00 this day')).toBeInTheDocument();
  });

  it('filters both lists by the search box', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(await screen.findByLabelText('Search personnel'), 'bruno');

    expect(screen.getByText('Bruno Costa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show everyone else \(0\)/i })).toBeInTheDocument();
  });

  it('reports a refused assignment without closing', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string) =>
      path.includes('/candidates')
        ? Promise.resolve(scheduleCandidates())
        : Promise.reject(new Error('Team Member is full on this shift (1 person).')),
    );
    const { onAssigned } = renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Assign' }));

    expect(
      await screen.findByText('Team Member is full on this shift (1 person).'),
    ).toBeInTheDocument();
    expect(onAssigned).not.toHaveBeenCalled();
  });

  it('says plainly when nobody submitted for the shift', async () => {
    mockApiFetch.mockResolvedValue(scheduleCandidates({ available: [] }));
    renderDialog();

    expect(
      await screen.findByText('Nobody submitted availability for this shift.'),
    ).toBeInTheDocument();
  });

  it('renders nothing until a slot is chosen', () => {
    renderDialog({ target: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
