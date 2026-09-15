import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import { messages } from '../../i18n/i18nProvider';
import { WaitReleaseDialog, WaitReleaseTarget } from './WaitReleaseDialog';
import { apiFetch } from '../../api';

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

const TARGET: WaitReleaseTarget = {
  tripId: 'trip-1',
  dropoffStopId: 'stop-dropoff',
  facilityId: 'fac-1',
  plannedAt: '2026-09-15T09:00:00.000Z',
};

const renderDialog = (target: WaitReleaseTarget | null = TARGET, onSaved = vi.fn()) =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={polyglotI18nProvider(messages, 'en')}>
      <WaitReleaseDialog target={target} onClose={vi.fn()} onSaved={onSaved} />
    </AdminContext>,
  );

describe('WaitReleaseDialog', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('shows the break-even comparison and defaults to waiting for the expected dwell', async () => {
    mockApiFetch.mockResolvedValue({
      expectedDwellMinutes: 45,
      travelToBaseMinutes: 20,
      roundTripToBaseMinutes: 40,
    });
    renderDialog();

    expect(await screen.findByText('45 min')).toBeInTheDocument();
    expect(screen.getByText('40 min')).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith('/trips/trip-1/stops/stop-dropoff/break-even');
  });

  it('records a RELEASE decision with zero dwell minutes when chosen', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') return Promise.resolve({});
      return Promise.resolve({ expectedDwellMinutes: 45, travelToBaseMinutes: 20, roundTripToBaseMinutes: 40 });
    });
    renderDialog(TARGET, onSaved);

    await screen.findByText('45 min');
    await user.click(screen.getByRole('button', { name: 'Release the vehicle' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/trips/trip-1/stops', {
        method: 'POST',
        body: {
          kind: 'WAIT',
          plannedAt: TARGET.plannedAt,
          facilityId: TARGET.facilityId,
          dwellDecision: 'RELEASE',
          dwellMinutes: 0,
        },
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });
});
