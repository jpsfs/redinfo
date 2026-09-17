import { describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, RecordContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { StockMovementReason, VehicleType } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { apiFetch } from '../../api';
import { VehicleInventorySection } from './VehicleInventorySection';

vi.mock('../../api', () => ({ apiFetch: vi.fn() }));

const mockApiFetch = apiFetch as unknown as Mock;

const templateItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'tpl-item-1',
  name: 'Luvas',
  type: 'COUNTABLE',
  recommendedQuantity: 10,
  unit: 'pcs',
  notes: null,
  order: 0,
  ...overrides,
});

function respondByPath({
  vehicleInventoryItem,
  movements = [],
  movementsTotal = 0,
}: {
  vehicleInventoryItem?: Record<string, unknown> | null;
  movements?: Record<string, unknown>[];
  movementsTotal?: number;
} = {}) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/vehicle-inventory/by-vehicle/veh-1/movements')) {
      return Promise.resolve({ data: movements, total: movementsTotal, page: 1, perPage: 10 });
    }
    if (path === '/vehicle-inventory/by-vehicle/veh-1') {
      return Promise.resolve({
        vehicleId: 'veh-1',
        vehicleType: VehicleType.EMERGENCY,
        template: { id: 'tpl-1', version: 3 },
        rows: [
          {
            templateItem: templateItem(),
            vehicleInventoryItem: vehicleInventoryItem ?? null,
            status: 'ok',
          },
        ],
        hasLowStock: false,
      });
    }
    return Promise.reject(new Error(`unexpected path: ${path}`));
  });
}

function renderSection() {
  const i18nProvider = polyglotI18nProvider(messages, 'en');
  return render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <RecordContextProvider value={{ id: 'veh-1', vehicleType: VehicleType.EMERGENCY }}>
        <VehicleInventorySection />
      </RecordContextProvider>
    </AdminContext>,
  );
}

describe('the vehicle inventory section', () => {
  it('renders a recount badge on a row a consumption deduction floored at zero', async () => {
    respondByPath({
      vehicleInventoryItem: {
        id: 'vii-1',
        vehicleId: 'veh-1',
        templateItemId: 'tpl-item-1',
        actualQuantity: 0,
        templateVersion: 3,
        needsRecount: true,
      },
    });

    renderSection();

    expect(await screen.findByText('Recount needed')).toBeInTheDocument();
  });

  it('does not show the recount badge for a row that was never flagged', async () => {
    respondByPath({
      vehicleInventoryItem: {
        id: 'vii-1',
        vehicleId: 'veh-1',
        templateItemId: 'tpl-item-1',
        actualQuantity: 10,
        templateVersion: 3,
        needsRecount: false,
      },
    });

    renderSection();

    expect(await screen.findByText('Luvas')).toBeInTheDocument();
    expect(screen.queryByText('Recount needed')).not.toBeInTheDocument();
  });

  it('lists movement entries with date, item, delta, reason and actor', async () => {
    respondByPath({
      movements: [
        {
          id: 'mv-1',
          materialItemId: 'mat-1',
          materialItem: { namePt: 'Luvas', nameEn: 'Gloves' },
          delta: -5,
          reason: StockMovementReason.CONSUMPTION,
          reportId: 'report-1',
          actor: { id: 'user-1', firstName: 'Ana', lastName: 'Silva' },
          occurredAt: '2026-08-20T10:00:00.000Z',
        },
      ],
      movementsTotal: 1,
    });

    renderSection();

    expect(await screen.findByText('Gloves')).toBeInTheDocument();
    expect(screen.getByText('-5')).toBeInTheDocument();
    expect(screen.getByText('Consumption')).toBeInTheDocument();
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
  });

  it('links a movement to its event report when reportId is set', async () => {
    respondByPath({
      movements: [
        {
          id: 'mv-1',
          materialItemId: 'mat-1',
          materialItem: { namePt: 'Luvas', nameEn: 'Gloves' },
          delta: -5,
          reason: StockMovementReason.CONSUMPTION,
          reportId: 'report-1',
          actor: null,
          occurredAt: '2026-08-20T10:00:00.000Z',
        },
      ],
      movementsTotal: 1,
    });

    renderSection();

    const link = (await screen.findByText('View report')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/#/event-reports/report-1');
  });

  it('shows no link for a manual adjustment with no report', async () => {
    respondByPath({
      movements: [
        {
          id: 'mv-2',
          materialItemId: 'mat-1',
          materialItem: { namePt: 'Luvas', nameEn: 'Gloves' },
          delta: 20,
          reason: StockMovementReason.MANUAL_ADJUSTMENT,
          reportId: null,
          actor: { id: 'user-1', firstName: 'Ana', lastName: 'Silva' },
          occurredAt: '2026-08-20T10:00:00.000Z',
        },
      ],
      movementsTotal: 1,
    });

    renderSection();

    await waitFor(() => expect(screen.getByText('Manual adjustment')).toBeInTheDocument());
    expect(screen.queryByText('View report')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no movements yet', async () => {
    respondByPath({ movements: [], movementsTotal: 0 });

    renderSection();

    expect(await screen.findByText('No movements recorded yet.')).toBeInTheDocument();
  });
});
