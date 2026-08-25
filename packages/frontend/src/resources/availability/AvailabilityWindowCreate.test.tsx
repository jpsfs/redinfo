import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, Notification, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import {
  AvailabilityWindow,
  AvailabilityWindowCategory,
  AvailabilityWindowStatus,
  ShiftSpec,
  toMinuteOfDay,
  WindowRoleSpec,
} from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { AvailabilityWindowCreate } from './AvailabilityWindowCreate';
import { apiFetch } from '../../api';
import { calendarFor, OPEN_WINDOW } from '../../test/fixtures';

// This screen has not gone through #180 phase 3 yet — English by convention.
const i18nProvider = polyglotI18nProvider(messages, 'en');

vi.mock('../../api', () => ({
  apiFetch: vi.fn(),
  apiDownload: vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;

/** Minutes from midnight, so the expectations read in wall-clock time. */
const at = (hour: number, minute = 0) => toMinuteOfDay(hour, minute);

const START = '2026-09-28'; // Monday
const END = '2026-10-05'; // Monday, a holiday

interface CreatedWindow {
  startDate: string;
  endDate: string;
  category: AvailabilityWindowCategory;
  name?: string;
  roles: WindowRoleSpec[];
  acknowledgeOverlap?: boolean;
  days: Array<{ date: string; shifts: ShiftSpec[] }>;
}

/**
 * The screen reads the overlapping windows and the calendar from the API, and
 * saves through the dataProvider, so both are stubbed.
 */
function stubApi({
  open = [],
  closed = [],
}: { open?: AvailabilityWindow[]; closed?: AvailabilityWindow[] } = {}) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/availability-windows/overlaps')) {
      return Promise.resolve({ open, closed });
    }
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
      <AdminContext dataProvider={testDataProvider({ create: create as never })} i18nProvider={i18nProvider}>
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

/** Type a time into a native time input, the way the picker commits one. */
const setTime = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

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
    expect(screen.getByLabelText('Mon, 28 Sep shift 1 start')).toHaveValue('20:00');
    expect(screen.getByLabelText('Sat, 3 Oct shift 1 start')).toHaveValue('08:00');
    expect(screen.getByLabelText('Sat, 3 Oct shift 2 start')).toHaveValue('16:00');
  });

  it('marks the holiday inside the range, which is why it has two shifts', async () => {
    renderScreen();
    await setRange();

    expect(screen.getByText('Holiday · Implantação da República')).toBeInTheDocument();
    expect(screen.getByLabelText('Mon, 5 Oct shift 2 end')).toHaveValue('00:00');
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
    expect(shiftsOn(saved, START)).toEqual([
      { startMinute: at(20), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
    expect(shiftsOn(saved, '2026-10-03')).toEqual([
      { startMinute: at(8), endMinute: at(16), vehiclesNeeded: 1 },
      { startMinute: at(16), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
  });

  it('saves per-day edits, down to the minute', async () => {
    const { create } = renderScreen();
    await setRange();

    setTime('Mon, 28 Sep shift 1 start', '18:30');
    await userEvent.click(screen.getByLabelText('Remove Sat, 3 Oct shift 2'));
    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const saved = savedWindow(create);
    expect(shiftsOn(saved, START)).toEqual([
      { startMinute: at(18, 30), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
    expect(shiftsOn(saved, '2026-10-03')).toEqual([
      { startMinute: at(8), endMinute: at(16), vehiclesNeeded: 1 },
    ]);
  });

  it('copies one day’s shifts to every working day', async () => {
    const { create } = renderScreen();
    await setRange();

    setTime('Mon, 28 Sep shift 1 start', '19:00');
    await userEvent.click(
      screen.getByLabelText('Copy Mon, 28 Sep shifts to other days'),
    );
    await userEvent.click(screen.getByText('All working days (5)'));
    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const saved = savedWindow(create);
    expect(shiftsOn(saved, '2026-09-29')).toEqual([
      { startMinute: at(19), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
    expect(shiftsOn(saved, '2026-10-02')).toEqual([
      { startMinute: at(19), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
    // The weekend and the holiday are untouched by "working days".
    expect(shiftsOn(saved, '2026-10-04')).toHaveLength(2);
    expect(shiftsOn(saved, END)).toHaveLength(2);
  });

  it('keeps edits when the range is extended', async () => {
    const { create } = renderScreen();
    await setRange(START, '2026-09-30');

    setTime('Mon, 28 Sep shift 1 start', '17:00');
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-10-02' },
    });
    await screen.findByText('Fri, 2 Oct');

    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const saved = savedWindow(create);
    expect(shiftsOn(saved, START)).toEqual([
      { startMinute: at(17), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
    expect(shiftsOn(saved, '2026-10-02')).toEqual([
      { startMinute: at(20), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
  });

  // ── vehicles ───────────────────────────────────────────────────────────────

  it('seeds every shift with one vehicle', async () => {
    renderScreen();
    await setRange();

    expect(screen.getByLabelText('Mon, 28 Sep shift 1 vehicles')).toHaveValue(1);
    expect(screen.getByLabelText('Sat, 3 Oct shift 2 vehicles')).toHaveValue(1);
  });

  it('saves the vehicles set per shift', async () => {
    const { create } = renderScreen();
    await setRange();

    fireEvent.change(screen.getByLabelText('Sat, 3 Oct shift 1 vehicles'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Sat, 3 Oct shift 2 vehicles'), {
      target: { value: '0' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(shiftsOn(savedWindow(create), '2026-10-03')).toEqual([
      { startMinute: at(8), endMinute: at(16), vehiclesNeeded: 2 },
      { startMinute: at(16), endMinute: at(24), vehiclesNeeded: 0 },
    ]);
    // Other days keep the one they were seeded with.
    expect(shiftsOn(savedWindow(create), START)).toEqual([
      { startMinute: at(20), endMinute: at(24), vehiclesNeeded: 1 },
    ]);
  });

  it('keeps a vehicle edit when the range is extended', async () => {
    const { create } = renderScreen();
    await setRange(START, '2026-09-30');

    fireEvent.change(screen.getByLabelText('Mon, 28 Sep shift 1 vehicles'), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-10-02' },
    });
    await screen.findByText('Fri, 2 Oct');
    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(shiftsOn(savedWindow(create), START)[0].vehiclesNeeded).toBe(4);
  });

  // ── category and name ──────────────────────────────────────────────────────

  it('defaults to Emergency and offers every category', async () => {
    renderScreen();
    await setRange();

    const select = screen.getByLabelText('Category');
    expect(select).toHaveValue(AvailabilityWindowCategory.EMERGENCY);
    expect(
      within(select as HTMLElement).getByRole('option', { name: 'Local Support' }),
    ).toBeInTheDocument();
    expect(
      within(select as HTMLElement).getByRole('option', { name: 'SALOP Support' }),
    ).toBeInTheDocument();
  });

  it('saves the chosen category and name', async () => {
    const { create } = renderScreen();
    await setRange();

    await userEvent.selectOptions(
      screen.getByLabelText('Category'),
      AvailabilityWindowCategory.SALOP_SUPPORT,
    );
    await userEvent.type(screen.getByLabelText('Name (optional)'), 'Marathon cover');
    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(savedWindow(create)).toMatchObject({
      category: AvailabilityWindowCategory.SALOP_SUPPORT,
      name: 'Marathon cover',
    });
  });

  it('sends no name when the field is left blank', async () => {
    const { create } = renderScreen();
    await setRange();

    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(savedWindow(create).name).toBeUndefined();
  });

  it('checks for overlaps of the category chosen, over the dates chosen', async () => {
    renderScreen();
    await setRange();

    await userEvent.selectOptions(
      screen.getByLabelText('Category'),
      AvailabilityWindowCategory.LOCAL_SUPPORT,
    );

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/availability-windows/overlaps?category=LOCAL_SUPPORT&startDate=${START}&endDate=${END}`,
      ),
    );
  });

  // ── roles ──────────────────────────────────────────────────────────────────

  it('seeds an Emergency window with the standard crew, one person each', async () => {
    renderScreen();
    await setRange();

    expect(screen.getByLabelText('Role 1 name')).toHaveValue('Driver');
    expect(screen.getByLabelText('Role 2 name')).toHaveValue('Team Leader');
    expect(screen.getByLabelText('Role 3 name')).toHaveValue('Team Member');
    expect(screen.getByLabelText('Role 1 people')).toHaveValue(1);
  });

  it('pre-fills each Emergency default with its required certification', async () => {
    renderScreen();
    await setRange();

    const selects = screen.getAllByRole('combobox', { name: /required certification/i });
    expect(selects[0]).toHaveTextContent('Driver');
    expect(selects[1]).toHaveTextContent('TAS');
    expect(selects[2]).toHaveTextContent('TAT');
    expect(screen.getAllByText("Coordinator's choice")).toHaveLength(3);
  });

  it('saves the crew with the window, each with its required certification', async () => {
    const { create } = renderScreen();
    await setRange();

    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(savedWindow(create).roles).toEqual([
      { name: 'Driver', maxPeople: 1, requiredCertification: 'DRIVER' },
      { name: 'Team Leader', maxPeople: 1, requiredCertification: 'TAS' },
      { name: 'Team Member', maxPeople: 1, requiredCertification: 'TAT' },
    ]);
  });

  it('re-seeds the roles from the category, until they have been edited', async () => {
    renderScreen();
    await setRange();

    await userEvent.selectOptions(
      screen.getByLabelText('Category'),
      AvailabilityWindowCategory.LOCAL_SUPPORT,
    );
    expect(screen.queryByLabelText('Role 1 name')).not.toBeInTheDocument();
    expect(
      screen.getByText(/people will be scheduled onto this window without one/),
    ).toBeInTheDocument();

    // An edited list is the coordinator's, and survives a change of category.
    await userEvent.click(screen.getByRole('button', { name: 'Add role' }));
    await userEvent.type(screen.getByLabelText('Role 1 name'), 'Radio operator');
    await userEvent.selectOptions(
      screen.getByLabelText('Category'),
      AvailabilityWindowCategory.EMERGENCY,
    );
    expect(screen.getByLabelText('Role 1 name')).toHaveValue('Radio operator');
  });

  it('saves roles a coordinator added, unlimited ones included', async () => {
    const { create } = renderScreen();
    await setRange();

    await userEvent.click(screen.getByLabelText('Remove role 3'));
    await userEvent.click(screen.getByRole('button', { name: 'Add role' }));
    await userEvent.type(screen.getByLabelText('Role 3 name'), 'Stretcher bearer');
    fireEvent.change(screen.getByLabelText('Role 3 people'), { target: { value: '0' } });

    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(savedWindow(create).roles).toEqual([
      { name: 'Driver', maxPeople: 1, requiredCertification: 'DRIVER' },
      { name: 'Team Leader', maxPeople: 1, requiredCertification: 'TAS' },
      // A freshly added role has no explicit choice — left unset, for the API
      // to resolve the same way `toWindowRoles` does (shared).
      { name: 'Stretcher bearer', maxPeople: 0 },
    ]);
    expect(screen.getByText('unlimited')).toBeInTheDocument();
  });

  it('sends an empty list rather than falling back to the defaults', async () => {
    const { create } = renderScreen();
    await setRange();

    for (const position of [3, 2, 1]) {
      await userEvent.click(screen.getByLabelText(`Remove role ${position}`));
    }
    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(savedWindow(create).roles).toEqual([]);
  });

  it('will not save a role left unnamed', async () => {
    renderScreen();
    await setRange();

    await userEvent.click(screen.getByRole('button', { name: 'Add role' }));

    expect(await screen.findByText('Every role needs a name.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open window' })).toBeDisabled();
  });

  it('will not save two roles a schedule could not tell apart', async () => {
    renderScreen();
    await setRange();

    fireEvent.change(screen.getByLabelText('Role 2 name'), { target: { value: 'driver' } });

    expect(await screen.findByText('Two roles are both called "driver".')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open window' })).toBeDisabled();
  });

  // ── overlaps ───────────────────────────────────────────────────────────────

  it('blocks saving when a window of the same category is open over the dates', async () => {
    stubApi({ open: [OPEN_WINDOW] });
    renderScreen();
    await setRange();

    expect(
      screen.getByText(/An availability window for Emergency is already open over these dates/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open window' })).toBeDisabled();
  });

  it('names the window in the way of it', async () => {
    stubApi({ open: [OPEN_WINDOW] });
    renderScreen();
    await setRange();

    expect(screen.getByText(/Emergency - October/)).toBeInTheDocument();
  });

  it('warns about a closed window over the same dates, and waits to be told', async () => {
    const closed: AvailabilityWindow = {
      ...OPEN_WINDOW,
      status: AvailabilityWindowStatus.CLOSED,
    };
    stubApi({ closed: [closed] });
    const { create } = renderScreen();
    await setRange();

    expect(
      screen.getByText(/A closed availability window for Emergency already covers these dates/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open window' })).toBeDisabled();

    await userEvent.click(
      screen.getByLabelText('Open another Emergency window over these dates'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(savedWindow(create).acknowledgeOverlap).toBe(true);
  });

  it('does not acknowledge an overlap that was never warned about', async () => {
    const { create } = renderScreen();
    await setRange();

    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(savedWindow(create).acknowledgeOverlap).toBeUndefined();
  });

  it('re-asks for confirmation when the dates change', async () => {
    const closed: AvailabilityWindow = {
      ...OPEN_WINDOW,
      status: AvailabilityWindowStatus.CLOSED,
    };
    stubApi({ closed: [closed] });
    renderScreen();
    await setRange();

    await userEvent.click(
      screen.getByLabelText('Open another Emergency window over these dates'),
    );
    expect(screen.getByRole('button', { name: 'Open window' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-10-04' },
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open window' })).toBeDisabled(),
    );
  });

  // ── refusals ───────────────────────────────────────────────────────────────

  it('will not save while a day has overlapping shifts', async () => {
    renderScreen();
    await setRange();

    // Push the Saturday's first shift over the second.
    setTime('Sat, 3 Oct shift 1 end', '20:00');

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

  it('reports a save that the API refuses', async () => {
    render(
      <MemoryRouter>
        <AdminContext
          dataProvider={testDataProvider({
            create: (() => Promise.reject(new Error('Boom from the API'))) as never,
          })}
          i18nProvider={i18nProvider}
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
      if (path.startsWith('/availability-windows/overlaps')) {
        return Promise.resolve({ open: [], closed: [] });
      }
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
