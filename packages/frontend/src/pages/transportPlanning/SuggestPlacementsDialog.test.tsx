import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import { LegDirection, RankedPlacement } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { SuggestPlacementsDialog } from './SuggestPlacementsDialog';
import { UnplannedGroup } from './unplannedGroups';
import { apiFetch, ApiError } from '../../api';

vi.mock('../../api', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));

const mockApiFetch = apiFetch as unknown as Mock;

const GROUP: UnplannedGroup = {
  key: 'fac-1|OUTBOUND|2026-09-16T08:00:00.000Z',
  facilityId: 'fac-1',
  facilityName: 'Hospital Central',
  direction: LegDirection.OUTBOUND,
  arrivalInstant: '2026-09-16T08:00:00.000Z',
  legIds: ['leg-1', 'leg-2'],
};

const dataProvider = testDataProvider();

const renderDialog = (props: Partial<React.ComponentProps<typeof SuggestPlacementsDialog>> = {}) =>
  render(
    <AdminContext dataProvider={dataProvider} i18nProvider={polyglotI18nProvider(messages, 'en')}>
      <SuggestPlacementsDialog group={GROUP} date="2026-09-16" onClose={vi.fn()} onSaved={vi.fn()} {...props} />
    </AdminContext>,
  );

const EXISTING: RankedPlacement = {
  vehicle: { id: 'veh-1', numeroCauda: '101', licensePlate: 'AA-11-BB' },
  tripId: 'trip-1',
  journeyNumber: 2,
  insertPosition: 1,
  deltaKm: 3.5,
  deltaMinutes: 8,
  arrivalMarginMinutes: 12,
  blockedBy: [],
};

const FRESH: RankedPlacement = {
  vehicle: { id: 'veh-2', numeroCauda: '202', licensePlate: 'CC-22-DD' },
  tripId: null,
  journeyNumber: null,
  insertPosition: 0,
  deltaKm: 5,
  deltaMinutes: 10,
  arrivalMarginMinutes: null,
  blockedBy: [],
};

const BLOCKED: RankedPlacement = {
  vehicle: { id: 'veh-3', numeroCauda: '303', licensePlate: 'EE-33-FF' },
  tripId: 'trip-3',
  journeyNumber: 1,
  insertPosition: 0,
  deltaKm: 1,
  deltaMinutes: 2,
  arrivalMarginMinutes: -5,
  blockedBy: ['CAPACITY_WHEELCHAIR'],
};

describe('SuggestPlacementsDialog', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('asks for suggestions for the group and shows each candidate', async () => {
    mockApiFetch.mockResolvedValue([EXISTING, FRESH]);
    renderDialog();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/trips/suggest-placements', {
        method: 'POST',
        body: { legIds: ['leg-1', 'leg-2'] },
      }),
    );

    expect(await screen.findByText('101 · AA-11-BB')).toBeInTheDocument();
    expect(screen.getByText('Journey 2')).toBeInTheDocument();
    expect(screen.getByText('3.5 km extra')).toBeInTheDocument();
    expect(screen.getByText('12 min to spare')).toBeInTheDocument();

    expect(screen.getByText('202 · CC-22-DD')).toBeInTheDocument();
    expect(screen.getByText('New journey')).toBeInTheDocument();
  });

  it('disables Apply for a candidate blocked on capacity, but still shows it', async () => {
    mockApiFetch.mockResolvedValue([BLOCKED]);
    renderDialog();

    expect(await screen.findByText('303 · EE-33-FF')).toBeInTheDocument();
    expect(screen.getByText('not enough wheelchair positions')).toBeInTheDocument();
    expect(screen.getByText('5 min late')).toBeInTheDocument();
    const applyButtons = screen.getAllByRole('button', { name: 'Apply' });
    expect(applyButtons[0]).toBeDisabled();
  });

  it('applies an existing-journey candidate by assigning every leg to it, at the group’s own pickup/dropoff', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/trips/suggest-placements') return Promise.resolve([EXISTING]);
      return Promise.resolve({});
    });
    renderDialog({ onSaved });

    await user.click(await screen.findByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/trips/trip-1/legs', {
        method: 'POST',
        body: { transportLegId: 'leg-1', pickupPlannedAt: '2026-09-16T08:00:00.000Z', dropoffPlannedAt: '2026-09-16T08:30:00.000Z' },
      }),
    );
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/trips/trip-1/legs', {
        method: 'POST',
        body: { transportLegId: 'leg-2', pickupPlannedAt: '2026-09-16T08:00:00.000Z', dropoffPlannedAt: '2026-09-16T08:30:00.000Z' },
      }),
    );
    expect(mockApiFetch).not.toHaveBeenCalledWith('/trips', expect.anything());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('creates a fresh trip first when the candidate has none yet', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/trips/suggest-placements') return Promise.resolve([FRESH]);
      if (path === '/trips') return Promise.resolve({ id: 'trip-new' });
      return Promise.resolve({});
    });
    renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/trips', { method: 'POST', body: { date: '2026-09-16', vehicleId: 'veh-2' } }),
    );
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/trips/trip-new/legs', {
        method: 'POST',
        body: { transportLegId: 'leg-1', pickupPlannedAt: '2026-09-16T08:00:00.000Z', dropoffPlannedAt: '2026-09-16T08:30:00.000Z' },
      }),
    );
  });

  it('shows the failure message instead of the list when fetching suggestions fails', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Could not get placement suggestions.', 500));
    renderDialog();

    expect(await screen.findByText('Could not get placement suggestions.')).toBeInTheDocument();
  });
});
