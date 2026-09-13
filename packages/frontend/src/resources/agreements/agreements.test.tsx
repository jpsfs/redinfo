import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { Agreement } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { stubMobileMatchMedia } from '../../test/renderMobile';
import { AgreementList } from './index';

const i18nProvider = polyglotI18nProvider(messages, 'en');

const PAYER = { id: 'org-payer', name: 'Allianz' };

const agreement = (overrides: Partial<Agreement> = {}): Agreement =>
  ({
    id: 'agr-1',
    payerOrganisationId: PAYER.id,
    payerOrganisation: PAYER as never,
    name: 'SNS — Serviço Nacional de Saúde',
    externalReference: null,
    validFrom: '2026-01-01',
    validTo: null,
    notes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as Agreement;

function renderList(data: Agreement[]) {
  const dataProvider = testDataProvider({
    getList: vi.fn(() => Promise.resolve({ data, total: data.length })) as never,
    getMany: vi.fn((_resource, params: { ids: string[] }) =>
      Promise.resolve({ data: params.ids.map(() => PAYER) }),
    ) as never,
  });

  render(
    <MemoryRouter>
      <AdminContext dataProvider={dataProvider} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="agreements">
          <AgreementList />
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

// ── The agreement list a coordinator keeps ──────────────────────────────────
//
// The terms a transport falls under (#227), scoped to its paying
// organisation. No tariff or rate fields — modelled on `/organisations`.

describe('the agreement list', () => {
  it('explains that billing itself stays outside redinfo', async () => {
    renderList([agreement()]);

    expect(await screen.findByText(/billing stays outside redinfo/i)).toBeInTheDocument();
  });

  it('shows the agreement with its paying organisation', async () => {
    renderList([agreement()]);

    expect(await screen.findByText('SNS — Serviço Nacional de Saúde')).toBeInTheDocument();
    expect(await screen.findByText('Allianz')).toBeInTheDocument();
  });

  it('shows an open-ended validity as a dash', async () => {
    renderList([agreement({ validTo: null })]);

    expect(await screen.findByText('—')).toBeInTheDocument();
  });

  it('marks a retired agreement rather than hiding it', async () => {
    renderList([
      agreement({ id: 'a', name: 'Active one' }),
      agreement({ id: 'b', name: 'Retired one', isActive: false }),
    ]);

    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Retired')).toBeInTheDocument();
  });

  it('offers a way to add one', async () => {
    renderList([agreement()]);
    expect(await screen.findByText(/add agreement/i)).toBeInTheDocument();
  });
});

describe('the agreement list on a phone', () => {
  it('shows stacked cards instead of a table', async () => {
    stubMobileMatchMedia();
    renderList([agreement()]);

    await screen.findByText('SNS — Serviço Nacional de Saúde');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Allianz')).toBeInTheDocument();
  });
});
