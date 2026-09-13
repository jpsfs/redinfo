import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { Organisation } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { stubMobileMatchMedia } from '../../test/renderMobile';
import { OrganisationList } from './index';

// This is a desk/configuration screen, exercised here in English — same
// convention as `/facilities`.
const i18nProvider = polyglotI18nProvider(messages, 'en');

const organisation = (overrides: Partial<Organisation> = {}): Organisation =>
  ({
    id: 'org-1',
    name: 'AXA Assistance',
    taxId: null,
    contactEmail: null,
    contactPhone: null,
    isRequester: true,
    isPayer: false,
    notes: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    references: [],
    ...overrides,
  }) as Organisation;

function renderList(data: Organisation[]) {
  const dataProvider = testDataProvider({
    getList: vi.fn(() => Promise.resolve({ data, total: data.length })) as never,
  });

  render(
    <MemoryRouter>
      <AdminContext dataProvider={dataProvider} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="organisations">
          <OrganisationList />
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

// ── The organisation list a coordinator keeps ───────────────────────────────
//
// Requester and payer as roles on one model (#227) — a row can carry both,
// and a transport request can still name different organisations in each
// slot. Modelled on `/facilities`: an explanatory banner, a flat grid, and
// stacked cards on a phone.

describe('the organisation list', () => {
  it('explains that requester and payer are roles, not separate tables', async () => {
    renderList([organisation()]);

    expect(await screen.findByText(/request transports, pay for them, or both/i)).toBeInTheDocument();
  });

  it('shows the organisation with its contact email', async () => {
    renderList([organisation({ contactEmail: 'contas@axa-assistance.pt' })]);

    expect(await screen.findByText('AXA Assistance')).toBeInTheDocument();
    expect(screen.getByText('contas@axa-assistance.pt')).toBeInTheDocument();
  });

  it('shows requester and payer flags independently', async () => {
    renderList([
      organisation({ id: 'a', name: 'Both roles', isRequester: true, isPayer: true }),
      organisation({ id: 'b', name: 'Neither role', isRequester: false, isPayer: false }),
    ]);

    expect(await screen.findAllByText('Requester')).toHaveLength(3);
    expect(screen.getAllByText('Payer')).toHaveLength(3);
  });

  it('marks a retired organisation rather than hiding it', async () => {
    renderList([
      organisation({ id: 'a', name: 'Active one' }),
      organisation({ id: 'b', name: 'Retired one', isActive: false }),
    ]);

    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Retired')).toBeInTheDocument();
  });

  it('offers a way to add one', async () => {
    renderList([organisation()]);
    expect(await screen.findByText(/add organisation/i)).toBeInTheDocument();
  });
});

describe('the organisation list on a phone', () => {
  it('shows stacked cards instead of a table', async () => {
    stubMobileMatchMedia();
    renderList([organisation()]);

    await screen.findByText('AXA Assistance');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Requester')).toBeInTheDocument();
  });
});
