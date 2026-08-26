import {
  EventLocationType,
  EventReportType,
  Gender,
  LIVE_RUN_ABANDON_HOURS,
  LIVE_RUN_RETENTION_HOURS,
  LIVE_RUN_STATES,
  LIVE_RUN_STATE_RULES,
  LIVE_SCREENS,
  LiveRunInput,
  LiveRunState,
  OCCURRENCE_TIME_FIELDS,
  VictimDestinationKind,
  canCloseLiveRun,
  isLiveRunReadable,
  liveRunCloseBlockers,
  liveRunClosingStamps,
  liveRunToEventReportInput,
  liveRunWarnings,
  noTransportDestinationsFor,
  validateEventReport,
  validateLiveRun,
  validateLiveRunIdentity,
} from '@redinfo/shared';

/**
 * The rules a live run is held to, tested where they live: in `@redinfo/shared`,
 * so the phone, the API and these tests are all reading the same sentence.
 *
 * The stakes are what make this file worth its length. Closing a run is the
 * moment twenty minutes of an emergency either becomes a report or is lost, and
 * it has to be provable without a server, a network or a database.
 */

const HOUR = 3600_000;

/** A run far enough along to be closeable — the base every case varies. */
const run = (overrides: Partial<LiveRunInput> = {}): LiveRunInput => ({
  id: 'run-1',
  revision: 3,
  state: LiveRunState.AT_HOSPITAL,
  startedAt: '2026-08-22T20:11:00.000Z',
  externalReference: '2608 4471',
  chiefComplaint: 'Queda com traumatismo',
  locationType: EventLocationType.HOME,
  localityId: 'loc-taveiro',
  victimGender: Gender.FEMALE,
  victimAge: 67,
  vehicleId: 'veh-amb04',
  crew: [{ userId: 'user-tiago', roleName: 'Driver' }],
  activationAt: '2026-08-22T20:14:00.000Z',
  sceneArrivalAt: '2026-08-22T20:26:00.000Z',
  sceneDepartureAt: '2026-08-22T20:48:00.000Z',
  hospitalArrivalAt: '2026-08-22T21:14:00.000Z',
  availableAt: '2026-08-22T21:39:00.000Z',
  destinationKind: VictimDestinationKind.HOSPITAL,
  destinationHospitalId: 'hosp-chuc',
  capture: { notes: 'Consciente e orientada.' },
  ...overrides,
});

const codeOf = (problem: { code: string } | null): string | null => problem?.code ?? null;

describe('the state table', () => {
  it('gives every state a rule, so no screen can be unreachable', () => {
    for (const state of LIVE_RUN_STATES) {
      expect(LIVE_RUN_STATE_RULES[state]).toBeDefined();
    }
    expect(Object.keys(LIVE_RUN_STATE_RULES)).toHaveLength(LIVE_RUN_STATES.length);
  });

  it('names a real screen for every state', () => {
    for (const state of LIVE_RUN_STATES) {
      expect(LIVE_SCREENS).toContain(LIVE_RUN_STATE_RULES[state].screen);
    }
  });

  it('stamps only fields the report actually has', () => {
    // A transition that stamped a field the report does not carry would lose the
    // time silently at close — which is the one failure this feature exists to
    // prevent, so it is asserted rather than trusted.
    for (const state of LIVE_RUN_STATES) {
      const { stamps } = LIVE_RUN_STATE_RULES[state];
      if (stamps === null) continue;
      expect(OCCURRENCE_TIME_FIELDS).toContain(stamps);
    }
  });

  it('walks every state to CLOSED without a dead end', () => {
    // Following `next` from any state has to arrive at CLOSED: a crew must never
    // be stuck in a state the screen cannot leave.
    for (const start of LIVE_RUN_STATES) {
      let cursor: LiveRunState | null = start;
      const seen = new Set<LiveRunState>();
      while (cursor !== null && cursor !== LiveRunState.CLOSED) {
        expect(seen.has(cursor)).toBe(false); // no cycles
        seen.add(cursor);
        cursor = LIVE_RUN_STATE_RULES[cursor].next;
      }
      expect(cursor).toBe(LiveRunState.CLOSED);
    }
  });

  it('leaves CLOSED with nowhere to go and nothing to stamp', () => {
    expect(LIVE_RUN_STATE_RULES[LiveRunState.CLOSED]).toMatchObject({
      next: null,
      stamps: null,
    });
  });

  it('can be closed from every stage, because a call can be stood down at any point', () => {
    for (const state of LIVE_RUN_STATES) {
      if (state === LiveRunState.CLOSED) continue;
      expect(canCloseLiveRun(run({ state }))).toBe(true);
    }
    // Twice is not a transition. Closing an already-closed run is the close
    // route's job to make idempotent, not the state table's to permit.
    expect(canCloseLiveRun(run({ state: LiveRunState.CLOSED }))).toBe(false);
  });
});

