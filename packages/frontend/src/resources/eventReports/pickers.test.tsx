import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { EventReportType, VictimDestinationKind } from '@redinfo/shared';
import { LocalityPicker, loadRecentLocalities, localityLabel } from './LocalityPicker';
import { HospitalPicker } from './HospitalPicker';
import { apiFetch } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { messages } from '../../i18n/i18nProvider';

// Pinned to 'pt' rather than the app's own locale-detecting singleton: jsdom
// reports `en-US`, which would otherwise render these dialogs in English and
// break every Portuguese assertion below.
const i18nProvider = polyglotI18nProvider(messages, 'pt');

vi.mock('../../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn() }));
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: vi.fn(() => true) }));

const mockApiFetch = apiFetch as unknown as Mock;

const COIMBRA = {
  id: 'mun-coimbra',
  ineCode: '0603',
  name: 'Coimbra',
  district: 'Coimbra',
  latitude: 40.2111,
  longitude: -8.4289,
};

const TAVEIRO = {
  id: 'loc-taveiro',
  name: 'Taveiro',
  municipalityId: COIMBRA.id,
  municipality: COIMBRA,
};
const CERNACHE = {
  id: 'loc-cernache',
  name: 'Cernache',
  municipalityId: COIMBRA.id,
  municipality: COIMBRA,
};

const hospital = (
  id: string,
  name: string,
  distanceKm: number | null,
  approximate = false,
) => ({
  id,
  name,
  municipalityId: COIMBRA.id,
  municipality: COIMBRA,
  latitude: null,
  longitude: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  distanceKm,
  approximate,
});

beforeEach(() => {
  window.localStorage.clear();
  (useIsMobile as unknown as Mock).mockReturnValue(true);
});

// ── Where the call came from ────────────────────────────────────────────────────

describe('localityLabel', () => {
  it('reads as locality, concelho, distrito', () => {
    expect(localityLabel(TAVEIRO)).toBe('Taveiro · Coimbra · Coimbra');
  });

  it('falls back to the bare name when the municipality was not loaded', () => {
    expect(localityLabel({ ...TAVEIRO, municipality: undefined })).toBe('Taveiro');
  });

  it('is empty for nothing chosen, rather than the word "undefined"', () => {
    expect(localityLabel(null)).toBe('');
    expect(localityLabel(undefined)).toBe('');
  });
});

describe('the locality picker', () => {
  const onPick = vi.fn();

  beforeEach(() => {
    onPick.mockReset();
    mockApiFetch.mockResolvedValue([TAVEIRO, CERNACHE]);
  });

  const open = () =>
    render(
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <LocalityPicker open onClose={() => undefined} onPick={onPick} />
      </AdminContext>,
    );

  it('offers a starting list before anything is typed', async () => {
    open();

    // An empty box waiting to be typed into is worse than a starting point.
    expect(await screen.findByText('Taveiro')).toBeInTheDocument();
    expect(screen.getByText('Cernache')).toBeInTheDocument();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/localities?q='));
  });

  it('searches what was typed, folding accents out of it', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByText('Taveiro');

    await user.type(screen.getByPlaceholderText(/procurar localidade/i), 'são');

    // Debounced, then sent url-encoded exactly as typed — the folding is the
    // server's job, and it holds the index that matches.
    await waitFor(
      () =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          `/localities?q=${encodeURIComponent('são')}`,
        ),
      { timeout: 2000 },
    );
  });

  it('shows the concelho and distrito under each result', async () => {
    open();
    expect(await screen.findAllByText('Coimbra · Coimbra')).not.toHaveLength(0);
  });

  it('hands back the locality that was tapped, and remembers it', async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByText('Taveiro'));

    expect(onPick).toHaveBeenCalledWith(TAVEIRO);
    expect(loadRecentLocalities()[0].id).toBe(TAVEIRO.id);
  });

  it('offers what was used last, so a crew on its own patch never types', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByText('Taveiro'));

    // Re-opened: the recent chip is there, above the search results.
    render(
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <LocalityPicker open onClose={() => undefined} onPick={onPick} />
      </AdminContext>,
    );
    expect(await screen.findByText('RECENTES')).toBeInTheDocument();
  });

  it('says so when a search finds nothing, rather than showing an empty box', async () => {
    mockApiFetch.mockResolvedValue([]);
    open();

    expect(await screen.findByText('Nada encontrado.')).toBeInTheDocument();
  });

  it('survives the search failing', async () => {
    mockApiFetch.mockRejectedValue(new Error('offline'));
    open();

    expect(await screen.findByText('offline')).toBeInTheDocument();
  });
});

