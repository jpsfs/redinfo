import { useEffect, useRef } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import { MemoryRouter } from 'react-router-dom';
import {
  EventLocationType,
  EventReportType,
  Gender,
  VictimDestinationKind,
} from '@redinfo/shared';
import { EventReportEditor } from './EventReportEditor';
import { useEventReportDraft } from './useEventReportDraft';
import { apiFetch } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { loadDraft } from './reportDraft';

vi.mock('../../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn() }));
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: vi.fn(() => true) }));

const mockApiFetch = apiFetch as unknown as Mock;
const mockUseIsMobile = useIsMobile as unknown as Mock;

const TIAGO = { id: 'u-tiago', firstName: 'Tiago', lastName: 'Lourenço', isDriver: true };
const AMBULANCE = {
  id: 'veh-1',
  licensePlate: 'AA-12-BC',
  numeroCauda: 'Amb. 04',
  vehicleType: 'EMERGENCY',
};
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
const CHUC = {
  id: 'hosp-chuc',
  name: 'CHUC — Hospital Geral',
  municipalityId: 'mun-coimbra',
  latitude: null,
  longitude: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  distanceKm: 6,
  approximate: true,
};

const SHIFT = {
  scheduleId: 'sch-1',
  date: '2026-08-22',
  slot: 1,
  label: '20:00–24:00',
  windowLabel: 'Emergency - August',
  startMinute: 1200,
  endMinute: 1440,
  vehiclesNeeded: 1,
  crew: [
    { userId: TIAGO.id, firstName: 'Tiago', lastName: 'Lourenço', roleName: 'Driver', isDriver: true },
    { userId: 'u-ana', firstName: 'Ana', lastName: 'Ribeiro', roleName: 'Team Leader', isDriver: false },
  ],
};

/** Every read the form makes, answered by path. */
function respondWith(overrides: Record<string, unknown> = {}) {
  mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    if (options?.method === 'POST' || options?.method === 'PATCH') {
      return Promise.resolve({
        id: 'rep-new',
        type: EventReportType.EMERGENCY,
        number: 128,
        year: 2026,
        ...(overrides.saved as object),
      });
    }
    if (path.startsWith('/event-reports/crew-candidates')) return Promise.resolve([TIAGO]);
    if (path.startsWith('/event-reports/crew-suggestion')) {
      return Promise.resolve(overrides.suggestion ?? { suggested: SHIFT, recent: [] });
    }
    if (path.startsWith('/vehicles')) return Promise.resolve({ data: [AMBULANCE] });
    if (path.startsWith('/hospitals/picker')) return Promise.resolve([CHUC]);
    if (path.startsWith('/localities/')) return Promise.resolve(TAVEIRO);
    if (path.startsWith('/localities')) return Promise.resolve([TAVEIRO]);
    return Promise.resolve({});
  });
}

/** A coherent draft, so the save button is reachable. */
const COHERENT = {
  occurredOn: '2026-08-22',
  startedAt: new Date(2026, 7, 22, 20, 14).toISOString(),
  locationType: EventLocationType.HOME,
  localityId: TAVEIRO.id,
  externalReference: '2608 4471',
};

/**
 * Mounts the editor with a real draft hook, seeded through a test-only handle
 * so a case can put the form in the state it wants to assert about without
 * clicking through six screens to get there.
 */
function renderEditor({
  type = EventReportType.EMERGENCY,
  seed,
}: {
  type?: EventReportType;
  seed?: Record<string, unknown>;
} = {}) {
  const Harness = () => {
    const form = useEventReportDraft({ type });
    // Applied once on mount, so a case can start from the state it wants to
    // assert about rather than clicking through six screens to reach it.
    const seeded = useRef(false);
    useEffect(() => {
      if (seed && !seeded.current) {
        seeded.current = true;
        form.patch(seed as never);
      }
    }, [form, seed]);
    return <EventReportEditor form={form} />;
  };

  // `MemoryRouter` outside `AdminContext`: react-admin provides a router of its
  // own inside, and two nested routers is an error.
  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()}>
        <Harness />
      </AdminContext>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mockUseIsMobile.mockReturnValue(true);
  respondWith();
});

