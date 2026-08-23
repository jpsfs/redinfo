import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  Action,
  AvailabilityWindowCategory,
  EVENT_REPORT_TYPES,
  EVENT_REPORT_TYPE_RULES,
  EventLocationType,
  EventReportInput,
  EventReportType,
  Gender,
  HospitalWithDistance,
  MAX_ATTACHMENT_BYTES,
  MAX_EXTERNAL_REFERENCE_LENGTH,
  MAX_OPERATIONAL_REPORT_LENGTH,
  MAX_VEHICLE_KILOMETRES,
  MAX_VICTIM_AGE,
  ROLE_PERMISSIONS,
  UserRole,
  VITALS_RANGES,
  VITAL_KEYS,
  VictimDestinationKind,
  categoryForEventReportType,
  distanceInKm,
  eventReportRules,
  eventReportTypeForCategory,
  eventReportWarnings,
  foldForSearch,
  formatEventReportCode,
  hasPermission,
  implausibleVitals,
  parseEventReportCode,
  sortHospitalsForPicker,
  totalKilometres,
  transportedVictimCount,
  validateAttachment,
  validateEventReport,
  validateHospital,
  validateOccurrenceTimes,
  validateVictimDestination,
} from '@redinfo/shared';

/**
 * The rules an event report is held to, tested where they live: in
 * `@redinfo/shared`, so the wizard, the API and these tests are all reading the
 * same sentence. Same arrangement as `schedule-rules.spec.ts`.
 */

const { EMERGENCY, LOCAL_SUPPORT, SALOP_SUPPORT } = EventReportType;

/**
 * The code of a problem, or null.
 *
 * Assertions read the code rather than the message: the code is the contract
 * the wizard translates against, while the wording is free to be improved
 * without a test having an opinion about it.
 */
const codeOf = (problem: { code: string } | null): string | null =>
  problem?.code ?? null;

/** A coherent emergency report — the base every case below varies one field of. */
const emergency = (overrides: Partial<EventReportInput> = {}): EventReportInput => ({
  type: EMERGENCY,
  occurredOn: '2026-08-22',
  startedAt: '2026-08-22T20:14:00.000Z',
  endedAt: '2026-08-22T22:05:00.000Z',
  externalReference: '2608 4471',
  locationType: EventLocationType.HOME,
  localityId: 'loc-taveiro',
  operationalReport: '<p>Vítima consciente após queda.</p>',
  crew: [{ userId: 'user-tiago', roleName: 'Driver' }],
  vehicles: [{ vehicleId: 'veh-amb04', kilometres: 42 }],
  victims: [
    {
      gender: Gender.FEMALE,
      age: 67,
      destinationKind: VictimDestinationKind.HOSPITAL,
      destinationHospitalId: 'hosp-chuc',
    },
  ],
  ...overrides,
});

const support = (overrides: Partial<EventReportInput> = {}): EventReportInput =>
  emergency({
    type: LOCAL_SUPPORT,
    externalReference: null,
    activationAt: null,
    ...overrides,
  });

describe('event report types', () => {
  it('gives every type a distinct code prefix', () => {
    const prefixes = EVENT_REPORT_TYPES.map((type) => EVENT_REPORT_TYPE_RULES[type].codePrefix);
    expect(new Set(prefixes).size).toBe(EVENT_REPORT_TYPES.length);
  });

  it('maps each type onto exactly one availability-window category, and back', () => {
    for (const type of EVENT_REPORT_TYPES) {
      const category = categoryForEventReportType(type);
      expect(eventReportTypeForCategory(category)).toBe(type);
    }
  });

  it('covers every availability-window category, so no rota is unreportable', () => {
    for (const category of Object.values(AvailabilityWindowCategory)) {
      expect(eventReportTypeForCategory(category)).not.toBeNull();
    }
  });

  it('gives an emergency exactly one vehicle, one victim, and a chronology', () => {
    const rules = eventReportRules(EMERGENCY);
    expect(rules).toMatchObject({
      maxVehicles: 1,
      maxVictims: 1,
      hasOccurrenceTimes: true,
      requiresExternalReference: true,
    });
  });

  it('lets support reports carry many vehicles and victims, and no chronology', () => {
    for (const type of [LOCAL_SUPPORT, SALOP_SUPPORT]) {
      const rules = eventReportRules(type);
      expect(rules.hasOccurrenceTimes).toBe(false);
      expect(rules.requiresExternalReference).toBe(false);
      expect(rules.maxVehicles).toBeGreaterThan(1);
      expect(rules.maxVictims).toBeGreaterThan(1);
    }
  });

  it('falls back to the permissive shape for a type it has never heard of', () => {
    // A list must still render a row written by a newer version of the app.
    expect(eventReportRules('SOMETHING_NEW').maxVictims).toBeGreaterThan(1);
  });
});

