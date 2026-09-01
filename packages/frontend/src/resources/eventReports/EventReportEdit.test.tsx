import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EventLocationType, EventReport, EventReportType, Gender, UserRole } from '@redinfo/shared';
import { EventReportEdit } from './EventReportEdit';
import { apiFetch } from '../../api';
import { messages } from '../../i18n/i18nProvider';

vi.mock('../../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn(), apiUpload: vi.fn() }));

// The wizard itself is exercised by `EventReportEditor.test.tsx` — stubbed
// out here so this file can stay focused on the access guard `LoadedEditor`
// adds in front of it.
vi.mock('./EventReportEditor', () => ({
  EventReportEditor: () => <div>EDITOR STUB</div>,
}));

const i18nProvider = polyglotI18nProvider(messages, 'pt');
const mockApiFetch = apiFetch as unknown as Mock;

const report = (overrides: Partial<EventReport> = {}): EventReport =>
  ({
    id: 'rep-1',
    type: EventReportType.EMERGENCY,
    number: 128,
    year: 2026,
    occurredOn: '2026-08-22',
    startedAt: new Date(2026, 7, 22, 20, 14).toISOString(),
    endedAt: new Date(2026, 7, 22, 22, 5).toISOString(),
    externalReference: '2608 4471',
    locationType: EventLocationType.HOME,
    localityId: 'loc-taveiro',
    operationalReport: '',
    crew: [
      {
        id: 'c1',
        userId: 'u-tiago',
        user: { id: 'u-tiago', firstName: 'Tiago', lastName: 'Lourenço' },
        roleName: 'Driver',
        position: 0,
      },
    ],
    vehicles: [],
    materials: [],
    victims: [
      { id: 'vic1', position: 0, gender: Gender.FEMALE, age: 67 } as EventReport['victims'][number],
    ],
    inemSupportUnits: [],
    attachments: [],
    createdById: 'u-tiago',
    createdBy: { id: 'u-tiago', firstName: 'Tiago', lastName: 'Lourenço' },
    createdAt: new Date(2026, 7, 22, 22, 11).toISOString(),
    updatedAt: new Date(2026, 7, 22, 22, 11).toISOString(),
    ...overrides,
  }) as EventReport;

function renderEdit(loaded: EventReport, viewer: { id: string; roles: UserRole[] }) {
  mockApiFetch.mockResolvedValue(loaded);
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(viewer.roles),
    getIdentity: () => Promise.resolve({ id: viewer.id }),
  };
  render(
    <MemoryRouter initialEntries={[`/event-reports/${loaded.id}`]}>
      <AdminContext dataProvider={testDataProvider()} authProvider={authProvider} i18nProvider={i18nProvider}>
        <Routes>
          <Route path="/event-reports/:id" element={<EventReportEdit />} />
        </Routes>
      </AdminContext>
    </MemoryRouter>,
  );
}

beforeEach(() => mockApiFetch.mockReset());

// The archive is readable by everyone now, so a direct link to this route
// must not open the editor for someone off the crew — see the backend's
// `assertCanWrite` and `isEventReportInvolved`.
describe('the edit access guard', () => {
  it('opens the editor for a crew member', async () => {
    renderEdit(report(), { id: 'u-tiago', roles: [UserRole.EMERGENCY_OPERATIONAL] });
    expect(await screen.findByText('EDITOR STUB')).toBeInTheDocument();
  });

  it('opens the editor for a coordinator regardless of the crew', async () => {
    renderEdit(report(), { id: 'u-someone-else', roles: [UserRole.EMERGENCY_COORDINATOR] });
    expect(await screen.findByText('EDITOR STUB')).toBeInTheDocument();
  });

  it('refuses an operational who was not on this activity', async () => {
    renderEdit(report(), { id: 'u-someone-else', roles: [UserRole.EMERGENCY_OPERATIONAL] });
    expect(
      await screen.findByText(/só a equipa desta atividade/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('EDITOR STUB')).not.toBeInTheDocument();
  });
});
