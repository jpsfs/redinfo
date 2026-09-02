import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { INEMSessionStatus, INEMStatusOverview, INEMUnit } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { INEMStatusPage } from './INEMStatusPage';
import { apiFetch, ApiError } from '../api';

// Partial mock — the real `ApiError` comes through (needed for the
// `instanceof ApiError` check in the component's own catch blocks), only
// `apiFetch` is replaced.
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  apiFetch: vi.fn(),
}));

vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-admin')>()),
  Title: () => null,
}));

const mockApiFetch = apiFetch as unknown as Mock;

const i18nProvider = polyglotI18nProvider(messages, 'en');
const renderPage = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <INEMStatusPage />
    </AdminContext>,
  );

const unit = (overrides: Partial<INEMUnit> = {}): INEMUnit => ({
  unitId: 'CVCAMPO1',
  station: 'CVCAMPO',
  carId: '12-AB-34',
  unitType: 'AMBULANCE',
  desiredInopCode: 'CVCAMPO_AVAILABLE' as never, // overwritten below per test
  reportedInopCode: null,
  reportedActive: null,
  lastSyncedAt: null,
  lastError: null,
  vehicle: { id: 'veh-1', licensePlate: '12-AB-34', numeroCauda: 'CV1' },
  ...overrides,
});

const overview = (units: INEMUnit[], overrides: Partial<INEMStatusOverview> = {}): INEMStatusOverview => ({
  sessionStatus: INEMSessionStatus.ACTIVE,
  sessionLastError: null,
  inopReasons: { TEPH_Falta: 'Sem Tripulação', Nova_Razao: 'Nova Razão' },
  units,
  ...overrides,
});

describe('INEMStatusPage', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('shows the vehicle a crew recognises, not the bare INEM unit id', async () => {
    mockApiFetch.mockResolvedValue(overview([unit({ desiredInopCode: '00' })]));
    renderPage();

    expect(await screen.findByText('12-AB-34 – CV1')).toBeInTheDocument();
  });

  it('falls back to the INEM unit id when no vehicle matched', async () => {
    mockApiFetch.mockResolvedValue(overview([unit({ desiredInopCode: '00', vehicle: null })]));
    renderPage();

    expect(await screen.findByText('12-AB-34')).toBeInTheDocument();
    expect(screen.getByText(/No matching vehicle/)).toBeInTheDocument();
  });

  it('toggling the switch on marks the unit available', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(overview([unit({ desiredInopCode: 'TEPH_Falta', reportedInopCode: 'TEPH_Falta' })]));
    renderPage();

    const toggle = await screen.findByRole('checkbox', { name: 'Available' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/inem/units/CVCAMPO1', {
        method: 'PUT',
        body: { inopCode: '00' },
      }),
    );
  });

  it('reveals the reason dropdown only once the unit is not available, and sends the chosen code', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(overview([unit({ desiredInopCode: '00', reportedInopCode: '00' })]));
    renderPage();

    const toggle = await screen.findByRole('checkbox', { name: 'Available' });
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(await screen.findByLabelText('Reason')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Reason'));
    await user.click(await screen.findByRole('option', { name: 'No crew' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/inem/units/CVCAMPO1', {
        method: 'PUT',
        body: { inopCode: 'TEPH_Falta' },
      }),
    );
  });

  it('translates a known INOP reason from its label, and shows an unknown one verbatim from the API', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(overview([unit({ desiredInopCode: 'Nova_Razao', reportedInopCode: 'Nova_Razao' })]));
    renderPage();

    await user.click(await screen.findByLabelText('Reason'));
    expect(await screen.findByRole('option', { name: 'No crew' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Nova Razão' })).toBeInTheDocument();
  });

  it('shows a syncing badge when the desired state has not yet reached INEM', async () => {
    mockApiFetch.mockResolvedValue(
      overview([unit({ desiredInopCode: '00', reportedInopCode: 'TEPH_Falta' })]),
    );
    renderPage();

    expect(await screen.findByText('Syncing…')).toBeInTheDocument();
  });

  it('shows no syncing badge once desired and reported agree', async () => {
    mockApiFetch.mockResolvedValue(overview([unit({ desiredInopCode: '00', reportedInopCode: '00' })]));
    renderPage();

    await screen.findByText('12-AB-34 – CV1');
    expect(screen.queryByText('Syncing…')).not.toBeInTheDocument();
  });

  it('shows the degraded banner and names the INEM-portal fallback when the session has failed', async () => {
    mockApiFetch.mockResolvedValue(
      overview([unit({ desiredInopCode: '00', reportedInopCode: '00' })], {
        sessionStatus: INEMSessionStatus.FAILED,
      }),
    );
    renderPage();

    expect(await screen.findByText(/cannot currently reach the INEM portal/)).toBeInTheDocument();
  });

  it('shows no degraded banner when the session is active', async () => {
    mockApiFetch.mockResolvedValue(overview([unit({ desiredInopCode: '00', reportedInopCode: '00' })]));
    renderPage();

    await screen.findByText('12-AB-34 – CV1');
    expect(screen.queryByText(/INEM portal/)).not.toBeInTheDocument();
  });

  it('reverts the optimistic toggle and surfaces the session-down error on a conflict', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(
      overview([unit({ desiredInopCode: 'TEPH_Falta', reportedInopCode: 'TEPH_Falta' })]),
    );
    renderPage();

    const toggle = await screen.findByRole('checkbox', { name: 'Available' });
    mockApiFetch.mockRejectedValueOnce(
      new ApiError('unavailable', 409, 'INEM_SESSION_NOT_ACTIVE'),
    );
    mockApiFetch.mockResolvedValueOnce(
      overview([unit({ desiredInopCode: 'TEPH_Falta', reportedInopCode: 'TEPH_Falta' })]),
    );
    await user.click(toggle);

    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it('shows the calm empty state when the delegation has no INEM units', async () => {
    mockApiFetch.mockResolvedValue(overview([]));
    renderPage();

    expect(await screen.findByText('No INEM units configured.')).toBeInTheDocument();
  });
});