describe('formatEventReportCode', () => {
  it('renders the prefix, a three-digit number and the year', () => {
    expect(formatEventReportCode({ type: EMERGENCY, number: 128, year: 2026 })).toBe(
      'EMG 128/2026',
    );
    expect(formatEventReportCode({ type: LOCAL_SUPPORT, number: 14, year: 2026 })).toBe(
      'APL 014/2026',
    );
    expect(formatEventReportCode({ type: SALOP_SUPPORT, number: 7, year: 2026 })).toBe(
      'SAL 007/2026',
    );
  });

  it('widens rather than wraps past 999', () => {
    expect(formatEventReportCode({ type: EMERGENCY, number: 1042, year: 2027 })).toBe(
      'EMG 1042/2027',
    );
  });

  it('is null for a draft, because an unfiled report has no code', () => {
    // A number is a position in the year's activation-ordered sequence, and a
    // report nobody has filed has no position yet. Rendering "EMG 000/2026"
    // would be inventing an identifier that another report is going to be given.
    expect(formatEventReportCode({ type: EMERGENCY, number: null, year: 2026 })).toBeNull();
    expect(formatEventReportCode({ type: EMERGENCY, year: 2026 })).toBeNull();
  });
});

describe('the clinical type flags', () => {
  it('gives an emergency a live run, a clinical record and a verbete slot', () => {
    expect(eventReportRules(EMERGENCY)).toMatchObject({
      supportsLiveRun: true,
      hasClinicalRecord: true,
      hasVerbete: true,
    });
  });

  it('gives a support report none of the three', () => {
    // Live mode is emergency-only, and so is the clinical record: a stall at a
    // village fair has no vitals to take and no Verbete to attach.
    for (const type of [LOCAL_SUPPORT, SALOP_SUPPORT]) {
      expect(eventReportRules(type)).toMatchObject({
        supportsLiveRun: false,
        hasClinicalRecord: false,
        hasVerbete: false,
      });
    }
  });
});

