import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import { TransportRequestOccurrenceType } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { TransportConfigPage } from './TransportConfigPage';
import { apiFetch } from '../api';

vi.mock('../api', () => ({ apiFetch: vi.fn() }));

vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-admin')>()),
  Title: () => null,
}));

const mockApiFetch = apiFetch as unknown as Mock;

const thresholds = { arrivalWindowEarliestMinutes: 30, arrivalWindowLatestMinutes: 5, arrivalToleranceMinutes: 10 };
const handling = { pickupHandlingMinutes: 3, dropoffHandlingMinutes: 1 };
const policies = [
  {
    occurrenceType: TransportRequestOccurrenceType.CONSULTA,
    minimumDurationMinutes: 30,
    defaultDurationMinutes: 30,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    occurrenceType: TransportRequestOccurrenceType.TRATAMENTO,
    minimumDurationMinutes: 30,
    defaultDurationMinutes: 60,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const i18nProvider = polyglotI18nProvider(messages, 'en');
const renderPage = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <TransportConfigPage />
    </AdminContext>,
  );

/** The three GETs every test needs answered before it can touch the form
 * beneath any of them — `patch` is the one-off response a PATCH/PUT call
 * itself resolves to, distinct from the GETs' own fixtures. */
function mockConfigEndpoints(patch?: unknown) {
  mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    if (options?.method && patch !== undefined) return Promise.resolve(patch);
    if (path.endsWith('arrival-window-thresholds')) return Promise.resolve(thresholds);
    if (path.endsWith('patient-handling-thresholds')) return Promise.resolve(handling);
    return Promise.resolve(policies);
  });
}

describe('TransportConfigPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('loads and displays the thresholds, handling minutes and the occurrence-type table', async () => {
    mockConfigEndpoints();
    renderPage();

    expect(await screen.findByLabelText('Do not arrive more than X minutes early')).toHaveValue(30);
    expect(await screen.findByLabelText('Pickup (min)')).toHaveValue(3);
    expect(screen.getByLabelText('Drop-off (min)')).toHaveValue(1);
    expect(screen.getByText('Consultation')).toBeInTheDocument();
    expect(screen.getByText('Treatment')).toBeInTheDocument();
  });

  it('saves the thresholds as a full replace on Save', async () => {
    const user = userEvent.setup();
    mockConfigEndpoints();
    renderPage();

    const earliest = await screen.findByLabelText('Do not arrive more than X minutes early');
    await user.clear(earliest);
    await user.type(earliest, '45');

    const saveButtons = await screen.findAllByRole('button', { name: 'Save' });
    await user.click(saveButtons[0]);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/transport-config/arrival-window-thresholds', {
        method: 'PUT',
        body: { ...thresholds, arrivalWindowEarliestMinutes: 45 },
      }),
    );
  });

  it('rejects an earliest threshold lower than the latest one before saving', async () => {
    const user = userEvent.setup();
    mockConfigEndpoints();
    renderPage();

    const earliest = await screen.findByLabelText('Do not arrive more than X minutes early');
    await user.clear(earliest);
    await user.type(earliest, '1');

    expect(await screen.findByText(/cannot be lower than/i)).toBeInTheDocument();
    const saveButtons = screen.getAllByRole('button', { name: 'Save' });
    expect(saveButtons[0]).toBeDisabled();
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      '/transport-config/arrival-window-thresholds',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('saves the patient handling minutes as a full replace on Save', async () => {
    const user = userEvent.setup();
    mockConfigEndpoints();
    renderPage();

    const pickup = await screen.findByLabelText('Pickup (min)');
    await user.clear(pickup);
    await user.type(pickup, '5');

    const saveButtons = await screen.findAllByRole('button', { name: 'Save' });
    // Thresholds' own save button is first; handling's is the second card.
    await user.click(saveButtons[1]);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/transport-config/patient-handling-thresholds', {
        method: 'PUT',
        body: { ...handling, pickupHandlingMinutes: 5 },
      }),
    );
  });

  it('patches a single occurrence type without touching the others', async () => {
    const user = userEvent.setup();
    mockConfigEndpoints({ ...policies[0], defaultDurationMinutes: 40 });
    renderPage();

    const defaultInputs = await screen.findAllByDisplayValue('30');
    // Two "30" values render for CONSULTA (minimum and default); the row's
    // default-duration input is the second cell in that row.
    const consultaRow = (await screen.findByText('Consultation')).closest('tr');
    expect(consultaRow).not.toBeNull();
    const inputsInRow = consultaRow!.querySelectorAll('input');
    await user.clear(inputsInRow[1]);
    await user.type(inputsInRow[1], '40');

    const rowSaveButton = consultaRow!.querySelector('button');
    expect(rowSaveButton).not.toBeNull();
    await user.click(rowSaveButton!);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/transport-config/occurrence-type-policies/${TransportRequestOccurrenceType.CONSULTA}`,
        { method: 'PATCH', body: { minimumDurationMinutes: 30, defaultDurationMinutes: 40 } },
      ),
    );
    expect(defaultInputs.length).toBeGreaterThan(0);
  });
});
