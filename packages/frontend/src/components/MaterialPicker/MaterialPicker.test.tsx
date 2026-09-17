import { useState } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { InventoryItemType, Locale, MaterialItem } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { apiFetch } from '../../api';
import { MaterialPicker } from './MaterialPicker';
import { isCameraScanSupported } from './BarcodeScanner';
import { MaterialLine } from './materialLines';

vi.mock('../../api', () => ({ apiFetch: vi.fn() }));

// The camera itself is `BarcodeScanner`'s own concern (see its dedicated
// test file) — here it is a stub exposing the two things a scan can do, so
// this file only has to assert on what a detection/failure does to the
// lines list, per #207's "tests with the scanner mocked" requirement.
vi.mock('./BarcodeScanner', () => ({
  isCameraScanSupported: vi.fn(() => true),
  BarcodeScanner: ({
    onDetect,
    onError,
  }: {
    onDetect: (code: string) => void;
    onError: (kind: 'denied' | 'unsupported') => void;
  }) => (
    <div>
      <button onClick={() => onDetect('KNOWN-CODE')}>fire-detect-known</button>
      <button onClick={() => onDetect('UNKNOWN-CODE')}>fire-detect-unknown</button>
      <button onClick={() => onError('denied')}>fire-denied</button>
    </div>
  ),
}));

const mockApiFetch = apiFetch as unknown as Mock;
const mockCameraSupported = isCameraScanSupported as unknown as Mock;

const gloves: MaterialItem = {
  id: 'mat-gloves',
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
};

const oxygen: MaterialItem = {
  ...gloves,
  id: 'mat-oxygen',
  namePt: 'Oxigénio',
  nameEn: 'Oxygen',
  type: InventoryItemType.UNLIMITED,
  frequentOrder: 1,
};

const bandages: MaterialItem = {
  ...gloves,
  id: 'mat-bandages',
  namePt: 'Ligaduras',
  nameEn: 'Bandages',
  isFrequent: false,
};

function respondByPath(overrides: { search?: MaterialItem[]; knownBarcode?: MaterialItem } = {}) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/material-items?frequent=true')) {
      return Promise.resolve({ data: [gloves, oxygen] });
    }
    if (path.startsWith('/material-items/by-barcode/')) {
      const code = decodeURIComponent(path.split('/by-barcode/')[1]);
      if (overrides.knownBarcode && code === 'KNOWN-CODE') return Promise.resolve(overrides.knownBarcode);
      return Promise.reject(new Error('not found'));
    }
    if (path.startsWith('/material-items?q=')) {
      return Promise.resolve({ data: overrides.search ?? [] });
    }
    return Promise.reject(new Error(`unexpected path: ${path}`));
  });
}

function Wrapper({ locale = 'pt' as Locale }) {
  const [value, setValue] = useState<MaterialLine[]>([]);
  return <MaterialPicker value={value} onChange={setValue} locale={locale} />;
}

function renderPicker(locale: Locale = 'pt') {
  const i18nProvider = polyglotI18nProvider(messages, locale);
  return render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <Wrapper locale={locale} />
    </AdminContext>,
  );
}

beforeEach(() => {
  mockCameraSupported.mockReturnValue(true);
  respondByPath({ knownBarcode: gloves });
});

describe('favourites', () => {
  it('shows the pinned favourites, locale-aware, ordered by frequentOrder', async () => {
    renderPicker();
    expect(await screen.findByText('Luvas')).toBeInTheDocument();
    expect(screen.getByText('Oxigénio')).toBeInTheDocument();
  });

  it('renders the English name when the locale is en', async () => {
    renderPicker('en');
    expect(await screen.findByText('Gloves')).toBeInTheDocument();
  });

  it('adds 1 on the first tap of a COUNTABLE favourite', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(await screen.findByText('Luvas'));

    expect(await screen.findAllByText('1')).not.toHaveLength(0);
  });

  it('adds 1 more on a second tap', async () => {
    const user = userEvent.setup();
    renderPicker();
    const tile = await screen.findByText('Luvas');

    await user.click(tile);
    await screen.findAllByText('1');
    await user.click(tile);

    await waitFor(() => expect(screen.queryAllByText('1')).toHaveLength(0));
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('toggles an UNLIMITED favourite on and off, with no quantity ever shown', async () => {
    const user = userEvent.setup();
    renderPicker();
    const tile = await screen.findByText('Oxigénio');

    await user.click(tile);
    expect(await screen.findAllByText('Registado')).not.toHaveLength(0);

    await user.click(tile);
    await waitFor(() => expect(screen.queryByText('Registado')).not.toBeInTheDocument());
  });
});

describe('search', () => {
  it('queries the catalogue as the crew types, and adds the tapped result', async () => {
    respondByPath({ search: [bandages], knownBarcode: gloves });
    const user = userEvent.setup();
    renderPicker();
    await screen.findByText('Luvas');

    await user.type(screen.getByPlaceholderText('Procurar material…'), 'liga');

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(`/material-items?q=${encodeURIComponent('liga')}`),
    );
    expect(await screen.findByText('Ligaduras')).toBeInTheDocument();

    await user.click(screen.getByText('Ligaduras'));
    expect(await screen.findByText('pcs')).toBeInTheDocument(); // the line's unit, in the lines list
  });
});

describe('barcode scan', () => {
  it('adds the item on a known code, exactly like tapping its tile', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByLabelText('Ler código de barras'));

    await user.click(screen.getByText('fire-detect-known'));

    // Two "Luvas": the favourite tile and the new lines-list row.
    expect(await screen.findAllByText('Luvas')).toHaveLength(2);
  });

  it('shows a clear message and re-focuses search on an unknown code', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByLabelText('Ler código de barras'));

    await user.click(screen.getByText('fire-detect-unknown'));

    expect(await screen.findByText('Nenhum material encontrado para este código.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText('Procurar material…')).toHaveFocus());
  });

  it('falls back to search on a denied camera permission', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByLabelText('Ler código de barras'));

    await user.click(screen.getByText('fire-denied'));

    expect(await screen.findByText('Sem acesso à câmara. Utilize a pesquisa.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText('Procurar material…')).toHaveFocus());
  });

  it('hides the scan button rather than throwing when the browser has no camera API', async () => {
    mockCameraSupported.mockReturnValue(false);
    renderPicker();

    await screen.findByText('Luvas');
    expect(screen.queryByLabelText('Ler código de barras')).not.toBeInTheDocument();
  });
});

describe('lines list', () => {
  it('says so when nothing has been added yet', async () => {
    renderPicker();
    expect(await screen.findByText('Ainda não foi registado nenhum material.')).toBeInTheDocument();
  });

  it('removes a line', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(await screen.findByText('Luvas'));
    await screen.findAllByText('1');

    await user.click(screen.getByLabelText('Remover'));

    expect(await screen.findByText('Ainda não foi registado nenhum material.')).toBeInTheDocument();
  });
});