describe('the wizard on a phone', () => {
  it('starts on the first of seven steps for an emergency', async () => {
    renderEditor();

    expect(await screen.findByText('Quando e onde')).toBeInTheDocument();
    expect(screen.getByText('1 de 7')).toBeInTheDocument();
  });

  it('has six steps for a support report, and no chronology', async () => {
    renderEditor({ type: EventReportType.LOCAL_SUPPORT });

    expect(await screen.findByText('Quando e onde')).toBeInTheDocument();
    expect(screen.getByText('1 de 6')).toBeInTheDocument();
  });

  it('walks forward through the steps, naming each one', async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByText('Quando e onde');
    await user.click(screen.getByRole('button', { name: /seguinte/i }));

    // Emergencies stamp their chronology second, while the crew still
    // remembers it.
    expect(await screen.findByText(/^Tempos/)).toBeInTheDocument();
    expect(screen.getByText('2 de 7')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /seguinte/i }));
    expect(await screen.findByText('Equipa')).toBeInTheDocument();
  });

  it('goes to the crew step directly on a support report', async () => {
    const user = userEvent.setup();
    renderEditor({ type: EventReportType.LOCAL_SUPPORT });

    await screen.findByText('Quando e onde');
    await user.click(screen.getByRole('button', { name: /seguinte/i }));

    expect(await screen.findByText('Equipa')).toBeInTheDocument();
  });

  it('offers no Back button on the first step', async () => {
    renderEditor();
    await screen.findByText('Quando e onde');

    expect(screen.queryByRole('button', { name: /^voltar$/i })).not.toBeInTheDocument();
  });

  it('shows the draft-saved pill once anything has been typed', async () => {
    renderEditor({ seed: { localityId: TAVEIRO.id } });
    expect(await screen.findByText('Guardado')).toBeInTheDocument();
  });
});

describe('when and where', () => {
  it('stamps the current time into the start field', async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByText('Quando e onde');
    const before = (screen.getByLabelText('Início') as HTMLInputElement).value;

    await user.click(screen.getAllByRole('button', { name: 'Agora' })[1]);

    // The end was blank; stamping it fills it in.
    await waitFor(() =>
      expect((screen.getByLabelText('Fim') as HTMLInputElement).value).not.toBe(''),
    );
    expect((screen.getByLabelText('Início') as HTMLInputElement).value).toBe(before);
  });

  it('asks for the CODU number on an emergency and a plain reference otherwise', async () => {
    renderEditor();
    expect(await screen.findByText('Nº CODU')).toBeInTheDocument();

    renderEditor({ type: EventReportType.SALOP_SUPPORT });
    expect(await screen.findAllByText('Nº de referência')).not.toHaveLength(0);
  });

  it('offers all three kinds of location', async () => {
    renderEditor();
    await screen.findByText('Quando e onde');

    for (const label of ['Habitação', 'Via pública', 'Espaço público']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('shows the chosen locality with its concelho and distrito', async () => {
    renderEditor({ seed: { localityId: TAVEIRO.id } });

    expect(
      await screen.findByText('Taveiro · Coimbra · Coimbra'),
    ).toBeInTheDocument();
  });
});

describe('saving', () => {
  it('will not save while the report contradicts itself', async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByText('Quando e onde');
    for (let step = 0; step < 6; step += 1) {
      await user.click(screen.getByRole('button', { name: /seguinte|revisão/i }));
    }

    const save = await screen.findByRole('button', { name: /gravar relatório/i });
    expect(save).toBeDisabled();
  });

  it('posts the report and forgets the draft', async () => {
    const user = userEvent.setup();
    renderEditor({ seed: COHERENT });

    await screen.findByText('Guardado');
    for (let step = 0; step < 6; step += 1) {
      await user.click(screen.getByRole('button', { name: /seguinte|revisão/i }));
    }

    const save = await screen.findByRole('button', { name: /gravar relatório/i });
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/event-reports',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    const [, options] = mockApiFetch.mock.calls.find(
      ([path, opts]) => path === '/event-reports' && opts?.method === 'POST',
    )!;
    expect(options.body).toMatchObject({
      type: EventReportType.EMERGENCY,
      occurredOn: '2026-08-22',
      localityId: TAVEIRO.id,
      externalReference: '2608 4471',
    });

    // The device's copy exists only until the server has it.
    await waitFor(() => expect(loadDraft()).toBeNull());
  });

  it('warns about what is unfinished without standing in the way', async () => {
    const user = userEvent.setup();
    renderEditor({ seed: COHERENT });

    await screen.findByText('Guardado');
    for (let step = 0; step < 6; step += 1) {
      await user.click(screen.getByRole('button', { name: /seguinte|revisão/i }));
    }

    // Portuguese, from the warning code — not the rule's English sentence.
    expect(await screen.findByText('Falta a hora de fim.')).toBeInTheDocument();
    expect(screen.getByText(/completar depois/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gravar relatório/i })).toBeEnabled();
  });
});

