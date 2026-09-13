import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { AssignmentCompensationKind, ScheduleAssignment, ScheduleShiftBoard } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { CompensationDialog, CompensationTarget } from './CompensationDialog';
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

const assignment = (overrides: Partial<ScheduleAssignment> & { id: string }): ScheduleAssignment => ({
  id: overrides.id,
  scheduleId: SCHEDULE_ID,
  date: '2026-10-03',
  slot: 1,
  userId: overrides.id,
  user: { id: overrides.id, firstName: 'Ana', lastName: 'Silva', isDriver: false, certifications: [] },
  roleId: null,
  roleName: null,
  isOverride: false,
  selfAssigned: false,
  availability: 'submitted',
  assignedById: 'coord-1',
  assignedAt: '2026-09-20T10:00:00.000Z',
  ...overrides,
});

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

const target = (overrides: Partial<CompensationTarget> = {}): CompensationTarget => ({
  date: '2026-10-03',
  slot: 1,
  shift: shift(),
  ...overrides,
});

function renderDialog(props: Partial<Parameters<typeof CompensationDialog>[0]> = {}) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <CompensationDialog scheduleId={SCHEDULE_ID} target={target()} onClose={onClose} onSaved={onSaved} {...props} />
    </AdminContext>,
  );
  return { onSaved, onClose };
}

describe('CompensationDialog', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({});
  });

  it('renders nothing without a target', () => {
    render(
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <CompensationDialog scheduleId={SCHEDULE_ID} target={null} onClose={vi.fn()} onSaved={vi.fn()} />
      </AdminContext>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("defaults each person's control to their stored compensation", () => {
    renderDialog({
      target: target({
        shift: shift({
          assignments: [
            assignment({ id: 'ana', user: { id: 'ana', firstName: 'Ana', lastName: 'Silva', isDriver: false, certifications: [] }, compensation: AssignmentCompensationKind.VOLUNTEER }),
            assignment({ id: 'bruno', user: { id: 'bruno', firstName: 'Bruno', lastName: 'Costa', isDriver: false, certifications: [] }, compensation: AssignmentCompensationKind.PAID }),
          ],
        }),
      }),
    });

    const anaGroup = screen.getByRole('group', { name: 'Ana Silva' });
    expect(within(anaGroup).getByRole('button', { name: 'Volunteer', pressed: true })).toBeInTheDocument();

    const brunoGroup = screen.getByRole('group', { name: 'Bruno Costa' });
    expect(within(brunoGroup).getByRole('button', { name: 'Paid', pressed: true })).toBeInTheDocument();
  });

  it('shows a SALARY row as read-only, with no control to change it', () => {
    renderDialog({
      target: target({
        shift: shift({
          assignments: [
            assignment({
              id: 'carla',
              user: { id: 'carla', firstName: 'Carla', lastName: 'Ferreira', isDriver: false, certifications: [] },
              compensation: AssignmentCompensationKind.SALARY,
            }),
          ],
        }),
      }),
    });

    expect(screen.getByText('On contract clock')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Carla Ferreira' })).not.toBeInTheDocument();
  });

  it('saves the crew, switching one person to Paid, and leaves the SALARY row out of the payload', async () => {
    const { onSaved } = renderDialog({
      target: target({
        shift: shift({
          assignments: [
            assignment({
              id: 'ana',
              user: { id: 'ana', firstName: 'Ana', lastName: 'Silva', isDriver: false, certifications: [] },
              compensation: AssignmentCompensationKind.VOLUNTEER,
            }),
            assignment({
              id: 'carla',
              user: { id: 'carla', firstName: 'Carla', lastName: 'Ferreira', isDriver: false, certifications: [] },
              compensation: AssignmentCompensationKind.SALARY,
            }),
          ],
        }),
      }),
    });
    const user = userEvent.setup();

    await user.click(within(screen.getByRole('group', { name: 'Ana Silva' })).getByRole('button', { name: 'Paid' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(`/schedules/${SCHEDULE_ID}/shifts/2026-10-03/1/compensation`, {
      method: 'PUT',
      body: { assignments: [{ assignmentId: 'ana', compensation: AssignmentCompensationKind.PAID }] },
    });
  });

  it('surfaces a coded API error in translation', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Refused', 400, 'API_ERROR', {}));
    renderDialog({
      target: target({
        shift: shift({
          assignments: [
            assignment({
              id: 'ana',
              user: { id: 'ana', firstName: 'Ana', lastName: 'Silva', isDriver: false, certifications: [] },
              compensation: AssignmentCompensationKind.VOLUNTEER,
            }),
          ],
        }),
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Refused')).toBeInTheDocument();
  });
});
