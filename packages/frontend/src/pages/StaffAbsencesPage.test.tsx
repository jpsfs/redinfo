import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, Notification, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { StaffAbsenceKind } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { StaffAbsencesPage } from './StaffAbsencesPage';
import { apiFetch } from '../api';

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  apiFetch: vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;

const i18nProvider = polyglotI18nProvider(messages, 'en');

const ANA = { id: 'u-ana', firstName: 'Ana', lastName: 'Silva' };
const BRUNO = { id: 'u-bruno', firstName: 'Bruno', lastName: 'Costa' };

const ABSENCE = {
  id: 'abs-1',
  userId: ANA.id,
  kind: StaffAbsenceKind.VACATION,
  startDate: '2026-10-05',
  endDate: '2026-10-07',
  notes: 'Beach week',
  createdById: 'u-coord',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function stubApi({ people = [ANA, BRUNO], absences = [ABSENCE] as unknown[] } = {}) {
  mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    if (path.startsWith('/users')) return Promise.resolve({ data: people, total: people.length });
    if (path.startsWith('/staff-absences') && (!options?.method || options.method === 'GET')) {
      return Promise.resolve(absences);
    }
    return Promise.resolve({});
  });
}

// Fixed "today" so the default visible month (and the absence fixture dates,
// which fall inside it) are deterministic. Only `Date` is faked — faking
// timers too would freeze the polling `waitFor`/`findBy*` rely on.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T09:00:00.000Z'));
});
afterAll(() => vi.useRealTimers());

const renderPage = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <StaffAbsencesPage />
      <Notification />
    </AdminContext>,
  );

describe('StaffAbsencesPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    stubApi();
  });

  it('loads the visible month range and lists every person as a row', async () => {
    renderPage();

    await screen.findByText('Ana Silva');
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/staff-absences?from=2026-10-01&to=2026-10-31'),
    );
  });

  it('says so when there is no staff to show', async () => {
    stubApi({ people: [] });
    renderPage();

    expect(await screen.findByText('No staff to show.')).toBeInTheDocument();
  });

  it('shows an absence already on file, coloured by kind', async () => {
    renderPage();
    await screen.findByText('Ana Silva');

    const cell = screen.getByTestId(`absence-cell-${ANA.id}-2026-10-06`);
    await userEvent.hover(cell);
    expect(await screen.findByText(/Vacation.*Beach week/)).toBeInTheDocument();
  });

  it('opens the edit dialog on an existing block, and deleting it calls the API', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ana Silva');

    await user.pointer({ keys: '[MouseLeft]', target: screen.getByTestId(`absence-cell-${ANA.id}-2026-10-06`) });

    expect(await screen.findByText('Edit absence')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /delete absence/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/staff-absences/abs-1', expect.objectContaining({ method: 'DELETE' })),
    );
  });

  it('dragging across empty days on a row proposes that range for a new absence', async () => {
    renderPage();
    await screen.findByText('Bruno Costa');

    const start = screen.getByTestId(`absence-cell-${BRUNO.id}-2026-10-10`);
    const end = screen.getByTestId(`absence-cell-${BRUNO.id}-2026-10-12`);

    fireEvent.mouseDown(start);
    fireEvent.mouseEnter(end);
    fireEvent.mouseUp(window);

    expect(await screen.findByText('Record absence')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-10-10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-10-12')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/staff-absences',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            userId: BRUNO.id,
            startDate: '2026-10-10',
            endDate: '2026-10-12',
          }),
        }),
      ),
    );
  });

  it('stepping the month reloads absences for the new range', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ana Silva');

    await user.click(screen.getByLabelText('Next month'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/staff-absences?from=2026-11-01&to=2026-11-30'),
    );
  });
});
