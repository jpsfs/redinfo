import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, Notification, testDataProvider } from 'react-admin';
import { MemoryRouter } from 'react-router-dom';
import { ShiftTimes } from '@redinfo/shared';
import { AvailabilityWindowCreate } from './AvailabilityWindowCreate';
import { apiFetch } from '../../api';
import { calendarFor, OPEN_WINDOW } from '../../test/fixtures';

vi.mock('../../api', () => ({
  apiFetch: vi.fn(),
  apiDownload: vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;

const START = '2026-09-28'; // Monday
const END = '2026-10-05'; // Monday, a holiday

interface CreatedWindow {
  startDate: string;
  endDate: string;
  days: Array<{ date: string; shifts: ShiftTimes[] }>;
}

/**
 * The screen reads the open window and the calendar from the API, and saves
 * through the dataProvider, so both are stubbed.
 */
function stubApi({ active = null }: { active?: unknown } = {}) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/availability-windows/active') return Promise.resolve(active);
    if (path.startsWith('/availability/calendar')) {
      const params = new URL(`http://x${path}`).searchParams;
      return Promise.resolve(calendarFor(params.get('from')!, params.get('to')!));
    }
    return Promise.resolve(null);
  });
}

function renderScreen() {
  const create = vi.fn((_resource: string, params: { data: CreatedWindow }) =>
    Promise.resolve({ data: { ...OPEN_WINDOW, ...params.data, id: 'win-new' } }),
  );
  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider({ create: create as never })}>
        <AvailabilityWindowCreate />
        <Notification />
      </AdminContext>
    </MemoryRouter>,
  );
  return { create };
}

/** Set both date fields, which is what makes the editor load. */
async function setRange(start = START, end = END) {
  fireEvent.change(await screen.findByLabelText('Start date'), {
    target: { value: start },
  });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: end } });
  await screen.findByText('Mon, 28 Sep');
}

const savedWindow = (create: Mock): CreatedWindow => create.mock.calls[0][1].data;

const shiftsOn = (saved: CreatedWindow, date: string) =>
  saved.days.find((day) => day.date === date)!.shifts;

