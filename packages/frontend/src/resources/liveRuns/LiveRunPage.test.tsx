import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { EventLocationType, Gender, LiveRunState, VictimDestinationKind } from '@redinfo/shared';
import { renderMobile } from '../../test/renderMobile';
import { apiFetch } from '../../api';
import { LiveRunPage } from './LiveRunPage';
import { emptyRun } from './liveRun';
import { resetLiveRunDb, saveRun } from './liveRunDb';

vi.mock('../../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn() }));

const mockApiFetch = apiFetch as unknown as Mock;

const ADDRESS = 'R. Dr. Manuel Rodrigues nº 12, 3º Esq.';

/**
 * A fresh run id per test.
 *
 * Shared ids leak between cases here in a way that is genuinely hard to see: the
 * debounced write from one test's typing lands a quarter of a second later, into
 * the next test's database, under the same key. A unique id per case makes the
 * bleed impossible rather than unlikely.
 */
let runId = '';
let runCounter = 0;

const TAVEIRO = {
  id: 'loc-taveiro',
  name: 'Taveiro',
  municipalityId: 'mun-coimbra',
  municipality: {
    id: 'mun-coimbra',
    ineCode: '0603',
    name: 'Coimbra',
    district: 'Coimbra',
    latitude: 40.2111,
    longitude: -8.4289,
  },
};

const AMBULANCE = {
  id: 'veh-1',
  licensePlate: 'AA-12-BC',
  numeroCauda: 'Amb. 04',
  vehicleType: 'EMERGENCY',
};

const HOSPITAL = {
  id: 'hosp-braga',
  name: 'Hospital de Braga',
  municipalityId: 'mun-braga',
  municipality: {
    id: 'mun-braga',
    ineCode: '0303',
    name: 'Braga',
    district: 'Braga',
    latitude: 41.55,
    longitude: -8.42,
  },
  latitude: 41.5505,
  longitude: -8.4201,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  distanceKm: null,
  approximate: false,
};

/** Every read the shell makes, answered by path. */
function respondWith(overrides: Record<string, unknown> = {}) {
  mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    if (path.endsWith('/close')) {
      return Promise.resolve(
        overrides.close ?? {
          run: { closedAt: new Date().toISOString(), state: LiveRunState.CLOSED },
          report: { id: 'rep-new' },
        },
      );
    }
    if (options?.method === 'PUT') {
      return Promise.resolve({ stale: false, run: { ...(overrides.stored ?? {}), crew: [] } });
    }
    if (path === '/live-runs/settings') {
      return Promise.resolve(
        overrides.settings ?? {
          baseName: 'Delegação de Campo',
          baseLatitude: 41.59,
          baseLongitude: -8.61,
          coduDadosPhone: '+351 800 203 264',
        },
      );
    }
    if (path === '/live-runs') return Promise.resolve([]);
    if (path.startsWith('/event-reports/crew-candidates')) return Promise.resolve([]);
    if (path.startsWith('/event-reports/crew-suggestion')) {
      return Promise.resolve({ suggested: null, recent: [] });
    }
    if (path.startsWith('/vehicles')) return Promise.resolve({ data: [AMBULANCE] });
    if (path.startsWith('/hospitals/picker')) {
      return Promise.resolve((overrides.hospitals as unknown[]) ?? []);
    }
    if (path.startsWith('/hospitals')) return Promise.resolve({ data: [] });
    if (path.startsWith('/localities/')) return Promise.resolve(TAVEIRO);
    return Promise.resolve(overrides.fallback ?? {});
  });
}

/** A run already on the device, in whatever state the case needs. */
const seed = async (overrides: Record<string, unknown> = {}) => {
  const run = {
    ...emptyRun(runId, new Date('2026-08-22T20:11:00.000Z')),
    externalReference: '2608 4471',
    chiefComplaint: 'Queda com traumatismo',
    locationType: EventLocationType.HOME,
    localityId: TAVEIRO.id,
    victimGender: Gender.FEMALE,
    victimAge: 67,
    identity: { occurrenceAddress: ADDRESS },
    ...overrides,
  };
  await saveRun(run as never);
  return run;
};

const renderRun = (screenName: string) =>
  renderMobile(
    <Routes>
      <Route path="/live/:runId/:screen" element={<LiveRunPage />} />
    </Routes>,
    { route: `/live/${runId}/${screenName}` },
  );