// ── Where the victim went ──────────────────────────────────────────────────────

describe('the hospital picker', () => {
  const onPick = vi.fn();

  beforeEach(() => {
    onPick.mockReset();
    mockApiFetch.mockResolvedValue([
      hospital('near', 'CHUC — Hospital Geral', 6, true),
      hospital('far', 'Hospital da Figueira', 38),
    ]);
  });

  const open = (
    locality: typeof TAVEIRO | null = TAVEIRO,
    reportType: EventReportType = EventReportType.LOCAL_SUPPORT,
  ) =>
    render(
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <HospitalPicker
          open
          locality={locality}
          reportType={reportType}
          onClose={() => undefined}
          onPick={onPick}
        />
      </AdminContext>,
    );

  it('asks for the list ordered from the report’s locality', async () => {
    open();
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/hospitals/picker?localityId=${TAVEIRO.id}`,
      ),
    );
  });

  it('asks for a plain list when no locality has been chosen yet', async () => {
    open(null);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/hospitals/picker'));
  });

  it('shows the distance, in the order the API gave them', async () => {
    open();

    // The near one is measured from the concelho centroid, so it is marked.
    expect(await screen.findByText('≈ 6 km')).toBeInTheDocument();
    expect(screen.getByText('38 km')).toBeInTheDocument();
  });

  it('marks an approximate distance, rather than implying precision', async () => {
    open();
    // Measured from the concelho centroid, not the hospital's own position —
    // and the exact one carries no marker.
    expect(await screen.findByText('≈ 6 km')).toBeInTheDocument();
    expect(screen.getByText('38 km')).toBeInTheDocument();
    expect(screen.queryByText('≈ 38 km')).not.toBeInTheDocument();
  });

  it('hands back the hospital that was tapped', async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByText('CHUC — Hospital Geral'));

    expect(onPick).toHaveBeenCalledWith({
      destinationKind: VictimDestinationKind.HOSPITAL,
      destinationHospitalId: 'near',
      hospitalName: 'CHUC — Hospital Geral',
    });
  });

  it('offers every way a call ends with nobody transported', async () => {
    open();

    for (const label of [
      'Tratado no local',
      'Recusou transporte',
      'Óbito no local',
      'Cancelado',
    ]) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('drops "treated on scene" for an emergency — it is not a valid outcome there', async () => {
    open(TAVEIRO, EventReportType.EMERGENCY);

    for (const label of ['Recusou transporte', 'Óbito no local', 'Cancelado']) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Tratado no local' })).not.toBeInTheDocument();
  });

  it('hands back an outcome with no hospital attached', async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole('button', { name: 'Recusou transporte' }));

    expect(onPick).toHaveBeenCalledWith({
      destinationKind: VictimDestinationKind.REFUSED_TRANSPORT,
      destinationHospitalId: null,
    });
  });

  it('filters the list as the crew types, without another round trip', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByText('CHUC — Hospital Geral');
    const callsBefore = mockApiFetch.mock.calls.length;

    await user.type(screen.getByPlaceholderText(/procurar hospital/i), 'figueira');

    await waitFor(() =>
      expect(screen.queryByText('CHUC — Hospital Geral')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Hospital da Figueira')).toBeInTheDocument();
    expect(mockApiFetch.mock.calls).toHaveLength(callsBefore);
  });

  it('matches accents typed without them', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue([hospital('a', 'Hospital de Évora', 120)]);
    open();
    await screen.findByText('Hospital de Évora');

    await user.type(screen.getByPlaceholderText(/procurar hospital/i), 'evora');

    expect(screen.getByText('Hospital de Évora')).toBeInTheDocument();
  });

  it('hides the "no transport" buttons for a use that is not a victim\'s destination', async () => {
    render(
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <HospitalPicker
          open
          locality={TAVEIRO}
          reportType={EventReportType.EMERGENCY}
          hospitalsOnly
          title="Hospital de origem"
          onClose={() => undefined}
          onPick={onPick}
        />
      </AdminContext>,
    );

    expect(await screen.findByText('CHUC — Hospital Geral')).toBeInTheDocument();
    expect(screen.getByText('Hospital de origem')).toBeInTheDocument();
    expect(screen.queryByText('SEM TRANSPORTE')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recusou transporte' })).not.toBeInTheDocument();
  });
});
