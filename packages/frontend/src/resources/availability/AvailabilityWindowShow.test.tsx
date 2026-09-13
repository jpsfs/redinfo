import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AvailabilityWindow, AvailabilityWindowStatus, CompensationOfferKind, UserRole } from '@redinfo/shared';
import { AvailabilityWindowShow } from './AvailabilityWindowShow';
import { apiFetch } from '../../api';
import { messages } from '../../i18n/i18nProvider';
import { CLOSED_WINDOW, matrixResponse, OPEN_WINDOW } from '../../test/fixtures';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  apiFetch: vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;
const i18nProvider = polyglotI18nProvider(messages, 'en');

const COORDINATOR = [UserRole.EMERGENCY_COORDINATOR];
const MEMBER = [UserRole.EMERGENCY_OPERATIONAL];

function renderShow(record: AvailabilityWindow, roles: UserRole[] = COORDINATOR) {
  const dataProvider = testDataProvider({
    getOne: vi.fn(() => Promise.resolve({ data: record })) as never,
  });
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(roles),
  };

  render(
    <MemoryRouter initialEntries={[`/availability-windows/${record.id}/show`]}>
      <AdminContext dataProvider={dataProvider} authProvider={authProvider} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="availability-windows">
          <Routes>
            <Route path="/availability-windows/:id/show" element={<AvailabilityWindowShow />} />
          </Routes>
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

/** Every non-schedule/non-close network call this screen can make, stubbed. */
function stubNetwork(overrides: (path: string) => unknown = () => undefined) {
  mockApiFetch.mockImplementation((path: string) => {
    const custom = overrides(path);
    if (custom !== undefined) return Promise.resolve(custom);
    if (path.includes('/schedules?')) return Promise.resolve({ data: [] });
    if (path.includes('/availability/matrix')) return Promise.resolve(matrixResponse());
    return Promise.resolve({});
  });
}

describe('AvailabilityWindowShow', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  // The requirement-regression test: volunteering is the norm, so a window
  // with no offer must show no money vocabulary anywhere at all — not to a
  // coordinator, and not to a plain member.
  it('renders no money text anywhere on a window with no offer (coordinator)', async () => {
    stubNetwork();
    renderShow(OPEN_WINDOW, COORDINATOR);

    await waitFor(() => expect(screen.getByText('Emergency - October')).toBeInTheDocument());

    // The coordinator still gets an affordance to *set* an offer ("Set pay
    // offer") — that is an action, not a money value, so it is checked for
    // on its own rather than folded into the "no money text" assertions,
    // which must not incidentally match that button's own label.
    expect(screen.getByRole('button', { name: 'Set pay offer' })).toBeInTheDocument();

    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(screen.queryByText(/unpaid/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/volunteer/i)).not.toBeInTheDocument();
  });

  it('renders no money text anywhere on a window with no offer (plain member)', async () => {
    stubNetwork();
    renderShow(OPEN_WINDOW, MEMBER);

    await waitFor(() => expect(screen.getByText('Emergency - October')).toBeInTheDocument());

    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pay offer/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pay offer/i })).not.toBeInTheDocument();
  });

  it('shows the discreet offer line once one resolves', async () => {
    stubNetwork();
    const withOffer: AvailabilityWindow = {
      ...OPEN_WINDOW,
      compensationKind: CompensationOfferKind.HOURLY,
      compensationRateCents: 500,
    };
    renderShow(withOffer, COORDINATOR);

    expect(await screen.findByText('€5.00 / hour')).toBeInTheDocument();
  });

  it('offers no edit affordance to a plain member even when an offer exists', async () => {
    stubNetwork();
    const withOffer: AvailabilityWindow = {
      ...OPEN_WINDOW,
      compensationKind: CompensationOfferKind.HOURLY,
      compensationRateCents: 500,
    };
    renderShow(withOffer, MEMBER);

    expect(await screen.findByText('€5.00 / hour')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pay offer/i })).not.toBeInTheDocument();
  });

  it('offers no edit affordance once the window is closed, even to a coordinator', async () => {
    stubNetwork();
    const closedWithOffer: AvailabilityWindow = {
      ...CLOSED_WINDOW,
      compensationKind: CompensationOfferKind.FIXED,
      compensationAmountCents: 2500,
    };
    renderShow(closedWithOffer, COORDINATOR);

    expect(await screen.findByText('€25.00, per person, per shift')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pay offer/i })).not.toBeInTheDocument();
  });

  it('opens the edit dialog and saves the offer for a coordinator on an open window', async () => {
    mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (options?.method === 'PATCH') return Promise.resolve({});
      if (path.includes('/schedules?')) return Promise.resolve({ data: [] });
      if (path.includes('/availability/matrix')) return Promise.resolve(matrixResponse());
      return Promise.resolve({});
    });
    renderShow(OPEN_WINDOW, COORDINATOR);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Set pay offer' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hourly' }));
    await user.type(screen.getByLabelText('Rate per hour'), '5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/availability-windows/${OPEN_WINDOW.id}`,
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });
});
