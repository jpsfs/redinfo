import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { AvailabilityWindow, CompensationOfferKind } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { WindowCompensationDialog } from './WindowCompensationDialog';
import { apiFetch } from '../../api';
import { OPEN_WINDOW } from '../../test/fixtures';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  apiFetch: vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;
const i18nProvider = polyglotI18nProvider(messages, 'en');

function renderDialog(window: AvailabilityWindow, props: Partial<Parameters<typeof WindowCompensationDialog>[0]> = {}) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <WindowCompensationDialog window={window} open onClose={onClose} onSaved={onSaved} {...props} />
    </AdminContext>,
  );
  return { onSaved, onClose };
}

describe('WindowCompensationDialog', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({});
  });

  it('defaults to "No offer" for a window that never had one', () => {
    renderDialog(OPEN_WINDOW);
    expect(screen.getByRole('button', { name: 'No offer', pressed: true })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Rate per hour|Amount per shift/)).not.toBeInTheDocument();
  });

  it('prefills the stored rate for an HOURLY offer', () => {
    renderDialog({
      ...OPEN_WINDOW,
      compensationKind: CompensationOfferKind.HOURLY,
      compensationRateCents: 500,
      compensationAmountCents: null,
    });
    expect(screen.getByRole('button', { name: 'Hourly', pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Rate per hour')).toHaveValue('5.00');
  });

  it('prefills the stored amount for a FIXED offer', () => {
    renderDialog({
      ...OPEN_WINDOW,
      compensationKind: CompensationOfferKind.FIXED,
      compensationRateCents: null,
      compensationAmountCents: 2500,
    });
    expect(screen.getByRole('button', { name: 'Fixed amount', pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Amount per shift')).toHaveValue('25.00');
  });

  it('saves an HOURLY offer, converting euros to cents', async () => {
    const { onSaved } = renderDialog(OPEN_WINDOW);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Hourly' }));
    await user.type(screen.getByLabelText('Rate per hour'), '5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(`/availability-windows/${OPEN_WINDOW.id}`, {
      method: 'PATCH',
      body: { kind: CompensationOfferKind.HOURLY, rateCents: 500, amountCents: undefined, note: null },
    });
  });

  it('saves NONE, withdrawing a previous offer', async () => {
    const { onSaved } = renderDialog({
      ...OPEN_WINDOW,
      compensationKind: CompensationOfferKind.HOURLY,
      compensationRateCents: 500,
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'No offer' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(`/availability-windows/${OPEN_WINDOW.id}`, {
      method: 'PATCH',
      body: { kind: CompensationOfferKind.NONE, rateCents: undefined, amountCents: undefined, note: null },
    });
  });
});
