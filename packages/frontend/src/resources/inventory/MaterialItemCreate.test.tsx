import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, Notification, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { messages } from '../../i18n/i18nProvider';
import { MaterialItemCreate } from './MaterialItemCreate';

const i18nProvider = polyglotI18nProvider(messages, 'en');

function renderCreate(create: ReturnType<typeof vi.fn>) {
  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider({ create: create as never })} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="material-items">
          <MaterialItemCreate />
          <Notification />
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

describe('MaterialItemCreate', () => {
  it('round-trips a barcode into the create payload', async () => {
    const create = vi.fn((_resource: string, params: { data: Record<string, unknown> }) =>
      Promise.resolve({ data: { id: 'mat-new', ...params.data } }),
    );
    renderCreate(create);

    await userEvent.type(screen.getByLabelText(/Name \(PT\)/), 'Luvas');
    await userEvent.click(screen.getByLabelText('Add'));
    await userEvent.type(screen.getByLabelText('Code *'), '5601234567890');
    await userEvent.type(screen.getByLabelText('Label'), 'Caixa de 100');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const saved = create.mock.calls[0][1].data;
    expect(saved.namePt).toBe('Luvas');
    expect(saved.barcodes).toEqual([{ code: '5601234567890', label: 'Caixa de 100' }]);
  });

  it('surfaces a duplicate barcode as a readable message', async () => {
    // What the real `dataProvider`'s `translateHttpError` turns
    // `MATERIAL_ITEM_BARCODE_CONFLICT` into — see `apiError.MATERIAL_ITEM_BARCODE_CONFLICT`
    // in labels.ts. Reproduced here as a plain rejection since `testDataProvider`
    // bypasses that translation layer, the same way `AvailabilityWindowCreate.test.tsx`
    // simulates a refused save.
    const create = vi.fn(() =>
      Promise.reject(new Error('Barcode 5601234567890 is already used by another item.')),
    );
    renderCreate(create);

    await userEvent.type(screen.getByLabelText(/Name \(PT\)/), 'Luvas');
    await userEvent.click(screen.getByLabelText('Add'));
    await userEvent.type(screen.getByLabelText('Code *'), '5601234567890');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(
      await screen.findByText('Barcode 5601234567890 is already used by another item.'),
    ).toBeInTheDocument();
  });
});