describe('validateLiveRun', () => {
  it('accepts a run with almost nothing in it', () => {
    // A run that exists at all is one a crew has started, and a CODU call that
    // gives only a street is a real call. Only contradictions are refused.
    expect(
      codeOf(
        validateLiveRun({
          id: 'run-2',
          revision: 0,
          state: LiveRunState.INTAKE,
          startedAt: '2026-08-22T20:11:00.000Z',
        }),
      ),
    ).toBeNull();
  });

  it('needs an id, a whole revision, a known state and a start', () => {
    expect(codeOf(validateLiveRun(run({ id: '' })))).toBe('LIVE_RUN_MISSING_ID');
    expect(codeOf(validateLiveRun(run({ revision: -1 })))).toBe('LIVE_RUN_INVALID_REVISION');
    expect(codeOf(validateLiveRun(run({ revision: 1.5 })))).toBe('LIVE_RUN_INVALID_REVISION');
    expect(codeOf(validateLiveRun(run({ state: 'MID_AIR' as never })))).toBe(
      'LIVE_RUN_UNKNOWN_STATE',
    );
    expect(codeOf(validateLiveRun(run({ startedAt: 'soon' })))).toBe('LIVE_RUN_MISSING_START');
  });

  it('refuses a chronology that runs backwards', () => {
    expect(
      codeOf(
        validateLiveRun(run({ sceneArrivalAt: '2026-08-22T20:00:00.000Z' })),
      ),
    ).toBe('TIMES_OUT_OF_ORDER');
  });

  it('refuses a hospital with no outcome, and an outcome with the wrong hospital', () => {
    expect(
      codeOf(validateLiveRun(run({ destinationKind: null, destinationHospitalId: 'hosp-chuc' }))),
    ).toBe('DESTINATION_HOSPITAL_NOT_ALLOWED');
    expect(
      codeOf(
        validateLiveRun(
          run({
            destinationKind: VictimDestinationKind.TREATED_ON_SCENE,
            destinationHospitalId: 'hosp-chuc',
          }),
        ),
      ),
    ).toBe('DESTINATION_HOSPITAL_NOT_ALLOWED');
  });

  it('refuses "treated on scene" — a run is always an emergency', () => {
    expect(
      codeOf(
        validateLiveRun(
          run({
            destinationKind: VictimDestinationKind.TREATED_ON_SCENE,
            destinationHospitalId: null,
          }),
        ),
      ),
    ).toBe('DESTINATION_NOT_FOR_TYPE');
  });

  it('checks the clinical capture with the report’s own rules', () => {
    expect(
      codeOf(
        validateLiveRun(
          run({ capture: { assessments: [{ takenAt: '2026-08-22T20:31:00.000Z' }] } }),
        ),
      ),
    ).toBe('ASSESSMENT_EMPTY');
  });
});