describe('the crew step', () => {
  it('names the shift the rota says was on', async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByText('Quando e onde');
    await user.click(screen.getByRole('button', { name: /seguinte/i }));
    await user.click(screen.getByRole('button', { name: /seguinte/i }));

    expect(await screen.findByText(/20:00–24:00/)).toBeInTheDocument();
    expect(screen.getByText(/Emergency - August/)).toBeInTheDocument();
  });

  it('says nothing about a shift when the rota has none', async () => {
    respondWith({ suggestion: { suggested: null, recent: [] } });
    const user = userEvent.setup();
    renderEditor();

    await screen.findByText('Quando e onde');
    await user.click(screen.getByRole('button', { name: /seguinte/i }));
    await user.click(screen.getByRole('button', { name: /seguinte/i }));

    await screen.findByText('Equipa');
    expect(screen.queryByText(/20:00–24:00/)).not.toBeInTheDocument();
    // Picking by hand is an ordinary case, not an error.
    expect(screen.getByLabelText(/adicionar pessoa/i)).toBeInTheDocument();
  });
});

describe('the victim step', () => {
  it('offers one victim on an emergency', async () => {
    renderEditor({
      seed: {
        ...COHERENT,
        victims: [
          {
            gender: Gender.FEMALE,
            age: 67,
            destinationKind: VictimDestinationKind.HOSPITAL,
            destinationHospitalId: CHUC.id,
          },
        ],
      },
    });

    const user = userEvent.setup();
    await screen.findByText('Guardado');
    for (let step = 0; step < 4; step += 1) {
      await user.click(screen.getByRole('button', { name: /seguinte/i }));
    }

    expect(await screen.findByText('Vítima e transporte')).toBeInTheDocument();
    // The hospital's name, resolved from the id the draft holds.
    expect(screen.getByText(CHUC.name)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /adicionar vítima/i })).not.toBeInTheDocument();
  });

  it('lets a support report add more than one', async () => {
    const user = userEvent.setup();
    renderEditor({
      type: EventReportType.LOCAL_SUPPORT,
      seed: {
        ...COHERENT,
        externalReference: null,
        victims: [
          { gender: Gender.MALE, age: 20, destinationKind: VictimDestinationKind.TREATED_ON_SCENE },
        ],
      },
    });

    await screen.findByText('Guardado');
    for (let step = 0; step < 3; step += 1) {
      await user.click(screen.getByRole('button', { name: /seguinte/i }));
    }

    expect(await screen.findByText('Vítimas e transporte')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adicionar vítima/i })).toBeInTheDocument();
  });
});

describe('the desktop layout', () => {
  beforeEach(() => mockUseIsMobile.mockReturnValue(false));

  it('shows every section at once, with no step counter', async () => {
    renderEditor();

    expect(await screen.findByText('Quando e onde')).toBeInTheDocument();
    expect(screen.getByText('Equipa')).toBeInTheDocument();
    expect(screen.getByText('Viatura e quilómetros')).toBeInTheDocument();
    expect(screen.getByText('Vítima e transporte')).toBeInTheDocument();
    expect(screen.getByText('Relato e anexos')).toBeInTheDocument();
    expect(screen.queryByText('1 de 7')).not.toBeInTheDocument();
  });

  it('shows the number the report will get, before it has one', async () => {
    renderEditor();
    // The prefix comes from the type; the digits are the server's to assign.
    expect(await screen.findByText(/EMG ···\/\d{4}/)).toBeInTheDocument();
  });

  it('says what is in the way of saving, in the save bar, in Portuguese', async () => {
    renderEditor();

    expect(
      await screen.findByText(/Escolhe o tipo de local/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gravar relatório/i })).toBeDisabled();
  });

  it('leaves the chronology out of a support report', async () => {
    renderEditor({ type: EventReportType.SALOP_SUPPORT });

    await screen.findByText('Quando e onde');
    expect(screen.queryByText(/^Tempos/)).not.toBeInTheDocument();
  });
});