describe('AvailabilityWindowCreate', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    stubApi();
  });

  it('seeds every day of the range from the default grid', async () => {
    renderScreen();
    await setRange();

    expect(screen.getByText('8 days · 11 shifts in total')).toBeInTheDocument();
    expect(screen.getByLabelText('Mon, 28 Sep shift 1 start')).toHaveValue('20');
    expect(screen.getByLabelText('Sat, 3 Oct shift 1 start')).toHaveValue('8');
    expect(screen.getByLabelText('Sat, 3 Oct shift 2 start')).toHaveValue('16');
  });

  it('marks the holiday inside the range, which is why it has two shifts', async () => {
    renderScreen();
    await setRange();

    expect(screen.getByText('Holiday · Implantação da República')).toBeInTheDocument();
    expect(screen.getByLabelText('Mon, 5 Oct shift 2 end')).toHaveValue('24');
  });

  it('saves the range with one entry per day', async () => {
    const { create } = renderScreen();
    await setRange();

    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const saved = savedWindow(create);
    expect(saved.startDate).toBe(START);
    expect(saved.endDate).toBe(END);
    expect(saved.days).toHaveLength(8);
    expect(shiftsOn(saved, START)).toEqual([{ startHour: 20, endHour: 24 }]);
    expect(shiftsOn(saved, '2026-10-03')).toEqual([
      { startHour: 8, endHour: 16 },
      { startHour: 16, endHour: 24 },
    ]);
  });

  it('saves per-day edits', async () => {
    const { create } = renderScreen();
    await setRange();

    await userEvent.selectOptions(
      screen.getByLabelText('Mon, 28 Sep shift 1 start'),
      '18',
    );
    await userEvent.click(screen.getByLabelText('Remove Sat, 3 Oct shift 2'));
    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const saved = savedWindow(create);
    expect(shiftsOn(saved, START)).toEqual([{ startHour: 18, endHour: 24 }]);
    expect(shiftsOn(saved, '2026-10-03')).toEqual([{ startHour: 8, endHour: 16 }]);
  });

  it('copies one day’s shifts to every working day', async () => {
    const { create } = renderScreen();
    await setRange();

    await userEvent.selectOptions(
      screen.getByLabelText('Mon, 28 Sep shift 1 start'),
      '19',
    );
    await userEvent.click(
      screen.getByLabelText('Copy Mon, 28 Sep shifts to other days'),
    );
    await userEvent.click(screen.getByText('All working days (5)'));
    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const saved = savedWindow(create);
    expect(shiftsOn(saved, '2026-09-29')).toEqual([{ startHour: 19, endHour: 24 }]);
    expect(shiftsOn(saved, '2026-10-02')).toEqual([{ startHour: 19, endHour: 24 }]);
    // The weekend and the holiday are untouched by "working days".
    expect(shiftsOn(saved, '2026-10-04')).toHaveLength(2);
    expect(shiftsOn(saved, END)).toHaveLength(2);
  });

  it('keeps edits when the range is extended', async () => {
    const { create } = renderScreen();
    await setRange(START, '2026-09-30');

    await userEvent.selectOptions(
      screen.getByLabelText('Mon, 28 Sep shift 1 start'),
      '17',
    );
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-10-02' },
    });
    await screen.findByText('Fri, 2 Oct');

    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const saved = savedWindow(create);
    expect(shiftsOn(saved, START)).toEqual([{ startHour: 17, endHour: 24 }]);
    expect(shiftsOn(saved, '2026-10-02')).toEqual([{ startHour: 20, endHour: 24 }]);
  });

  // ── refusals ───────────────────────────────────────────────────────────────

  it('will not save while a day has overlapping shifts', async () => {
    renderScreen();
    await setRange();

    // Push the Saturday's first shift over the second.
    await userEvent.selectOptions(screen.getByLabelText('Sat, 3 Oct shift 1 end'), '20');

    expect(
      await screen.findByText(/One day has shifts that cannot be saved/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open window' })).toBeDisabled();
  });

  it('will not save a range that ends before it starts', async () => {
    renderScreen();
    await setRange();

    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-09-20' },
    });

    expect(
      await screen.findByText('End date must be on or after the start date.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open window' })).not.toBeInTheDocument();
  });

  it('will not save a range longer than the allowed maximum', async () => {
    renderScreen();
    await setRange();

    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2027-09-28' },
    });

    expect(await screen.findByText(/at most 92 days/)).toBeInTheDocument();
  });

  it('blocks saving while another window is open, and says which', async () => {
    stubApi({ active: OPEN_WINDOW });
    renderScreen();
    await setRange();

    expect(
      screen.getByText(/An availability window is already open/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open window' })).toBeDisabled();
  });

  it('reports a save that the API refuses', async () => {
    render(
      <MemoryRouter>
        <AdminContext
          dataProvider={testDataProvider({
            create: (() => Promise.reject(new Error('Boom from the API'))) as never,
          })}
        >
          <AvailabilityWindowCreate />
          <Notification />
        </AdminContext>
      </MemoryRouter>,
    );
    await setRange();

    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    expect(await screen.findByText('Boom from the API')).toBeInTheDocument();
  });

  it('reports a calendar it could not load, and offers nothing to edit', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/availability-windows/active') return Promise.resolve(null);
      return Promise.reject(new Error('Calendar unavailable'));
    });
    renderScreen();

    fireEvent.change(await screen.findByLabelText('Start date'), {
      target: { value: START },
    });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: END } });

    expect(await screen.findByText('Calendar unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Shifts per day')).not.toBeInTheDocument();
  });

  it('asks the API for the day types of exactly the range chosen', async () => {
    renderScreen();
    await setRange();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/availability/calendar?from=${START}&to=${END}`,
      ),
    );
  });

  it('lets a day be left with no shifts at all', async () => {
    const { create } = renderScreen();
    await setRange();

    const row = screen.getByText('Tue, 29 Sep').closest('tr') as HTMLElement;
    await userEvent.click(
      within(row).getByLabelText('Remove Tue, 29 Sep shift 1'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(shiftsOn(savedWindow(create), '2026-09-29')).toEqual([]);
  });
});
