import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, Notification, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { messages } from '../../i18n/i18nProvider';
import { defaultMonth, EmergencyWindowDialog } from './EmergencyWindowDialog';
import {
  AvailabilityWindow,
  AvailabilityWindowStatus,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { OPEN_WINDOW } from '../../test/fixtures';

vi.mock('../../api', () => ({
  apiFetch: vi.fn(),
  apiDownload: vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;

/** Mid-December, so "next month" also has to roll the year over. */
const DECEMBER = new Date('2026-12-14T10:00:00.000Z');
const SEPTEMBER = new Date('2026-09-14T10:00:00.000Z');

// This screen has not gone through #180 phase 3 yet — English by convention.
const i18nProvider = polyglotI18nProvider(messages, 'en');

function renderDialog(today = SEPTEMBER) {
  const onClose = vi.fn();
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <EmergencyWindowDialog open onClose={onClose} today={today} />
      <Notification />
    </AdminContext>,
  );
  return { onClose };
}

/** The body of the last month-window POST. */
function lastCreateBody():
  | { year: number; month: number; acknowledgeOverlap?: boolean }
  | undefined {
  const call = [...mockApiFetch.mock.calls]
    .reverse()
    .find(([path]) => path === '/availability-windows/month');
  return call?.[1]?.body;
}

describe('defaultMonth', () => {
  it('is the month after the one given', () => {
    expect(defaultMonth(SEPTEMBER)).toBe('2026-10');
  });

  it('rolls into January across a year boundary', () => {
    expect(defaultMonth(DECEMBER)).toBe('2027-01');
  });
});

/** The dialog reads the overlaps for the month, then posts the window. */
function stubApi({
  open = [],
  closed = [],
}: { open?: AvailabilityWindow[]; closed?: AvailabilityWindow[] } = {}) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/availability-windows/overlaps')) {
      return Promise.resolve({ open, closed });
    }
    return Promise.resolve({ ...OPEN_WINDOW, id: 'win-new' });
  });
}

describe('EmergencyWindowDialog', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    stubApi();
  });

  it('defaults to next month', () => {
    renderDialog();

    expect(screen.getByLabelText('Month')).toHaveValue('10');
    expect(screen.getByLabelText('Year')).toHaveValue('2026');
  });

  it('defaults to January of the next year when opened in December', () => {
    renderDialog(DECEMBER);

    expect(screen.getByLabelText('Month')).toHaveValue('1');
    expect(screen.getByLabelText('Year')).toHaveValue('2027');
  });

  it('previews the whole month it would cover', () => {
    renderDialog();

    expect(screen.getByText('1 Oct 2026 – 31 Oct 2026 · 31 days')).toBeInTheDocument();
  });

  it('updates the preview when another month is picked', async () => {
    renderDialog();

    await userEvent.selectOptions(screen.getByLabelText('Month'), '11');

    expect(screen.getByText('1 Nov 2026 – 30 Nov 2026 · 30 days')).toBeInTheDocument();
  });

  it('gets February right in a leap year', async () => {
    renderDialog();

    await userEvent.selectOptions(screen.getByLabelText('Year'), '2028');
    await userEvent.selectOptions(screen.getByLabelText('Month'), '2');

    expect(screen.getByText('1 Feb 2028 – 29 Feb 2028 · 29 days')).toBeInTheDocument();
  });

  it('says which shifts the window will get, since they are not editable here', () => {
    renderDialog();

    expect(
      screen.getByText(/one\s+20:00–24:00 shift on working days/),
    ).toBeInTheDocument();
  });

  it('says which crew the schedule will be built from', () => {
    renderDialog();

    expect(
      screen.getByText(
        /standard crew — Driver, Team Leader and Team Member, one person each/,
      ),
    ).toBeInTheDocument();
  });

  it('posts the chosen year and month', async () => {
    renderDialog();

    await userEvent.selectOptions(screen.getByLabelText('Month'), '11');
    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() =>
      expect(lastCreateBody()).toEqual({
        year: 2026,
        month: 11,
        acknowledgeOverlap: undefined,
      }),
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/availability-windows/month',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('confirms the month it opened and closes', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    expect(
      await screen.findByText(
        'Emergency - October opened for 1 Oct 2026 – 31 Oct 2026',
      ),
    ).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces the API refusal when a window is already open, and stays open', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/availability-windows/overlaps')) {
        return Promise.resolve({ open: [], closed: [] });
      }
      return Promise.reject(
        new Error(
          'An availability window for Emergency is already open over these dates.',
        ),
      );
    });
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    expect(
      await screen.findByText(/An availability window for Emergency is already open/),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancels without opening anything', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(
      mockApiFetch.mock.calls.some(([path]) => path === '/availability-windows/month'),
    ).toBe(false);
  });

  // ── category, name and overlaps ─────────────────────────────────────────────

  it('shows the category and the name the window will be given', () => {
    renderDialog();

    expect(screen.getByText('Emergency')).toBeInTheDocument();
    expect(screen.getByText('Emergency - October')).toBeInTheDocument();
  });

  it('renames itself when another month is picked', async () => {
    renderDialog();

    await userEvent.selectOptions(screen.getByLabelText('Month'), '11');

    expect(screen.getByText('Emergency - November')).toBeInTheDocument();
  });

  it('checks the month for Emergency windows that already cover it', async () => {
    renderDialog();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/availability-windows/overlaps?category=EMERGENCY' +
          '&startDate=2026-10-01&endDate=2026-10-31',
      ),
    );
  });

  it('refuses up front when an Emergency window is open over the month', async () => {
    stubApi({ open: [OPEN_WINDOW] });
    renderDialog();

    expect(
      await screen.findByText(/An Emergency window is already open over this month/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open window' })).toBeDisabled(),
    );
  });

  it('asks for confirmation when a closed window already covers the month', async () => {
    stubApi({
      closed: [{ ...OPEN_WINDOW, status: AvailabilityWindowStatus.CLOSED }],
    });
    renderDialog();

    expect(
      await screen.findByText(/A closed Emergency window already covers these dates/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open window' })).toBeDisabled(),
    );

    await userEvent.click(screen.getByLabelText('Ask for this month again anyway'));
    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(lastCreateBody()?.acknowledgeOverlap).toBe(true));
  });
});
