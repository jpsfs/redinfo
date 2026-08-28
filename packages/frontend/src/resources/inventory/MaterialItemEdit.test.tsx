import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, Notification, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InventoryItemType, MaterialItem } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { MaterialItemEdit } from './MaterialItemEdit';

const i18nProvider = polyglotI18nProvider(messages, 'en');

const GLOVES: MaterialItem = {
  id: 'mat-1',
  namePt: 'Luvas',
  nameEn: 'Gloves',
  unit: 'pcs',
  type: InventoryItemType.COUNTABLE,
  notes: null,
  isFrequent: false,
  frequentOrder: 0,
  isDeleted: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  barcodes: [{ id: 'bc-1', materialItemId: 'mat-1', code: '5601234567890', label: 'Caixa de 100' }],
};

function renderEdit(update: ReturnType<typeof vi.fn>) {
  render(
    <MemoryRouter initialEntries={['/material-items/mat-1']}>
      <AdminContext
        dataProvider={testDataProvider({
          getOne: vi.fn(() => Promise.resolve({ data: GLOVES })) as never,
          update: update as never,
        })}
        i18nProvider={i18nProvider}
      >
        <ResourceContextProvider value="material-items">
          <Routes>
            <Route path="/material-items/:id" element={<MaterialItemEdit />} />
            {/* Silences react-router's "no routes matched" noise after the
                post-save redirect — the list screen itself isn't under test here. */}
            <Route path="/material-items" element={<div />} />
          </Routes>
          <Notification />
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

/**
 * `ArrayInput`'s `useFieldArray` populates one tick after the form's scalar
 * `defaultValues` — `namePt` is visible the instant `getOne` resolves, but
 * `barcodes` needs an extra turn of the event loop before `findByDisplayValue`
 * settles on it. A short real wait, not `waitFor`'s own polling, is what
 * reliably clears that gap in this react-hook-form version.
 */
const waitATick = () => new Promise((resolve) => setTimeout(resolve, 100));

describe('MaterialItemEdit', () => {
  it('pre-fills the existing barcode from the record', async () => {
    renderEdit(vi.fn());
    await screen.findByDisplayValue('Luvas');
    await waitATick();

    expect(screen.getByDisplayValue('5601234567890')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Caixa de 100')).toBeInTheDocument();
  });

  it('round-trips the barcode through an unrelated edit and save', async () => {
    const update = vi.fn((_resource: string, params: { data: Record<string, unknown> }) =>
      Promise.resolve({ data: { ...GLOVES, ...params.data } }),
    );
    renderEdit(update);
    await screen.findByDisplayValue('Luvas');
    await waitATick();

    // A plain, non-array field — the reliable interaction here. What this
    // proves is that a barcode loaded from the record travels through the
    // form untouched into the update payload, alongside an edit elsewhere.
    await userEvent.type(screen.getByLabelText(/Name \(PT\)/), ' extra');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    // `Edit`'s default `mutationMode` is `undoable`: the notification and
    // redirect fire immediately, but the actual `dataProvider.update()` call
    // is held back for react-admin's five-second undo window.
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1), { timeout: 6000 });
    const saved = update.mock.calls[0][1].data;
    expect(saved.namePt).toBe('Luvas extra');
    expect(saved.barcodes).toEqual([
      { id: 'bc-1', materialItemId: 'mat-1', code: '5601234567890', label: 'Caixa de 100' },
    ]);
  });
});