describe('validateLiveRunIdentity', () => {
  it('accepts nothing at all, because a call may give nothing at all', () => {
    expect(codeOf(validateLiveRunIdentity(null))).toBeNull();
    expect(codeOf(validateLiveRunIdentity({}))).toBeNull();
  });

  it('holds an SNS number to nine digits and a date of birth to a calendar date', () => {
    expect(codeOf(validateLiveRunIdentity({ victimSnsNumber: '123456789' }))).toBeNull();
    expect(codeOf(validateLiveRunIdentity({ victimSnsNumber: '12345' }))).toBe(
      'LIVE_RUN_INVALID_SNS',
    );
    expect(codeOf(validateLiveRunIdentity({ victimDateOfBirth: '1948-03-17' }))).toBeNull();
    expect(codeOf(validateLiveRunIdentity({ victimDateOfBirth: '17/03/1948' }))).toBe(
      'LIVE_RUN_INVALID_DATE_OF_BIRTH',
    );
  });
});

describe('what stops a run closing', () => {
  it('is nothing, for a run the intake screen filled in', () => {
    expect(liveRunCloseBlockers(run())).toEqual([]);
  });

  it('is the four things a report cannot exist without', () => {
    // Every one of them is refused by `validateEventReport`, so a run allowed to
    // close without it would produce a draft nobody could ever file. That is the
    // whole test: the blocker list and the report validator agree.
    const cases: Array<[Partial<LiveRunInput>, string]> = [
      [{ localityId: null }, 'NO_LOCALITY'],
      [{ locationType: null }, 'NO_LOCATION_TYPE'],
      [{ externalReference: null }, 'NO_REFERENCE'],
    ];
    for (const [overrides, code] of cases) {
      const subject = run(overrides);
      expect(liveRunCloseBlockers(subject)).toContain(code);
      expect(canCloseLiveRun(subject)).toBe(false);
      expect(validateEventReport(liveRunToEventReportInput(subject))).not.toBeNull();
    }
  });

  it('is a run with no chronology at all', () => {
    const bare = run({
      activationAt: null,
      sceneArrivalAt: null,
      sceneDepartureAt: null,
      hospitalArrivalAt: null,
      availableAt: null,
    });
    expect(liveRunCloseBlockers(bare)).toContain('NO_STAMPS');
  });

  it('is never a warning — those close anyway', () => {
    const thin = run({
      chiefComplaint: null,
      victimGender: null,
      victimAge: null,
      destinationKind: null,
      destinationHospitalId: null,
      vehicleId: null,
      crew: [],
      capture: null,
      sceneArrivalAt: null,
      sceneDepartureAt: null,
      hospitalArrivalAt: null,
    });
    expect(liveRunWarnings(thin).length).toBeGreaterThan(0);
    expect(liveRunCloseBlockers(thin)).toEqual([]);
    expect(canCloseLiveRun(thin)).toBe(true);
  });
});

describe('the stamps closing writes for itself', () => {
  const NOW = new Date('2026-08-22T21:05:00.000Z');

  it('marks the crew available, because that is what closing means', () => {
    expect(liveRunClosingStamps(run({ availableAt: null }), NOW)).toMatchObject({
      availableAt: NOW.toISOString(),
    });
  });

  it('marks the scene left when the crew closed from the scene', () => {
    // The no-transport path: stood down on scene, nobody transported. Both times
    // are inferred, and `hospitalArrivalAt` stays null — nobody went.
    const standDown = run({
      state: LiveRunState.ON_SCENE,
      sceneDepartureAt: null,
      hospitalArrivalAt: null,
      availableAt: null,
      destinationKind: VictimDestinationKind.REFUSED_TRANSPORT,
      destinationHospitalId: null,
    });

    const stamps = liveRunClosingStamps(standDown, NOW);
    expect(stamps).toEqual({
      sceneDepartureAt: NOW.toISOString(),
      availableAt: NOW.toISOString(),
    });

    const closed = { ...standDown, ...stamps };
    expect(closed.hospitalArrivalAt).toBeNull();
    expect(validateEventReport(liveRunToEventReportInput(closed))).toBeNull();
  });

  it('never overwrites a time the crew stamped itself', () => {
    expect(liveRunClosingStamps(run(), NOW)).toEqual({});
  });

  it('infers no scene departure for a call that never reached a scene', () => {
    // Cancelled en route. There was no scene to leave, so inventing a departure
    // would put a time on the report that never happened.
    const cancelled = run({
      state: LiveRunState.EN_ROUTE,
      sceneArrivalAt: null,
      sceneDepartureAt: null,
      hospitalArrivalAt: null,
      availableAt: null,
    });
    expect(liveRunClosingStamps(cancelled, NOW)).toEqual({
      availableAt: NOW.toISOString(),
    });
  });
});

