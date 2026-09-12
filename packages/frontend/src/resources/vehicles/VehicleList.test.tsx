import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { Vehicle, VehicleType } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { stubMobileMatchMedia } from '../../test/renderMobile';
import { VehicleList } from './VehicleList';

const i18nProvider = polyglotI18nProvider(messages, 'en');

const vehicle = (overrides: Partial<Vehicle> = {}): Vehicle =>
  ({
    id: 'veh-1',
    licensePlate: '55-AA-12',
    numeroCauda: 'AMB-01',
    vehicleType: VehicleType.EMERGENCY,
    insuranceRenewalDate: '2099-01-01',
    nextImtInspectionDate: '2099-01-01',
    manufacturer: 'Mercedes',
    model: 'Sprinter',
    seatedCapacity: 4,
    wheelchairPositions: 0,
    stretcherPositions: 1,
    hasRampOrLift: false,
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as Vehicle;

function renderList(data: Vehicle[]) {
  const getList = vi.fn(() => Promise.resolve({ data, total: data.length })) as never;
  const dataProvider = testDataProvider({ getList });

  render(
    <MemoryRouter>
      <AdminContext dataProvider={dataProvider} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="vehicles">
          <VehicleList />
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );

  return { getList: getList as unknown as ReturnType<typeof vi.fn> };
}

describe('the fleet list', () => {
  it('shows the plate, type and capacity in the desktop table', async () => {
    renderList([vehicle()]);

    expect(await screen.findByText('55-AA-12')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Emergency')).toBeInTheDocument();
    expect(screen.getByText(/4 seats/)).toBeInTheDocument();
  });
});

// ── Mobile layout ──────────────────────────────────────────────────────────

describe('the fleet list on a phone', () => {
  it('shows stacked cards instead of a table', async () => {
    stubMobileMatchMedia();
    renderList([vehicle()]);

    await screen.findByText('55-AA-12');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/Mercedes Sprinter/)).toBeInTheDocument();
    expect(screen.getByText(/4 seats/)).toBeInTheDocument();
  });
});
