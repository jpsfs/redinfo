import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import { VehicleType } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { AddVehicleLaneDialog } from './AddVehicleLaneDialog';
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

const VEHICLE = {
  id: 'veh-2',
  licensePlate: 'CC-33-DD',
  numeroCauda: '202',
  vehicleType: VehicleType.TRANSPORT,
  insuranceRenewalDate: '2027-01-01',
  nextImtInspectionDate: '2027-01-01',
  seatedCapacity: 4,
  wheelchairPositions: 0,
  stretcherPositions: 0,
  hasRampOrLift: false,
  isDeleted: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const dataProvider = testDataProvider({
  getList: (() => Promise.resolve({ data: [VEHICLE], total: 1 })) as never,
});

const renderDialog = (props: Partial<React.ComponentProps<typeof AddVehicleLaneDialog>> = {}) =>
  render(
    <AdminContext dataProvider={dataProvider} i18nProvider={polyglotI18nProvider(messages, 'en')}>
      <AddVehicleLaneDialog
        open
        date="2026-09-15"
        excludeVehicleIds={[]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        {...props}
      />
    </AdminContext>,
  );

describe('AddVehicleLaneDialog', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('creates a trip for the chosen vehicle on the given date', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    mockApiFetch.mockResolvedValue({ id: 'trip-new', date: '2026-09-15', vehicleId: 'veh-2' });
    renderDialog({ onCreated });

    await user.click(await screen.findByLabelText('Vehicle'));
    await user.click(await screen.findByRole('option', { name: /202/ }));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/trips', {
        method: 'POST',
        body: { date: '2026-09-15', vehicleId: 'veh-2' },
      }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('shows the failure message instead of closing when the API rejects', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    mockApiFetch.mockRejectedValue(new ApiError('Vehicle already has a trip that day', 409));
    renderDialog({ onCreated });

    await user.click(await screen.findByLabelText('Vehicle'));
    await user.click(await screen.findByRole('option', { name: /202/ }));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Vehicle already has a trip that day')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
