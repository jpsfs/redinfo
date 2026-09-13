import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import {
  TransportRequest,
  TransportRequestDecision,
  TransportRequestOccurrenceType,
  TransportRequestVehicleType,
} from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { stubMobileMatchMedia } from '../../test/renderMobile';
import { TransportRequestList } from './index';

// This is a desk/configuration screen, exercised here in English — same
// convention as `/organisations`.
const i18nProvider = polyglotI18nProvider(messages, 'en');

// ── Referral intake (#228) ──────────────────────────────────────────────────
//
// The list is the ageing query the decision page (#229) will build on:
// ordered soonest-due first, with the API's own computed
// `minutesUntilResponseDue` — never recomputed client-side, so the list and
// its tests always agree with what the server actually said "now" was.

const transportRequest = (overrides: Partial<TransportRequest> = {}): TransportRequest =>
  ({
    id: 'tr-1',
    batchReference: 'Email 12345',
    communicatedAt: '2026-09-10T17:00:00.000Z',
    requesterAccountCode: 'AZP',
    responseDueAt: '2026-09-11T05:00:00.000Z',
    externalServiceNumber: 'SVC-001',
    appointmentAt: '2026-09-12T09:00:00.000Z',
    requestingOrganisationId: 'org-requester',
    requestingOrganisation: {
      id: 'org-requester',
      name: 'AXA Assistance',
      isRequester: true,
      isPayer: false,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as never,
    payingOrganisationId: 'org-payer',
    patientId: 'pat-1',
    occurrenceType: TransportRequestOccurrenceType.CONSULTA,
    requestedVehicleType: TransportRequestVehicleType.TRANSPORTE,
    escortTravels: false,
    isRoundTrip: true,
    originAddress: 'Rua das Flores, 10',
    destinationFacilityId: 'fac-1',
    destinationFacility: { id: 'fac-1', name: 'CHUC — Hospital Geral' } as never,
    decision: TransportRequestDecision.PENDING,
    minutesUntilResponseDue: 45,
    createdById: 'user-1',
    createdAt: '2026-09-10T17:05:00.000Z',
    updatedAt: '2026-09-10T17:05:00.000Z',
    ...overrides,
  }) as TransportRequest;

function renderList(data: TransportRequest[]) {
  const dataProvider = testDataProvider({
    getList: vi.fn(() => Promise.resolve({ data, total: data.length })) as never,
  });

  render(
    <MemoryRouter>
      <AdminContext dataProvider={dataProvider} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="transport-requests">
          <TransportRequestList />
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

describe('the transport request list', () => {
  it('explains that the requester and payer can be different organisations', async () => {
    renderList([transportRequest()]);

    expect(
      await screen.findByText(/requester and the payer can be different organisations/i),
    ).toBeInTheDocument();
  });

  it('shows the requester’s own reference and occurrence type', async () => {
    renderList([transportRequest()]);

    expect(await screen.findByText('SVC-001')).toBeInTheDocument();
    expect(screen.getByText('Consultation')).toBeInTheDocument();
  });

  it('shows time remaining, computed server-side', async () => {
    renderList([transportRequest({ minutesUntilResponseDue: 45 })]);

    expect(await screen.findByText('45 min left')).toBeInTheDocument();
  });

  it('flags an overdue referral distinctly from one with time left', async () => {
    renderList([transportRequest({ minutesUntilResponseDue: -30 })]);

    expect(await screen.findByText('Overdue by 30 min')).toBeInTheDocument();
  });

  it('shows the decision', async () => {
    renderList([transportRequest({ decision: TransportRequestDecision.ACCEPTED })]);

    expect(await screen.findByText('Accepted')).toBeInTheDocument();
  });

  it('offers a way to add one', async () => {
    renderList([transportRequest()]);
    expect(await screen.findByText(/add referral/i)).toBeInTheDocument();
  });
});

describe('the transport request list on a phone', () => {
  it('shows stacked cards instead of a table', async () => {
    stubMobileMatchMedia();
    renderList([transportRequest()]);

    await screen.findByText('SVC-001');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/AXA Assistance/)).toBeInTheDocument();
  });
});