describe('the clinical record', () => {
  const withVitals = (assessment: Record<string, unknown>) =>
    emergency({ assessments: [{ takenAt: '2026-08-22T20:31:00.000Z', ...assessment }] });

  it('accepts every vital at both ends of its range', () => {
    for (const key of VITAL_KEYS) {
      const { min, max } = VITALS_RANGES[key];
      expect(codeOf(validateEventReport(withVitals({ [key]: min })))).toBeNull();
      expect(codeOf(validateEventReport(withVitals({ [key]: max })))).toBeNull();
    }
  });

  it('refuses every vital one step past either end', () => {
    for (const key of VITAL_KEYS) {
      const { min, max, decimals } = VITALS_RANGES[key];
      const step = decimals === 0 ? 1 : 0.1;
      // Rounded, because 20 - 0.1 in binary floating point is not 19.9.
      const below = Number((min - step).toFixed(1));
      const above = Number((max + step).toFixed(1));
      expect(codeOf(validateEventReport(withVitals({ [key]: below })))).toBe('VITAL_OUT_OF_RANGE');
      expect(codeOf(validateEventReport(withVitals({ [key]: above })))).toBe('VITAL_OUT_OF_RANGE');
    }
  });

  it('records an implausible-but-real measurement without complaint', () => {
    // The whole point of writing a vital down is that it is abnormal. A form
    // that refused an SpO₂ of 71 would send the crew back to paper.
    expect(codeOf(validateEventReport(withVitals({ spo2: 71, heartRate: 0 })))).toBeNull();
    expect(implausibleVitals({ spo2: 71 })).toContain('spo2');
    expect(implausibleVitals({ spo2: 97 })).toEqual([]);
  });

  it('refuses a set of observations with nothing in it', () => {
    // A bare timestamp is a row that says a crew looked and recorded nothing,
    // which is worse than no row: it reads as an assessment on the report.
    expect(codeOf(validateEventReport(withVitals({})))).toBe('ASSESSMENT_EMPTY');
    // A body position alone is a real observation, though.
    expect(codeOf(validateEventReport(withVitals({ bodyPosition: 'decúbito dorsal' })))).toBeNull();
  });

  it('refuses a diastolic above its own systolic', () => {
    expect(codeOf(validateEventReport(withVitals({ systolic: 90, diastolic: 120 })))).toBe(
      'DIASTOLIC_ABOVE_SYSTOLIC',
    );
    expect(codeOf(validateEventReport(withVitals({ systolic: 120, diastolic: 80 })))).toBeNull();
  });

  it('refuses a whole-number vital given as a fraction', () => {
    expect(codeOf(validateEventReport(withVitals({ heartRate: 78.5 })))).toBe('VITAL_NOT_WHOLE');
    // Temperature is the one that is allowed a decimal.
    expect(codeOf(validateEventReport(withVitals({ temperature: 36.8 })))).toBeNull();
  });

  it('keeps the clinical record off a type that has none', () => {
    expect(codeOf(validateEventReport(support({ chamuHistory: 'Diabética' })))).toBe(
      'CLINICAL_NOT_FOR_TYPE',
    );
    expect(
      codeOf(
        validateEventReport(
          support({ assessments: [{ takenAt: '2026-08-22T20:31:00.000Z', spo2: 97 }] }),
        ),
      ),
    ).toBe('CLINICAL_NOT_FOR_TYPE');
  });

  it('reads the five CHAMU fields and the five ABCDE bands', () => {
    const input = emergency({
      chamuCircumstances: 'Queda da própria altura',
      chamuHistory: 'HTA',
      chamuAllergies: 'Nenhuma conhecida',
      chamuMedication: 'Losartan',
      chamuLastMeal: 'Almoço às 13h',
      abcde: {
        A: { status: 'NORMAL' },
        B: { status: 'NORMAL' },
        C: { status: 'ALTERED', note: 'Hemorragia no antebraço' },
        D: { status: 'NORMAL' },
        E: { status: 'NOT_ASSESSED' },
      },
    });
    expect(codeOf(validateEventReport(input))).toBeNull();
  });

  it('refuses an ABCDE band nobody has heard of, and a status nobody has heard of', () => {
    expect(
      codeOf(validateEventReport(emergency({ abcde: { Z: { status: 'NORMAL' } } as never }))),
    ).toBe('ABCDE_UNKNOWN_BAND');
    expect(
      codeOf(validateEventReport(emergency({ abcde: { A: { status: 'FINE' } } as never }))),
    ).toBe('ABCDE_INVALID_STATUS');
  });
});

describe('parseEventReportCode', () => {
  it('reads a full code, however it was typed', () => {
    expect(parseEventReportCode('EMG 128/2026')).toEqual({
      type: EMERGENCY,
      number: 128,
      year: 2026,
    });
    expect(parseEventReportCode('emg 128/2026')).toEqual({
      type: EMERGENCY,
      number: 128,
      year: 2026,
    });
    expect(parseEventReportCode('EMG128')).toEqual({ type: EMERGENCY, number: 128 });
  });

  it('reads a number and year with no prefix', () => {
    expect(parseEventReportCode('128/2026')).toEqual({ number: 128, year: 2026 });
  });

  it('strips leading zeros, so the printed form round-trips', () => {
    const code = formatEventReportCode({ type: SALOP_SUPPORT, number: 7, year: 2026 });
    expect(code).not.toBeNull();
    expect(parseEventReportCode(code!)).toEqual({
      type: SALOP_SUPPORT,
      number: 7,
      year: 2026,
    });
  });

  it('is null for free text, so the search falls through to a text match', () => {
    expect(parseEventReportCode('Taveiro')).toBeNull();
    expect(parseEventReportCode('Ana Ribeiro')).toBeNull();
    expect(parseEventReportCode('')).toBeNull();
    expect(parseEventReportCode('   ')).toBeNull();
  });

  it('is null for a three-letter prefix that names no type', () => {
    expect(parseEventReportCode('XYZ 12')).toBeNull();
    expect(parseEventReportCode('ABC')).toBeNull();
  });
});