describe('liveRunToEventReportInput', () => {
  it('produces a report every outcome an emergency can carry is filed as', () => {
    for (const kind of [
      VictimDestinationKind.HOSPITAL,
      ...noTransportDestinationsFor(EventReportType.EMERGENCY),
    ]) {
      const subject = run({
        destinationKind: kind,
        destinationHospitalId: kind === VictimDestinationKind.HOSPITAL ? 'hosp-chuc' : null,
      });
      const input = liveRunToEventReportInput(subject);
      expect(input.type).toBe(EventReportType.EMERGENCY);
      expect(input.victims[0].destinationKind).toBe(kind);
      expect(validateEventReport(input)).toBeNull();
    }
  });

  it('coerces a "treated on scene" outcome — no longer valid for an emergency — to a filable report', () => {
    // A run recorded before this change (or a legacy client) may still carry
    // `TREATED_ON_SCENE`. Closing has already happened by the time this runs,
    // so the conversion must never fail — the crew corrects the outcome on the
    // draft's own edit page instead.
    const subject = run({
      destinationKind: VictimDestinationKind.TREATED_ON_SCENE,
      destinationHospitalId: null,
    });
    const input = liveRunToEventReportInput(subject);
    expect(input.victims[0].destinationKind).toBe(VictimDestinationKind.CANCELLED);
    expect(validateEventReport(input)).toBeNull();
  });

  it('drops every identity field, rather than trusting a later step to', () => {
    const input = liveRunToEventReportInput(
      run({
        identity: {
          victimName: 'Maria Fernandes',
          victimSnsNumber: '123456789',
          occurrenceAddress: 'R. Dr. Manuel Rodrigues nº 12, 3º Esq.',
          referencePoints: 'porta azul ao lado do café',
          victimHomeAddress: 'R. das Flores 4',
          victimHomeLocalityId: 'loc-flores',
          victimDateOfBirth: '1948-03-17',
        },
      }),
    );

    // Not "the identity fields are absent from the type" — the *serialized*
    // report must not contain the characters anywhere, including inside the
    // narrative a dictation might have carried them into.
    const asText = JSON.stringify(input);
    expect(asText).not.toContain('Maria Fernandes');
    expect(asText).not.toContain('123456789');
    expect(asText).not.toContain('Manuel Rodrigues');
    expect(asText).not.toContain('porta azul');
    expect(asText).not.toContain('1948-03-17');
    expect(asText).not.toContain('loc-flores');
  });

  it('dates the report from activation, in the device’s own timezone', () => {
    // A call activated at 23:52 and closed at 00:40 belongs to the day it
    // started, which is the rule the paper form uses. Written in *local* times,
    // because the crew's calendar is the device's — a report dated in UTC would
    // put a Portuguese summer call on the wrong day for an hour every night.
    const local = (naive: string) => new Date(naive).toISOString();
    const overnight = run({
      startedAt: local('2026-08-22T23:48:00'),
      activationAt: local('2026-08-22T23:52:00'),
      sceneArrivalAt: local('2026-08-23T00:05:00'),
      sceneDepartureAt: local('2026-08-23T00:19:00'),
      hospitalArrivalAt: local('2026-08-23T00:34:00'),
      availableAt: local('2026-08-23T00:40:00'),
    });

    const input = liveRunToEventReportInput(overnight);
    expect(input.startedAt).toBe(overnight.activationAt);
    expect(input.occurredOn).toBe('2026-08-22');
  });

  it('carries the clinical capture onto the report', () => {
    // ADO #151 removed vital signs from the report; this feature puts them back,
    // because throwing away what the crew recorded live would be worse than not
    // collecting it.
    const input = liveRunToEventReportInput(
      run({
        capture: {
          notes: 'Tensão < 90 e pele fria.',
          chamuHistory: 'HTA',
          abcde: { C: { status: 'ALTERED', note: 'Hemorragia' } },
          assessments: [{ takenAt: '2026-08-22T20:31:00.000Z', spo2: 94, systolic: 88 }],
        },
      }),
    );

    expect(input.chamuHistory).toBe('HTA');
    expect(input.abcde).toEqual({ C: { status: 'ALTERED', note: 'Hemorragia' } });
    expect(input.assessments).toHaveLength(1);
    // Dictated text goes into a rich-text column, so the `<` is escaped rather
    // than left to arrive as a broken tag.
    expect(input.operationalReport).toContain('&lt; 90');
    expect(validateEventReport(input)).toBeNull();
  });

  it('carries no kilometres, because live mode never captures an odometer', () => {
    // A crew does not reliably return to base, so a reading taken live would be
    // wrong more often than right. The figure is computed from the route later.
    const input = liveRunToEventReportInput(run());
    expect(input.vehicles).toEqual([{ vehicleId: 'veh-amb04', kilometres: 0 }]);
  });

  it('produces no victim at all for a run that never had one', () => {
    const input = liveRunToEventReportInput(
      run({ victimGender: null, victimAge: null, destinationKind: null, destinationHospitalId: null }),
    );
    expect(input.victims).toEqual([]);
    expect(validateEventReport(input)).toBeNull();
  });
});

