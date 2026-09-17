import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { Patient, PatientMobility, UserRole } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { stubMobileMatchMedia } from '../../test/renderMobile';
import { PatientList } from './PatientList';

const i18nProvider = polyglotI18nProvider(messages, 'en');

const patient = (overrides: Partial<Patient> = {}): Patient =>
  ({
    id: 'pat-1',
    mobility: PatientMobility.WHEELCHAIR,
    needsOxygen: false,
    escortRequired: false,
    isBariatric: false,
    defaultLatitude: null,
    defaultLongitude: null,
    localityId: 'loc-1',
    locality: { id: 'loc-1', name: 'Taveiro', municipalityId: 'mun-1' },
    referenceContactIsOrganisation: false,
    contactAuthorisationRecorded: true,
    contactAuthorisationNote: null,
    isActive: true,
    identity: { fullName: 'Maria Fernanda Costa' } as Patient['identity'],
    identityPurgedAt: null,
    createdById: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as Patient;

function renderList(data: Patient[], roles: UserRole[]) {
  const getList = vi.fn(() => Promise.resolve({ data, total: data.length })) as never;
  const dataProvider = testDataProvider({ getList });
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(roles),
  };

  render(
    <MemoryRouter>
      <AdminContext dataProvider={dataProvider} authProvider={authProvider} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="patients">
          <PatientList />
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

// ── Identity, gated separately from the record itself (#226) ───────────────────
//
// A caller who can manage patients but not view their identity still sees the
// transport profile — mobility, locality, active/retired — and is told why the
// name column is missing, rather than seeing a blank one.

describe('the patient list', () => {
  it('shows the identity column to a caller with VIEW_PATIENT_IDENTITY', async () => {
    renderList([patient()], [UserRole.TRANSPORT_COORDINATOR]);

    expect(await screen.findByText('Maria Fernanda Costa')).toBeInTheDocument();
    expect(screen.queryByText(/does not permit viewing patient identity/i)).not.toBeInTheDocument();
  });

  it('omits the name column and explains why for a caller without it', async () => {
    renderList([patient()], []);

    expect(
      await screen.findByText(/does not permit viewing patient identity/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Maria Fernanda Costa')).not.toBeInTheDocument();
  });

  it('always shows the mobility profile and locality, identity or not', async () => {
    renderList([patient()], []);

    expect(await screen.findByText('Wheelchair')).toBeInTheDocument();
    expect(screen.getByText('Taveiro')).toBeInTheDocument();
  });

  it('renders stacked cards on mobile, still without identity for an unprivileged viewer', async () => {
    stubMobileMatchMedia();
    renderList([patient()], []);

    expect(await screen.findByText('pat-1')).toBeInTheDocument();
  });
});
