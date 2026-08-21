import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, Notification, testDataProvider } from 'react-admin';
import { defaultMonth, EmergencyWindowDialog } from './EmergencyWindowDialog';
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

function renderDialog(today = SEPTEMBER) {
  const onClose = vi.fn();
  render(
    <AdminContext dataProvider={testDataProvider()}>
      <EmergencyWindowDialog open onClose={onClose} today={today} />
      <Notification />
    </AdminContext>,
  );
  return { onClose };
}

/** The body of the last month-window POST. */
function lastCreateBody(): { year: number; month: number } | undefined {
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

describe('EmergencyWindowDialog', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ ...OPEN_WINDOW, id: 'win-new' });
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

  it('posts the chosen year and month', async () => {
    renderDialog();

    await userEvent.selectOptions(screen.getByLabelText('Month'), '11');
    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    await waitFor(() => expect(lastCreateBody()).toEqual({ year: 2026, month: 11 }));
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/availability-windows/month',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('confirms the month it opened and closes', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    expect(
      await screen.findByText('Availability window opened for October 2026'),
    ).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces the API refusal when a window is already open, and stays open', async () => {
    mockApiFetch.mockRejectedValue(
      new Error(
        'An availability window is already open (2026-09-28 – 2026-10-05). Close it before opening the next one.',
      ),
    );
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Open window' }));

    expect(
      await screen.findByText(/An availability window is already open/),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancels without opening anything', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