describe('the 48-hour window', () => {
  const closedAt = '2026-08-22T21:39:00.000Z';
  const at = (offsetMs: number) => new Date(new Date(closedAt).getTime() + offsetMs);

  it('keeps an open run readable however long it has been open', () => {
    expect(isLiveRunReadable({ closedAt: null }, at(1000 * HOUR))).toBe(true);
  });

  it('is readable at 47h59m and gone at 48h01m', () => {
    expect(isLiveRunReadable({ closedAt }, at(47 * HOUR + 59 * 60_000))).toBe(true);
    expect(isLiveRunReadable({ closedAt }, at(48 * HOUR + 60_000))).toBe(false);
  });

  it('is exclusive at the boundary itself, so 48h means 48h', () => {
    expect(isLiveRunReadable({ closedAt }, at(LIVE_RUN_RETENTION_HOURS * HOUR - 1))).toBe(true);
    expect(isLiveRunReadable({ closedAt }, at(LIVE_RUN_RETENTION_HOURS * HOUR))).toBe(false);
  });

  it('leaves a run whose close time is unreadable readable, rather than hiding it', () => {
    // Failing closed here would make a corrupt timestamp destroy a run's
    // chronology. Failing open leaves it for the sweep, which has a real clock.
    expect(isLiveRunReadable({ closedAt: 'not a time' })).toBe(true);
  });

  it('force-closes long before it deletes', () => {
    // The order matters: a phone that has been silent for a day may still come
    // back, so an abandoned run is closed — which starts the 48h clock — rather
    // than thrown away.
    expect(LIVE_RUN_ABANDON_HOURS).toBeLessThan(LIVE_RUN_RETENTION_HOURS);
  });
});
