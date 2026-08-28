import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { InventoryItemType, MaterialItem } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { MaterialItemList } from './MaterialItemList';

const i18nProvider = polyglotI18nProvider(messages, 'en');

const gloves = (overrides: Partial<MaterialItem> = {}): MaterialItem =>
  ({
    id: 'mat-1',
    namePt: 'Luvas',
    nameEn: 'Gloves',
    unit: 'pcs',
    type: InventoryItemType.COUNTABLE,
    notes: null,
    isFrequent: true,
    frequentOrder: 0,
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    barcodes: [{ id: 'bc-1', materialItemId: 'mat-1', code: '5601234567890', label: null }],
    ...overrides,
  }) as MaterialItem;

function renderList(data: MaterialItem[]) {
  const dataProvider = testDataProvider({
    getList: vi.fn(() => Promise.resolve({ data, total: data.length })) as never,
  });

  render(
    <MemoryRouter>
      <AdminContext dataProvider={dataProvider} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="material-items">
          <MaterialItemList />
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

describe('the material catalogue list', () => {
  it('shows both names, the unit, the type and the barcode count', async () => {
    renderList([gloves()]);

    expect(await screen.findByText('Luvas')).toBeInTheDocument();
    expect(screen.getByText('Gloves')).toBeInTheDocument();
    expect(screen.getByText('pcs')).toBeInTheDocument();
    expect(screen.getByText('Countable (integer quantity)')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('marks a pinned favourite', async () => {
    renderList([gloves({ isFrequent: true }), gloves({ id: 'mat-2', namePt: 'Ligaduras', isFrequent: false })]);

    // One "Favourite" is the column header — the other is the chip on the
    // one row that is actually pinned.
    expect(await screen.findAllByText('Favourite')).toHaveLength(2);
  });

  it('offers a way to add one', async () => {
    renderList([gloves()]);
    expect(await screen.findByText(/create/i)).toBeInTheDocument();
  });
});
