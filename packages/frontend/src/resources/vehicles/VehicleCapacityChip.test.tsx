import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, RecordContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { messages } from '../../i18n/i18nProvider';
import { VehicleCapacityChip } from './VehicleCapacityChip';

function renderChip(record: Record<string, unknown>) {
  const i18nProvider = polyglotI18nProvider(messages, 'en');
  return render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <RecordContextProvider value={record}>
        <VehicleCapacityChip />
      </RecordContextProvider>
    </AdminContext>,
  );
}

describe('VehicleCapacityChip (#221)', () => {
  it('shows only seats when the vehicle has no wheelchair, stretcher or ramp', () => {
    renderChip({ seatedCapacity: 4, wheelchairPositions: 0, stretcherPositions: 0, hasRampOrLift: false });
    expect(screen.getByText('4 seats')).toBeInTheDocument();
  });

  it('appends wheelchair, stretcher and ramp badges when present', () => {
    renderChip({
      seatedCapacity: 4,
      wheelchairPositions: 2,
      stretcherPositions: 1,
      hasRampOrLift: true,
    });
    expect(screen.getByText('4 seats · ♿2 · 🛏1 · ramp')).toBeInTheDocument();
  });

  it('defaults an unset seatedCapacity to 0', () => {
    renderChip({});
    expect(screen.getByText('0 seats')).toBeInTheDocument();
  });
});