beforeEach(() => {
  runCounter += 1;
  runId = `run-under-test-${runCounter}`;
  globalThis.indexedDB = new IDBFactory();
  resetLiveRunDb();
  window.localStorage.clear();
  respondWith();
  // jsdom has neither, and neither do some of the WebViews this ships to.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('the bottom bar', () => {
  it('names the transition the run is up to', async () => {
    await seed();
    renderRun('intake');

    // Read off `nextStamp`, so this is the state table showing through.
    expect(await screen.findByRole('button', { name: 'A CAMINHO' })).toBeInTheDocument();
  });

  it('stamps and moves the run on', async () => {
    const user = userEvent.setup();
    await seed();
    renderRun('intake');

    await user.click(await screen.findByRole('button', { name: 'A CAMINHO' }));

    expect(
      await screen.findByRole('button', { name: 'CHEGUEI AO LOCAL' }),
    ).toBeInTheDocument();
  });

  it('offers a correction rather than overwriting a time already marked', async () => {
    const user = userEvent.setup();
    await seed({ activationAt: '2026-08-22T20:14:00.000Z' });
    renderRun('intake');

    // Tapping an already-stamped transition must not silently move the moment.
    const button = await screen.findByRole('button', { name: /Alterar/ });
    await user.click(button);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('leads with the stamp for a run stood down on scene', async () => {
    await seed({
      state: LiveRunState.ON_SCENE,
      activationAt: '2026-08-22T20:14:00.000Z',
      sceneArrivalAt: '2026-08-22T20:26:00.000Z',
    });
    renderRun('scene');

    expect(await screen.findByRole('button', { name: 'SAÍDA DO LOCAL' })).toBeInTheDocument();
  });
});

describe('browsing back to an earlier screen', () => {
  /**
   * The Android back gesture moves the URL's `:screen` segment without ever
   * touching `run.state` — `renderRun` with an earlier screen than the run's
   * real one is exactly what that leaves behind, with no gesture needed to
   * reproduce it.
   */
  const seedOnTransport = () =>
    seed({
      state: LiveRunState.EN_ROUTE_TO_HOSPITAL,
      activationAt: '2026-08-22T20:14:00.000Z',
      sceneArrivalAt: '2026-08-22T20:26:00.000Z',
      sceneDepartureAt: '2026-08-22T20:40:00.000Z',
    });

  it('offers the correction for the screen on display, not the live action for the run', async () => {
    await seedOnTransport();
    renderRun('scene');

    // Not "CHEGADA AO HOSPITAL" — that belongs to `transport`, which is not
    // what is on screen, however far the run has actually got.
    expect(screen.queryByRole('button', { name: 'CHEGADA AO HOSPITAL' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Alterar/ })).toBeInTheDocument();
  });

  it('offers a way back to where the run really is, and only to screens already visited', async () => {
    const user = userEvent.setup();
    await seedOnTransport();
    renderRun('scene');

    // Enroute and scene are visited; transport is the real screen. Closing
    // has never been seen and must not be offered.
    expect(await screen.findByRole('tab', { name: 'Ativação' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Fecho' })).not.toBeInTheDocument();

    await user.click(await screen.findByRole('tab', { name: 'Transporte' }));

    // Landed back on the run's real screen and its real action.
    expect(await screen.findByRole('button', { name: 'CHEGADA AO HOSPITAL' })).toBeInTheDocument();
  });
});

describe('the handoff into Maps', () => {
  it('is a real anchor, with the address encoded', async () => {
    await seed();
    renderRun('intake');

    const link = await screen.findByRole('link', { name: /NAVEGAR/ });
    // An anchor and not a `window.open`: Chrome on Android keeps the app alive
    // behind `target="_blank"`, so the run, the timers and the wake lock survive
    // the trip to Maps.
    expect(link).toHaveAttribute('target', '_blank');

    const url = new URL(link.getAttribute('href')!);
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('travelmode')).toBe('driving');
    expect(url.searchParams.get('destination')).toContain(ADDRESS);
  });

  it('is absent with nowhere to go, and the stamp still works', async () => {
    const user = userEvent.setup();
    await seed({ identity: {}, localityId: null });
    renderRun('intake');

    await screen.findByRole('button', { name: 'A CAMINHO' });
    expect(screen.queryByRole('link', { name: /NAVEGAR/ })).not.toBeInTheDocument();

    // Navigation is a convenience; the timestamp is the record.
    await user.click(screen.getByRole('button', { name: 'A CAMINHO' }));
    expect(
      await screen.findByRole('button', { name: 'CHEGUEI AO LOCAL' }),
    ).toBeInTheDocument();
  });

  it('offers the same handoff to the chosen hospital, on the transport screen', async () => {
    respondWith({ hospitals: [HOSPITAL] });
    await seed({
      state: LiveRunState.EN_ROUTE_TO_HOSPITAL,
      activationAt: '2026-08-22T20:14:00.000Z',
      sceneArrivalAt: '2026-08-22T20:26:00.000Z',
      sceneDepartureAt: '2026-08-22T20:40:00.000Z',
      destinationKind: VictimDestinationKind.HOSPITAL,
      destinationHospitalId: HOSPITAL.id,
    });
    renderRun('transport');

    const link = await screen.findByRole('link', { name: /NAVEGAR/ });
    const url = new URL(link.getAttribute('href')!);
    // Precise coordinates, not the occurrence address — the hospital has its
    // own position, so there is nothing to geocode.
    expect(url.searchParams.get('destination')).toBe(`${HOSPITAL.latitude},${HOSPITAL.longitude}`);
  });

  it('is absent from the transport screen until a hospital is chosen', async () => {
    await seed({
      state: LiveRunState.EN_ROUTE_TO_HOSPITAL,
      activationAt: '2026-08-22T20:14:00.000Z',
      sceneArrivalAt: '2026-08-22T20:26:00.000Z',
      sceneDepartureAt: '2026-08-22T20:40:00.000Z',
    });
    renderRun('transport');

    await screen.findByRole('button', { name: 'CHEGADA AO HOSPITAL' });
    expect(screen.queryByRole('link', { name: /NAVEGAR/ })).not.toBeInTheDocument();
  });

  it('does not offer "treated on scene" — a live run is always an emergency', async () => {
    const user = userEvent.setup();
    respondWith({ hospitals: [HOSPITAL] });
    await seed({
      state: LiveRunState.EN_ROUTE_TO_HOSPITAL,
      activationAt: '2026-08-22T20:14:00.000Z',
      sceneArrivalAt: '2026-08-22T20:26:00.000Z',
      sceneDepartureAt: '2026-08-22T20:40:00.000Z',
    });
    renderRun('transport');

    await user.click(await screen.findByRole('button', { name: 'Procurar' }));
    expect(await screen.findByText('Recusou transporte')).toBeInTheDocument();
    expect(screen.queryByText('Tratado no local')).not.toBeInTheDocument();
  });
});

describe('the top bar', () => {
  it('shows the CODU number, which is what tells two runs apart', async () => {
    await seed();
    renderRun('intake');

    expect(await screen.findByText('2608 4471')).toBeInTheDocument();
  });

  it('keeps everything destructive out of thumb reach', async () => {
    const user = userEvent.setup();
    await seed();
    renderRun('intake');

    // Not on the screen at all until the overflow is opened: the bottom half is
    // thumb-sweep territory, and abandoning a run must never be one mis-tap away
    // from "cheguei ao local".
    expect(screen.queryByText(/Abandonar/)).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /Mais/ }));
    expect(await screen.findByText(/Abandonar/)).toBeInTheDocument();
  });

  it('offers the CODU Dados line as a dialable link', async () => {
    const user = userEvent.setup();
    await seed();
    renderRun('intake');

    await user.click(await screen.findByRole('button', { name: /Mais/ }));

    const dial = await screen.findByRole('menuitem', { name: /CODU DADOS/ });
    // Spaces stripped: some Android diallers stop at the first fragment.
    expect(dial).toHaveAttribute('href', 'tel:+351800203264');
  });

  it('says where the data is, politely', async () => {
    await seed();
    renderRun('intake');

    // The crew's question is never "is the network up" — it is "will I lose
    // this" — and it must not interrupt a screen reader mid-vital.
    const region = await screen.findByText(/Gravado no dispositivo|Sincronizado|Sem rede/);
    expect(region.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('offers a way back that undoes the last stamp', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await seed({ state: LiveRunState.EN_ROUTE, activationAt: '2026-08-22T20:14:00.000Z' });
    renderRun('enroute');

    await user.click(await screen.findByRole('button', { name: /Mais/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Voltar/ }));

    // Back on `INTAKE`, with `activationAt` cleared: the bar offers the
    // original transition again rather than "Alterar".
    expect(await screen.findByRole('button', { name: 'A CAMINHO' })).toBeInTheDocument();
  });

  it('says nothing to undo, without asking, when going back is declined', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await seed({ state: LiveRunState.EN_ROUTE, activationAt: '2026-08-22T20:14:00.000Z' });
    renderRun('enroute');

    await user.click(await screen.findByRole('button', { name: /Mais/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Voltar/ }));

    // Declined: the run stays exactly where it was.
    expect(await screen.findByRole('button', { name: 'CHEGUEI AO LOCAL' })).toBeInTheDocument();
  });

  it('offers nothing to undo at the first step', async () => {
    const user = userEvent.setup();
    await seed();
    renderRun('intake');

    await user.click(await screen.findByRole('button', { name: /Mais/ }));
    expect(screen.queryByRole('menuitem', { name: /Voltar/ })).not.toBeInTheDocument();
  });

  it('offers nothing to undo once the run is closed', async () => {
    const user = userEvent.setup();
    // `CLOSED` is reachable from every stage, not only from `AT_HOSPITAL` — so
    // there is no single "previous" state Back could trust once it is reached.
    await seed({ state: LiveRunState.CLOSED, availableAt: '2026-08-22T21:00:00.000Z' });
    renderRun('closing');

    await user.click(await screen.findByRole('button', { name: /Mais/ }));
    expect(screen.queryByRole('menuitem', { name: /Voltar/ })).not.toBeInTheDocument();
  });
});

describe('the scene screen', () => {
  it('asks for the type of location, confirmed on arrival rather than at intake', async () => {
    await seed({ state: LiveRunState.ON_SCENE, locationType: null });
    renderRun('scene');

    expect(await screen.findByRole('button', { name: 'Habitação' })).toBeInTheDocument();
  });

  it('asks for the victim’s home address once the scene turns out not to be it', async () => {
    const user = userEvent.setup();
    await seed({ state: LiveRunState.ON_SCENE, locationType: EventLocationType.HOME });
    renderRun('scene');

    // Not asked while the scene is still the victim's own home.
    expect(screen.queryByLabelText('Residência')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Via pública' }));

    expect(await screen.findByLabelText('Residência')).toBeInTheDocument();
    expect(screen.getByText('Localidade da residência')).toBeInTheDocument();
  });

  it('no longer offers a Verbete slot — that moved to the report editor', async () => {
    await seed({ state: LiveRunState.ON_SCENE });
    renderRun('scene');

    await screen.findByText('Fotografias');
    expect(screen.queryByText('Verbete de Socorro')).not.toBeInTheDocument();
  });

  it('warns about an SNS number that is not nine digits, without blocking', async () => {
    const user = userEvent.setup();
    await seed({ state: LiveRunState.ON_SCENE });
    renderRun('scene');

    const field = await screen.findByLabelText(/utente/i);
    await user.type(field, '12345');

    expect(await screen.findByText(/nove dígitos/)).toBeInTheDocument();
    // Still the stamp, not a disabled control: the run goes on.
    expect(screen.getByRole('button', { name: 'SAÍDA DO LOCAL' })).toBeEnabled();
  });
});

describe('the closing screen', () => {
  it('separates what blocks the close from what is merely unfinished', async () => {
    await seed({
      state: LiveRunState.AT_HOSPITAL,
      externalReference: null,
      activationAt: '2026-08-22T20:14:00.000Z',
    });
    renderRun('closing');

    // A blocker is something a report cannot exist without; a warning is
    // something the crew finishes on the report page.
    expect(await screen.findByText(/Escreve o nº CODU/)).toBeInTheDocument();
    expect(screen.getByText(/Não há sinais vitais registados/)).toBeInTheDocument();
  });

  it('takes the account of the call, in plain text', async () => {
    const user = userEvent.setup();
    await seed({ state: LiveRunState.AT_HOSPITAL, activationAt: '2026-08-22T20:14:00.000Z' });
    renderRun('closing');

    const notes = await screen.findByLabelText('Relato operacional');
    await user.type(notes, 'Tensão < 90 e pele fria.');

    // Plain text and not the rich editor: nobody applies a bullet list
    // one-handed at 3am, and the `<` has to survive to the report rather than
    // arriving as a broken tag.
    expect(notes).toHaveValue('Tensão < 90 e pele fria.');
  });

  it('names every unmarked time rather than leaving the row blank', async () => {
    await seed({ state: LiveRunState.AT_HOSPITAL, activationAt: '2026-08-22T20:14:00.000Z' });
    renderRun('closing');

    const chronology = (await screen.findByText('Cronologia')).closest('div')!;
    expect(within(chronology).getAllByText('não marcado').length).toBeGreaterThan(0);
  });
});

describe('platform features that may not be there', () => {
  it('still lets the crew type when the phone cannot dictate', async () => {
    const user = userEvent.setup();
    delete (globalThis as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (globalThis as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    await seed({ state: LiveRunState.ON_SCENE });
    renderRun('assessment');

    // Absent, not disabled: a control that does nothing is worse than none.
    expect(screen.queryByRole('button', { name: /Ditar/ })).not.toBeInTheDocument();

    const field = await screen.findByLabelText(/Circunstâncias/);
    await user.type(field, 'Queda da própria altura');
    expect(field).toHaveValue('Queda da própria altura');
  });

  it('runs on when the wake lock is refused', async () => {
    const request = vi.fn(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    await seed();
    renderRun('intake');

    // A managed device can refuse it outright. The run must not care.
    expect(await screen.findByRole('button', { name: 'A CAMINHO' })).toBeInTheDocument();
    await waitFor(() => expect(request).toHaveBeenCalled());
  });

  it('keeps the assessment rail usable with no IntersectionObserver', async () => {
    const user = userEvent.setup();
    const original = globalThis.IntersectionObserver;
    // An old Android WebView. The rail falls back to last-tapped, which is also
    // the real behaviour there rather than a broken one.
    // @ts-expect-error deliberately removing a platform global
    delete globalThis.IntersectionObserver;

    try {
      await seed({ state: LiveRunState.ON_SCENE });
      renderRun('assessment');

      await user.click(await screen.findByRole('tab', { name: 'C' }));
      expect(screen.getByRole('tab', { name: 'C' })).toHaveAttribute('aria-selected', 'true');
    } finally {
      globalThis.IntersectionObserver = original;
    }
  });
});

describe('the assessment screen', () => {
  it('has a way back to the scene screen', async () => {
    const user = userEvent.setup();
    await seed({ state: LiveRunState.ON_SCENE });
    renderRun('assessment');

    await user.click(await screen.findByRole('button', { name: /Voltar — No local/ }));

    // Back on Scene: its own heading, with the identity fields on it.
    expect(await screen.findByLabelText('Nome da vítima')).toBeInTheDocument();
  });
});

describe('the assessment grid', () => {
  /** A run with one set of observations already open, stamped on scene. */
  const withAssessment = () =>
    seed({
      state: LiveRunState.ON_SCENE,
      activationAt: '2026-08-22T20:14:00.000Z',
      sceneArrivalAt: '2026-08-22T20:26:00.000Z',
      capture: { assessments: [{ takenAt: '2026-08-22T20:31:00.000Z' }] },
    });

  it('opens a set of observations when there are none', async () => {
    const user = userEvent.setup();
    await seed({ state: LiveRunState.ON_SCENE });
    renderRun('assessment');

    await user.click(await screen.findByRole('button', { name: /Nova avaliação/ }));

    expect(await screen.findByText(/Avaliação 1 de 1/)).toBeInTheDocument();
  });

  it('reads a comma as a decimal point', async () => {
    const user = userEvent.setup();
    await withAssessment();
    renderRun('assessment');

    // A pt-PT keyboard offers no other separator, and `type="number"` would turn
    // this into an empty value.
    const temperature = await screen.findByLabelText('Temperatura');
    await user.type(temperature, '36,8');
    expect(temperature).toHaveValue('36,8');
    expect(temperature).toHaveAttribute('inputmode', 'decimal');
  });

  it('captions an implausible reading without refusing it', async () => {
    const user = userEvent.setup();
    await withAssessment();
    renderRun('assessment');

    await user.type(await screen.findByLabelText('SpO₂'), '71');

    // A real SpO₂ of 71 has to be recordable — the whole point of writing a
    // vital down is that it is abnormal.
    expect(await screen.findByText(/Valor invulgar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SAÍDA DO LOCAL' })).toBeEnabled();
  });

  it('refuses a value outside the possible range, in words', async () => {
    const user = userEvent.setup();
    await withAssessment();
    renderRun('assessment');

    await user.type(await screen.findByLabelText('SpO₂'), '710');

    expect(await screen.findByText(/Fora do intervalo possível/)).toBeInTheDocument();
  });

  it('keeps two sets of observations apart', async () => {
    const user = userEvent.setup();
    await seed({
      state: LiveRunState.ON_SCENE,
      capture: {
        assessments: [
          { takenAt: '2026-08-22T20:31:00.000Z', spo2: 97 },
          { takenAt: '2026-08-22T20:52:00.000Z', spo2: 91 },
        ],
      },
    });
    renderRun('assessment');

    // "What were the vitals when we arrived" must not be overwritten by "what
    // were they when we handed over" — which is why these are a list at all.
    expect(await screen.findByLabelText('SpO₂')).toHaveValue('97');
    await user.click(screen.getByRole('button', { name: /Seguinte/ }));
    expect(await screen.findByLabelText('SpO₂')).toHaveValue('91');
  });
});