describe('validateEventReport', () => {
  it('accepts a coherent emergency report', () => {
    expect(validateEventReport(emergency())).toBeNull();
  });

  it('accepts a coherent support report with several vehicles and victims', () => {
    expect(
      validateEventReport(
        support({
          vehicles: [
            { vehicleId: 'veh-a', kilometres: 51 },
            { vehicleId: 'veh-b', kilometres: 36 },
          ],
          victims: [
            {
              gender: Gender.FEMALE,
              age: 67,
              destinationKind: VictimDestinationKind.HOSPITAL,
              destinationHospitalId: 'hosp-chuc',
            },
            {
              gender: Gender.MALE,
              age: 14,
              destinationKind: VictimDestinationKind.TREATED_ON_SCENE,
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  // ── What a report may be saved without ──
  // These are the whole point of the wizard's "save now, finish later" promise,
  // so each one is asserted as *allowed* rather than merely untested.

  it('lets a report be saved with no end time', () => {
    expect(validateEventReport(emergency({ endedAt: null }))).toBeNull();
  });

  it('lets a report be saved with nothing written yet', () => {
    expect(validateEventReport(emergency({ operationalReport: '' }))).toBeNull();
    expect(validateEventReport(emergency({ operationalReport: '<p></p>' }))).toBeNull();
  });

  it('lets a report be saved with no crew, no vehicle and no victim', () => {
    expect(
      validateEventReport(emergency({ crew: [], vehicles: [], victims: [] })),
    ).toBeNull();
  });

  it('lets an emergency be saved with none of the occurrence times marked', () => {
    expect(validateEventReport(emergency())).toBeNull();
  });

  // ── What it refuses ──

  it('refuses an end before the start', () => {
    expect(
      codeOf(
        validateEventReport(
          emergency({
            startedAt: '2026-08-22T22:00:00.000Z',
            endedAt: '2026-08-22T20:00:00.000Z',
          }),
        ),
      ),
    ).toBe('END_BEFORE_START');
  });

  it('accepts a service that runs past midnight', () => {
    expect(
      validateEventReport(
        emergency({
          occurredOn: '2026-08-22',
          startedAt: '2026-08-22T22:31:00.000Z',
          endedAt: '2026-08-23T00:14:00.000Z',
        }),
      ),
    ).toBeNull();
  });

  it('requires a CODU reference on an emergency and not on a support report', () => {
    expect(codeOf(validateEventReport(emergency({ externalReference: null })))).toBe(
      'MISSING_REFERENCE',
    );
    expect(codeOf(validateEventReport(emergency({ externalReference: '   ' })))).toBe(
      'MISSING_REFERENCE',
    );
    // …and the message still names which number, for the API's 400.
    expect(validateEventReport(emergency({ externalReference: null }))?.message).toMatch(
      /CODU/,
    );
    expect(validateEventReport(support({ externalReference: null }))).toBeNull();
  });

  it('caps the reference length', () => {
    expect(
      codeOf(
        validateEventReport(
          emergency({ externalReference: 'x'.repeat(MAX_EXTERNAL_REFERENCE_LENGTH + 1) }),
        ),
      ),
    ).toBe('REFERENCE_TOO_LONG');
  });

  it('needs a date, a start time and a locality', () => {
    expect(codeOf(validateEventReport(emergency({ occurredOn: '' })))).toBe('MISSING_DATE');
    expect(codeOf(validateEventReport(emergency({ occurredOn: '22-08-2026' })))).toBe(
      'MISSING_DATE',
    );
    expect(codeOf(validateEventReport(emergency({ startedAt: '' })))).toBe('MISSING_START');
    expect(codeOf(validateEventReport(emergency({ startedAt: 'not a time' })))).toBe(
      'MISSING_START',
    );
    expect(codeOf(validateEventReport(emergency({ localityId: '' })))).toBe(
      'MISSING_LOCALITY',
    );
    expect(
      codeOf(validateEventReport(emergency({ locationType: '' as never }))),
    ).toBe('MISSING_LOCATION_TYPE');
  });

  it('refuses a second vehicle on an emergency, and allows it on a support report', () => {
    const two = [
      { vehicleId: 'veh-a', kilometres: 10 },
      { vehicleId: 'veh-b', kilometres: 20 },
    ];
    expect(codeOf(validateEventReport(emergency({ vehicles: two })))).toBe(
      'TOO_MANY_VEHICLES',
    );
    expect(validateEventReport(support({ vehicles: two }))).toBeNull();
  });

  it('refuses a second victim on an emergency, and allows it on a support report', () => {
    const two = [
      { gender: Gender.MALE, age: 30, destinationKind: VictimDestinationKind.CANCELLED },
      { gender: Gender.FEMALE, age: 31, destinationKind: VictimDestinationKind.CANCELLED },
    ];
    expect(codeOf(validateEventReport(emergency({ victims: two })))).toBe(
      'TOO_MANY_VICTIMS',
    );
    expect(validateEventReport(support({ victims: two }))).toBeNull();
  });

  it('refuses the same vehicle or the same person listed twice', () => {
    expect(
      codeOf(
        validateEventReport(
          support({
            vehicles: [
              { vehicleId: 'veh-a', kilometres: 10 },
              { vehicleId: 'veh-a', kilometres: 20 },
            ],
          }),
        ),
      ),
    ).toBe('VEHICLE_DUPLICATE');

    expect(
      codeOf(
        validateEventReport(
          support({ crew: [{ userId: 'user-a' }, { userId: 'user-a' }] }),
        ),
      ),
    ).toBe('CREW_DUPLICATE');
  });

  it('refuses kilometres that are negative, fractional or absurd', () => {
    for (const kilometres of [-1, 1.5, MAX_VEHICLE_KILOMETRES + 1]) {
      expect(
        codeOf(
          validateEventReport(support({ vehicles: [{ vehicleId: 'veh-a', kilometres }] })),
        ),
      ).toBe('KILOMETRES_INVALID');
    }
  });

  it('refuses an age outside 0–130', () => {
    for (const age of [-1, MAX_VICTIM_AGE + 1, 12.5]) {
      expect(
        codeOf(
          validateEventReport(
            support({
              victims: [
                { gender: Gender.MALE, age, destinationKind: VictimDestinationKind.CANCELLED },
              ],
            }),
          ),
        ),
      ).toBe('VICTIM_AGE_INVALID');
    }
  });

  it('refuses a narrative longer than the column', () => {
    expect(
      codeOf(
        validateEventReport(
          emergency({ operationalReport: 'x'.repeat(MAX_OPERATIONAL_REPORT_LENGTH + 1) }),
        ),
      ),
    ).toBe('NARRATIVE_TOO_LONG');
  });

  it('refuses a half-built shift reference', () => {
    expect(
      codeOf(
        validateEventReport(
          emergency({ shift: { scheduleId: '', date: '2026-08-22', slot: 1 } }),
        ),
      ),
    ).toBe('SHIFT_MISSING_SCHEDULE');
    expect(
      codeOf(
        validateEventReport(
          emergency({ shift: { scheduleId: 'sch-1', date: 'nope', slot: 1 } }),
        ),
      ),
    ).toBe('SHIFT_MISSING_DATE');
    expect(
      codeOf(
        validateEventReport(
          emergency({ shift: { scheduleId: 'sch-1', date: '2026-08-22', slot: 0 } }),
        ),
      ),
    ).toBe('SHIFT_MISSING_SLOT');
  });
});

describe('validateVictimDestination', () => {
  it('requires a hospital when the victim was transported', () => {
    expect(
      codeOf(
        validateVictimDestination({
          destinationKind: VictimDestinationKind.HOSPITAL,
          destinationHospitalId: null,
        }),
      ),
    ).toBe('DESTINATION_HOSPITAL_REQUIRED');
  });

  it('refuses a hospital on a victim who was not transported', () => {
    for (const destinationKind of [
      VictimDestinationKind.TREATED_ON_SCENE,
      VictimDestinationKind.REFUSED_TRANSPORT,
      VictimDestinationKind.DECEASED_ON_SCENE,
      VictimDestinationKind.CANCELLED,
    ]) {
      expect(
        codeOf(
          validateVictimDestination({ destinationKind, destinationHospitalId: 'hosp-chuc' }),
        ),
      ).toBe('DESTINATION_HOSPITAL_NOT_ALLOWED');
    }
  });

  it('accepts each coherent pairing', () => {
    expect(
      validateVictimDestination({
        destinationKind: VictimDestinationKind.HOSPITAL,
        destinationHospitalId: 'hosp-chuc',
      }),
    ).toBeNull();
    expect(
      validateVictimDestination({
        destinationKind: VictimDestinationKind.REFUSED_TRANSPORT,
      }),
    ).toBeNull();
  });
});

describe('validateOccurrenceTimes', () => {
  const times = {
    activationAt: '2026-08-22T20:14:00.000Z',
    sceneArrivalAt: '2026-08-22T20:26:00.000Z',
    sceneDepartureAt: '2026-08-22T20:44:00.000Z',
    hospitalArrivalAt: '2026-08-22T20:53:00.000Z',
    availableAt: '2026-08-22T21:10:00.000Z',
  };

  it('accepts a full chronology in order', () => {
    expect(validateOccurrenceTimes({ type: EMERGENCY, ...times })).toBeNull();
  });

  it('accepts any subset — each stamp is independently optional', () => {
    expect(
      validateOccurrenceTimes({
        type: EMERGENCY,
        activationAt: times.activationAt,
        availableAt: times.availableAt,
      }),
    ).toBeNull();
    expect(
      validateOccurrenceTimes({ type: EMERGENCY, hospitalArrivalAt: times.hospitalArrivalAt }),
    ).toBeNull();
    expect(validateOccurrenceTimes({ type: EMERGENCY })).toBeNull();
  });

  it('refuses stamps that go backwards, naming both ends', () => {
    const problem = validateOccurrenceTimes({
      type: EMERGENCY,
      activationAt: times.sceneArrivalAt,
      sceneArrivalAt: times.activationAt,
    });
    expect(problem?.code).toBe('TIMES_OUT_OF_ORDER');
    // The message names both ends, so a coordinator reading a 400 knows which
    // two stamps disagree.
    expect(problem?.message).toMatch(/arrival on scene/i);
    expect(problem?.message).toMatch(/activation/i);
  });

  it('compares only the stamps that are there, not the gaps', () => {
    // Activation and hospital arrival, with the middle two left blank: still
    // in order, and the absent ones must not read as zero.
    expect(
      validateOccurrenceTimes({
        type: EMERGENCY,
        activationAt: times.activationAt,
        hospitalArrivalAt: times.hospitalArrivalAt,
      }),
    ).toBeNull();
  });

  it('refuses any chronology at all on a support report', () => {
    expect(
      codeOf(
        validateOccurrenceTimes({ type: LOCAL_SUPPORT, activationAt: times.activationAt }),
      ),
    ).toBe('TIMES_NOT_FOR_TYPE');
    expect(
      codeOf(
        validateOccurrenceTimes({ type: SALOP_SUPPORT, availableAt: times.availableAt }),
      ),
    ).toBe('TIMES_NOT_FOR_TYPE');
  });

  it('is reached through validateEventReport too', () => {
    expect(
      codeOf(validateEventReport(support({ activationAt: times.activationAt }))),
    ).toBe('TIMES_NOT_FOR_TYPE');
  });
});

describe('eventReportWarnings', () => {
  it('is empty for a finished report', () => {
    expect(
      eventReportWarnings(
        emergency({
          activationAt: '2026-08-22T20:14:00.000Z',
        }),
      ),
    ).toEqual([]);
  });

  it('names what is missing without refusing the save', () => {
    const input = emergency({
      endedAt: null,
      operationalReport: '',
      crew: [],
      vehicles: [],
      victims: [],
    });

    expect(validateEventReport(input)).toBeNull();
    // Codes, not prose: these are shown only to the crew, who read Portuguese.
    expect(eventReportWarnings(input).sort()).toEqual(
      [
        'MISSING_END_TIME',
        'MISSING_NARRATIVE',
        'NO_CREW',
        'NO_TIMES_MARKED',
        'NO_VEHICLE',
        'NO_VICTIM',
      ].sort(),
    );
  });

  it('does not ask a support report for occurrence times it does not have', () => {
    expect(eventReportWarnings(support())).not.toContain('NO_TIMES_MARKED');
  });
});

describe('report totals', () => {
  it('sums kilometres across vehicles', () => {
    expect(totalKilometres([{ kilometres: 51 }, { kilometres: 36 }])).toBe(87);
    expect(totalKilometres([])).toBe(0);
  });

  it('counts only the victims who were transported', () => {
    expect(
      transportedVictimCount([
        { destinationKind: VictimDestinationKind.HOSPITAL },
        { destinationKind: VictimDestinationKind.TREATED_ON_SCENE },
        { destinationKind: VictimDestinationKind.HOSPITAL },
      ]),
    ).toBe(2);
  });
});

describe('foldForSearch', () => {
  it('folds accents, case and punctuation so a phone keyboard can find anything', () => {
    expect(foldForSearch('São Martinho do Bispo')).toBe('sao martinho do bispo');
    expect(foldForSearch('Condeixa-a-Nova')).toBe('condeixa a nova');
    expect(foldForSearch('  Óbidos  ')).toBe('obidos');
    expect(foldForSearch('Vila Real de Santo António')).toBe(
      'vila real de santo antonio',
    );
  });

  it('is idempotent, so folding an already-folded name is safe', () => {
    const once = foldForSearch('Alfândega da Fé');
    expect(foldForSearch(once)).toBe(once);
  });
});

describe('distanceInKm', () => {
  const coimbra = { latitude: 40.2111, longitude: -8.4289 };
  const lisbon = { latitude: 38.7223, longitude: -9.1393 };

  it('is zero for the same point', () => {
    expect(distanceInKm(coimbra, coimbra)).toBe(0);
  });

  it('is symmetric', () => {
    expect(distanceInKm(coimbra, lisbon)).toBeCloseTo(distanceInKm(lisbon, coimbra), 6);
  });

  it('matches the Coimbra–Lisbon great-circle distance', () => {
    // 176 km as the crow flies (1.489° of latitude ≈ 165 km, 0.710° of
    // longitude at 39.5°N ≈ 61 km). A 1 km tolerance is far tighter than any
    // ordering decision this feeds.
    expect(distanceInKm(coimbra, lisbon)).toBeCloseTo(176.4, 0);
  });

  it('grows with separation, which is all the ordering needs of it', () => {
    const near = { latitude: 40.2111, longitude: -8.3289 };
    expect(distanceInKm(coimbra, near)).toBeLessThan(distanceInKm(coimbra, lisbon));
  });
});

describe('sortHospitalsForPicker', () => {
  const hospital = (
    name: string,
    distanceKm: number | null,
  ): HospitalWithDistance => ({
    id: name,
    name,
    municipalityId: 'mun',
    latitude: null,
    longitude: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    distanceKm,
    approximate: false,
  });

  it('puts the nearest first', () => {
    const sorted = sortHospitalsForPicker([
      hospital('Far', 62),
      hospital('Near', 6),
      hospital('Middle', 38),
    ]);
    expect(sorted.map((entry) => entry.name)).toEqual(['Near', 'Middle', 'Far']);
  });

  it('breaks ties by name, in Portuguese collation', () => {
    const sorted = sortHospitalsForPicker([
      hospital('Óbidos', 9),
      hospital('Aveiro', 9),
      hospital('Coimbra', 9),
    ]);
    expect(sorted.map((entry) => entry.name)).toEqual(['Aveiro', 'Coimbra', 'Óbidos']);
  });

  it('sorts hospitals nobody can measure last', () => {
    const sorted = sortHospitalsForPicker([
      hospital('Unlocatable', null),
      hospital('Far', 62),
      hospital('Near', 6),
    ]);
    expect(sorted.map((entry) => entry.name)).toEqual(['Near', 'Far', 'Unlocatable']);
  });

  it('falls back to alphabetical when nothing has a distance', () => {
    const sorted = sortHospitalsForPicker([
      hospital('Zamora', null),
      hospital('Aveiro', null),
    ]);
    expect(sorted.map((entry) => entry.name)).toEqual(['Aveiro', 'Zamora']);
  });

  it('does not mutate its argument', () => {
    const input = [hospital('Far', 62), hospital('Near', 6)];
    sortHospitalsForPicker(input);
    expect(input.map((entry) => entry.name)).toEqual(['Far', 'Near']);
  });
});

describe('validateHospital', () => {
  const base = { name: 'CHUC — Hospital Geral', municipalityId: 'mun-coimbra' };

  it('accepts a hospital with no coordinates', () => {
    expect(validateHospital(base)).toBeNull();
  });

  it('accepts a hospital with both coordinates', () => {
    expect(validateHospital({ ...base, latitude: 40.19, longitude: -8.43 })).toBeNull();
  });

  it('refuses half a coordinate, in either direction', () => {
    expect(validateHospital({ ...base, latitude: 40.19 })).toMatch(/both/i);
    expect(validateHospital({ ...base, longitude: -8.43 })).toMatch(/both/i);
  });

  it('refuses coordinates off the globe', () => {
    expect(validateHospital({ ...base, latitude: 91, longitude: 0 })).toMatch(/latitude/i);
    expect(validateHospital({ ...base, latitude: 0, longitude: 181 })).toMatch(/longitude/i);
  });

  it('needs a name and a municipality', () => {
    expect(validateHospital({ ...base, name: '  ' })).toMatch(/name/i);
    expect(validateHospital({ ...base, municipalityId: '' })).toMatch(/municipality/i);
  });
});

describe('validateAttachment', () => {
  const base = { filename: 'foto.jpg', mimeType: 'image/jpeg', byteSize: 1024 };

  it('accepts every kind a phone camera or a scanner produces', () => {
    for (const mimeType of ALLOWED_ATTACHMENT_MIME_TYPES) {
      expect(validateAttachment({ ...base, mimeType })).toBeNull();
    }
  });

  it('refuses anything else', () => {
    for (const mimeType of ['text/html', 'application/zip', 'image/svg+xml']) {
      expect(validateAttachment({ ...base, mimeType })).toMatch(/photographs and PDF/i);
    }
  });

  it('refuses an empty file and one over the cap', () => {
    expect(validateAttachment({ ...base, byteSize: 0 })).toMatch(/empty/i);
    expect(validateAttachment({ ...base, byteSize: MAX_ATTACHMENT_BYTES + 1 })).toMatch(
      /at most 20 MB/i,
    );
  });

  it('accepts a file exactly at the cap', () => {
    expect(validateAttachment({ ...base, byteSize: MAX_ATTACHMENT_BYTES })).toBeNull();
  });

  it('needs a name', () => {
    expect(validateAttachment({ ...base, filename: '' })).toMatch(/no name/i);
  });
});

describe('report permissions', () => {
  it('lets an operational file a report but not read the whole archive', () => {
    const role = UserRole.EMERGENCY_OPERATIONAL;
    expect(hasPermission(role, Action.CREATE_EVENT_REPORT)).toBe(true);
    expect(hasPermission(role, Action.VIEW_EVENT_REPORTS)).toBe(false);
    expect(hasPermission(role, Action.MANAGE_EVENT_REPORTS)).toBe(false);
    expect(hasPermission(role, Action.MANAGE_HOSPITALS)).toBe(false);
  });

  it('lets an emergency coordinator read, manage and keep the hospital list', () => {
    const role = UserRole.EMERGENCY_COORDINATOR;
    for (const action of [
      Action.CREATE_EVENT_REPORT,
      Action.VIEW_EVENT_REPORTS,
      Action.MANAGE_EVENT_REPORTS,
      Action.MANAGE_HOSPITALS,
    ]) {
      expect(hasPermission(role, action)).toBe(true);
    }
  });

  it('keeps reports away from logistics', () => {
    const role = UserRole.LOGISTICS_COORDINATOR;
    for (const action of [
      Action.CREATE_EVENT_REPORT,
      Action.VIEW_EVENT_REPORTS,
      Action.MANAGE_EVENT_REPORTS,
      Action.MANAGE_HOSPITALS,
    ]) {
      expect(hasPermission(role, action)).toBe(false);
    }
  });

  it('grants a system admin everything, without listing it', () => {
    for (const action of Object.values(Action)) {
      expect(hasPermission(UserRole.SYSTEM_ADMIN, action)).toBe(true);
    }
    expect(ROLE_PERMISSIONS[UserRole.SYSTEM_ADMIN]).toEqual(Object.values(Action));
  });
});
