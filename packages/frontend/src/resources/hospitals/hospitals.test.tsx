import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { Hospital } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { HospitalList } from './index';

// This is a desk/configuration screen, exercised here in English — the
// assertions below are unchanged from before #180's conversion; a real
// i18nProvider is required now that labels resolve through useT() rather
// than being typed inline.
const i18nProvider = polyglotI18nProvider(messages, 'en');

const COIMBRA = {
  id: 'mun-coimbra',
  ineCode: '0603',
  name: 'Coimbra',
  district: 'Coimbra',
  latitude: 40.2111,
  longitude: -8.4289,
};

const hospital = (overrides: Partial<Hospital> = {}): Hospital =>
  ({
    id: 'hosp-1',
    name: 'CHUC — Hospital Geral',
    municipalityId: COIMBRA.id,
    municipality: COIMBRA,
    latitude: null,
    longitude: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as Hospital;

function renderList(data: Hospital[]) {
  const dataProvider = testDataProvider({
    getList: vi.fn(() => Promise.resolve({ data, total: data.length })) as never,
  });

  render(
    <MemoryRouter>
      <AdminContext dataProvider={dataProvider} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="hospitals">
          <HospitalList />
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

// ── The hospital list a coordinator keeps ──────────────────────────────────────
//
// Configuration, not a report: English like the other desk screens, and modelled
// on the Holidays list — an explanatory banner, a flat grid, and no surprises.

describe('the hospital list', () => {
  it('explains what the list is for before showing it', async () => {
    renderList([hospital()]);

    expect(
      await screen.findByText(/fills the "taken to" field on a report/i),
    ).toBeInTheDocument();
  });

  it('shows the hospital with its municipality and district', async () => {
    renderList([hospital()]);

    expect(await screen.findByText('CHUC — Hospital Geral')).toBeInTheDocument();
    // Both columns read from the municipality relation, so one row proves both.
    expect(screen.getAllByText('Coimbra')).toHaveLength(2);
  });

  it('says the municipality centre is standing in when there are no coordinates', async () => {
    renderList([hospital()]);

    // Not an error state: the fallback is what makes distance ordering work on
    // day one, so it is stated plainly rather than flagged.
    expect(await screen.findByText('municipality centre')).toBeInTheDocument();
  });

  it('shows real coordinates once someone has filled them in', async () => {
    renderList([hospital({ latitude: 40.1976, longitude: -8.4392 })]);

    expect(await screen.findByText('40.1976, -8.4392')).toBeInTheDocument();
  });

  it('marks a retired hospital rather than hiding it from the coordinator', async () => {
    renderList([
      hospital({ id: 'a', name: 'Active one' }),
      hospital({ id: 'b', name: 'Retired one', isActive: false }),
    ]);

    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Retired')).toBeInTheDocument();
  });

  it('offers a way to add one', async () => {
    renderList([hospital()]);
    expect(await screen.findByText(/add hospital/i)).toBeInTheDocument();
  });
});
