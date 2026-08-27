import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventReportType, Gender, InemSupportUnitType, VictimDestinationKind } from '@redinfo/shared';
import {
  DRAFT_STORAGE_KEY,
  clearDraft,
  composeInstant,
  draftFromReport,
  emptyDraft,
  loadDraft,
  minutesBetween,
  retypeDraft,
  saveDraft,
  stepsForType,
  timeOfDay,
  todayIso,
} from './reportDraft';

// ── The report form, as data ───────────────────────────────────────────────────

describe('stepsForType', () => {
  it('gives an emergency the chronology, INEM support units and the clinical record', () => {
    expect(stepsForType(EventReportType.EMERGENCY)).toEqual([
      'whenWhere',
      'times',
      'crew',
      'vehicles',
      'victims',
      'inemSupport',
      'clinical',
      'narrative',
      'review',
    ]);
  });

  it('gives a support report none of the three', () => {
    // A standby at a village fair has no chronology, no CODU to have dispatched
    // a VMER/SIV/UMIP, and no victim to have vitals — all three are absent
    // rather than empty.
    for (const type of [EventReportType.LOCAL_SUPPORT, EventReportType.SALOP_SUPPORT]) {
      const steps = stepsForType(type);
      expect(steps).toHaveLength(6);
      expect(steps).not.toContain('times');
      expect(steps).not.toContain('inemSupport');
      expect(steps).not.toContain('clinical');
    }
  });

  it('always ends on the review step', () => {
    for (const type of Object.values(EventReportType)) {
      expect(stepsForType(type).at(-1)).toBe('review');
    }
  });
});

describe('timeOfDay', () => {
  it('reads an instant as the wall-clock time the crew saw', () => {
    // Built from local parts, so this holds whatever timezone the test runs in.
    const instant = new Date(2026, 7, 22, 20, 14).toISOString();
    expect(timeOfDay(instant)).toBe('20:14');
  });

  it('pads to two digits', () => {
    expect(timeOfDay(new Date(2026, 7, 22, 8, 5).toISOString())).toBe('08:05');
  });

  it('is empty for an unmarked or unreadable time', () => {
    expect(timeOfDay(null)).toBe('');
    expect(timeOfDay(undefined)).toBe('');
    expect(timeOfDay('')).toBe('');
    expect(timeOfDay('not a time')).toBe('');
  });
});

describe('composeInstant', () => {
  it('puts a wall-clock time on a calendar day', () => {
    const result = composeInstant('2026-08-22', '20:14');
    expect(timeOfDay(result)).toBe('20:14');
    expect(new Date(result!).getDate()).toBe(22);
  });

  it('rolls past midnight rather than going back in time', () => {
    // A service that started at 22:31 and ended at "00:14" ended the next day.
    const start = composeInstant('2026-08-22', '22:31')!;
    const end = composeInstant('2026-08-22', '00:14', { notBefore: start })!;

    expect(new Date(end).getTime()).toBeGreaterThan(new Date(start).getTime());
    expect(minutesBetween(start, end)).toBe(103);
    expect(new Date(end).getDate()).toBe(23);
  });

  it('stays on the same day when it already follows the floor', () => {
    const start = composeInstant('2026-08-22', '20:14')!;
    const end = composeInstant('2026-08-22', '22:05', { notBefore: start })!;

    expect(new Date(end).getDate()).toBe(22);
    expect(minutesBetween(start, end)).toBe(111);
  });

  it('is null for a time or a date it cannot read', () => {
    expect(composeInstant('2026-08-22', '')).toBeNull();
    expect(composeInstant('2026-08-22', '25:00')).toBeNull();
    expect(composeInstant('2026-08-22', '20:99')).toBeNull();
    expect(composeInstant('2026-08-22', 'nope')).toBeNull();
    expect(composeInstant('22-08-2026', '20:14')).toBeNull();
    expect(composeInstant('', '20:14')).toBeNull();
  });

  it('ignores an unreadable floor rather than refusing the time', () => {
    const result = composeInstant('2026-08-22', '20:14', { notBefore: 'rubbish' });
    expect(timeOfDay(result)).toBe('20:14');
  });
});

describe('minutesBetween', () => {
  it('measures the gap between two stamps', () => {
    const a = new Date(2026, 7, 22, 20, 14).toISOString();
    const b = new Date(2026, 7, 22, 20, 26).toISOString();
    expect(minutesBetween(a, b)).toBe(12);
  });

  it('is null when either end is unmarked', () => {
    const a = new Date().toISOString();
    expect(minutesBetween(a, null)).toBeNull();
    expect(minutesBetween(null, a)).toBeNull();
    expect(minutesBetween(a, 'nonsense')).toBeNull();
  });
});

describe('emptyDraft', () => {
  const now = new Date(2026, 7, 22, 20, 14);

  it('pre-fills today and now, because both are knowable', () => {
    const draft = emptyDraft(EventReportType.EMERGENCY, now);
    expect(draft.occurredOn).toBe('2026-08-22');
    expect(timeOfDay(draft.startedAt)).toBe('20:14');
  });

  it('guesses nothing else — an unanswered question beats a wrong default', () => {
    const draft = emptyDraft(EventReportType.EMERGENCY, now);
    expect(draft.locationType).toBe('');
    expect(draft.localityId).toBe('');
    expect(draft.endedAt).toBeNull();
    expect(draft.crew).toEqual([]);
    expect(draft.vehicles).toEqual([]);
    expect(draft.victims).toEqual([]);
    expect(draft.inemSupportUnits).toEqual([]);
    expect(draft.operationalReport).toBe('');
  });

  it('agrees with todayIso', () => {
    expect(emptyDraft(EventReportType.EMERGENCY, now).occurredOn).toBe(todayIso(now));
  });
});

describe('retypeDraft', () => {
  const emergencyDraft = {
    ...emptyDraft(EventReportType.EMERGENCY, new Date(2026, 7, 22, 20, 14)),
    activationAt: new Date(2026, 7, 22, 20, 14).toISOString(),
    sceneArrivalAt: new Date(2026, 7, 22, 20, 26).toISOString(),
    vehicles: [{ vehicleId: 'veh-a', kilometres: 42 }],
    victims: [
      {
        gender: Gender.FEMALE,
        age: 67,
        destinationKind: VictimDestinationKind.HOSPITAL,
        destinationHospitalId: 'hosp-1',
      },
    ],
    inemSupportUnits: [{ unitType: InemSupportUnitType.VMER, hospitalId: 'hosp-1' }],
  };

  it('drops the chronology when the new type has none', () => {
    const next = retypeDraft(emergencyDraft, EventReportType.LOCAL_SUPPORT);

    expect(next.type).toBe(EventReportType.LOCAL_SUPPORT);
    expect(next.activationAt).toBeNull();
    expect(next.sceneArrivalAt).toBeNull();
  });

  it('keeps the chronology when it moves between two types that have one', () => {
    const next = retypeDraft(emergencyDraft, EventReportType.EMERGENCY);
    expect(next.activationAt).toBe(emergencyDraft.activationAt);
  });

  it('drops INEM support units when the new type has no CODU involvement', () => {
    const next = retypeDraft(emergencyDraft, EventReportType.LOCAL_SUPPORT);
    expect(next.inemSupportUnits).toEqual([]);
  });

  it('keeps INEM support units on an emergency', () => {
    const next = retypeDraft(emergencyDraft, EventReportType.EMERGENCY);
    expect(next.inemSupportUnits).toEqual(emergencyDraft.inemSupportUnits);
  });

  it('trims vehicles and victims down to what the new type allows', () => {
    const support = {
      ...emergencyDraft,
      type: EventReportType.LOCAL_SUPPORT,
      vehicles: [
        { vehicleId: 'a', kilometres: 1 },
        { vehicleId: 'b', kilometres: 2 },
        { vehicleId: 'c', kilometres: 3 },
      ],
      victims: [
        { gender: Gender.MALE, age: 1, destinationKind: VictimDestinationKind.CANCELLED },
        { gender: Gender.MALE, age: 2, destinationKind: VictimDestinationKind.CANCELLED },
      ],
    };

    const next = retypeDraft(support, EventReportType.EMERGENCY);

    expect(next.vehicles).toHaveLength(1);
    expect(next.vehicles[0].vehicleId).toBe('a');
    expect(next.victims).toHaveLength(1);
  });

  it('leaves everything else alone', () => {
    const next = retypeDraft(emergencyDraft, EventReportType.SALOP_SUPPORT);
    expect(next.occurredOn).toBe(emergencyDraft.occurredOn);
    expect(next.startedAt).toBe(emergencyDraft.startedAt);
  });
});

describe('draftFromReport', () => {
  it('round-trips a stored report into something the form can edit', () => {
    const report = {
      id: 'rep-1',
      type: EventReportType.LOCAL_SUPPORT,
      number: 14,
      year: 2026,
      occurredOn: '2026-08-16',
      startedAt: '2026-08-16T09:00:00.000Z',
      endedAt: '2026-08-16T18:30:00.000Z',
      externalReference: 'REF-9',
      locationType: 'PUBLIC_SPACE',
      localityId: 'loc-1',
      operationalReport: '<p>Relato.</p>',
      shift: { scheduleId: 'sch-1', date: '2026-08-16', slot: 1, label: '09:00–18:30' },
      crew: [{ id: 'c1', userId: 'u1', roleName: 'Driver', position: 0 }],
      vehicles: [
        { id: 'v1', vehicleId: 'veh-1', kilometres: 51, position: 0, isOverridden: false },
      ],
      victims: [
        {
          id: 'vic1',
          position: 0,
          gender: Gender.FEMALE,
          age: 67,
          destinationKind: VictimDestinationKind.HOSPITAL,
          destinationHospitalId: 'hosp-1',
        },
      ],
      inemSupportUnits: [],
      attachments: [],
      createdById: 'u1',
      createdAt: '2026-08-16T19:00:00.000Z',
      updatedAt: '2026-08-16T19:00:00.000Z',
    } as never;

    expect(draftFromReport(report)).toEqual({
      type: EventReportType.LOCAL_SUPPORT,
      occurredOn: '2026-08-16',
      startedAt: '2026-08-16T09:00:00.000Z',
      endedAt: '2026-08-16T18:30:00.000Z',
      externalReference: 'REF-9',
      locationType: 'PUBLIC_SPACE',
      localityId: 'loc-1',
      activationAt: null,
      sceneArrivalAt: null,
      sceneDepartureAt: null,
      hospitalArrivalAt: null,
      availableAt: null,
      // The label is display-only and is not part of what gets sent back.
      shift: { scheduleId: 'sch-1', date: '2026-08-16', slot: 1 },
      operationalReport: '<p>Relato.</p>',
      crew: [{ userId: 'u1', roleName: 'Driver' }],
      // The route legs travel with the line: they are how a distance is
      // explainable a year later, and an edit that dropped them would turn a
      // measurement into a typed figure.
      vehicles: [
        { vehicleId: 'veh-1', kilometres: 51, routeLegs: null, isOverridden: false },
      ],
      victims: [
        {
          gender: Gender.FEMALE,
          age: 67,
          destinationKind: VictimDestinationKind.HOSPITAL,
          destinationHospitalId: 'hosp-1',
        },
      ],
      inemSupportUnits: [],
      // The clinical record round-trips too. Leaving it out would mean opening a
      // report from a live run and saving it threw away every vital taken — the
      // save sends the whole document, so an absent field is a deletion.
      chamuCircumstances: null,
      chamuHistory: null,
      chamuAllergies: null,
      chamuMedication: null,
      chamuLastMeal: null,
      abcde: null,
      assessments: [],
    });
  });

  it('carries the clinical record of an emergency back into the form', () => {
    const report = {
      id: 'rep-2',
      type: EventReportType.EMERGENCY,
      number: 128,
      year: 2026,
      occurredOn: '2026-08-22',
      startedAt: '2026-08-22T20:14:00.000Z',
      endedAt: null,
      externalReference: '2608 4471',
      locationType: 'HOME',
      localityId: 'loc-1',
      operationalReport: '',
      shift: null,
      crew: [],
      vehicles: [],
      victims: [],
      inemSupportUnits: [],
      attachments: [],
      chamuHistory: 'HTA',
      abcde: { C: { status: 'ALTERED', note: 'Hemorragia' } },
      assessments: [
        { id: 'a1', position: 0, takenAt: '2026-08-22T20:31:00.000Z', spo2: 94, systolic: 88 },
      ],
      createdById: 'u1',
      createdAt: '2026-08-22T22:00:00.000Z',
      updatedAt: '2026-08-22T22:00:00.000Z',
    } as never;

    const draft = draftFromReport(report);
    expect(draft.chamuHistory).toBe('HTA');
    expect(draft.abcde).toEqual({ C: { status: 'ALTERED', note: 'Hemorragia' } });
    // The child rows' own ids and display order are the server's business, not
    // the form's — sending them back would be sending back a primary key.
    expect(draft.assessments).toEqual([
      { takenAt: '2026-08-22T20:31:00.000Z', spo2: 94, systolic: 88 },
    ]);
  });

  it('carries the INEM support units of an emergency back into the form', () => {
    const report = {
      id: 'rep-3',
      type: EventReportType.EMERGENCY,
      number: 129,
      year: 2026,
      occurredOn: '2026-08-22',
      startedAt: '2026-08-22T20:14:00.000Z',
      endedAt: null,
      externalReference: '2608 4471',
      locationType: 'HOME',
      localityId: 'loc-1',
      operationalReport: '',
      shift: null,
      crew: [],
      vehicles: [],
      victims: [],
      inemSupportUnits: [
        {
          id: 'ius1',
          position: 0,
          unitType: InemSupportUnitType.VMER,
          hospitalId: 'hosp-1',
          hospital: { id: 'hosp-1', name: 'Hospital Central' },
        },
      ],
      attachments: [],
      createdById: 'u1',
      createdAt: '2026-08-22T22:00:00.000Z',
      updatedAt: '2026-08-22T22:00:00.000Z',
    } as never;

    // The unit's own id, position and resolved hospital name are the server's
    // business, not the form's — sending them back would be sending a primary key.
    expect(draftFromReport(report).inemSupportUnits).toEqual([
      { unitType: InemSupportUnitType.VMER, hospitalId: 'hosp-1' },
    ]);
  });
});

describe('surviving a closed app', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips a draft and the step it was on', () => {
    const draft = emptyDraft(EventReportType.EMERGENCY, new Date(2026, 7, 22, 21, 4));
    saveDraft(draft, 'crew', new Date(2026, 7, 22, 21, 5));

    const loaded = loadDraft();
    expect(loaded?.draft).toEqual(draft);
    expect(loaded?.stepId).toBe('crew');
    expect(loaded?.savedAt).toBe(new Date(2026, 7, 22, 21, 5).toISOString());
  });

  it('is null when there is nothing stored', () => {
    expect(loadDraft()).toBeNull();
  });

  it('treats a half-written value as no draft at all', () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, '{not json');
    expect(loadDraft()).toBeNull();
  });

  it('treats a draft with no type as no draft', () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ draft: {} }));
    expect(loadDraft()).toBeNull();
  });

  it('clears', () => {
    saveDraft(emptyDraft(EventReportType.EMERGENCY), 'whenWhere');
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('does not take the screen down when storage refuses to write', () => {
    // Private browsing, or a full quota. The in-memory form must carry on.
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => saveDraft(emptyDraft(EventReportType.EMERGENCY), 'crew')).not.toThrow();
  });

  it('does not take the screen down when storage refuses to read', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(loadDraft()).toBeNull();
  });

  it('does not take the screen down when storage refuses to clear', () => {
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => clearDraft()).not.toThrow();
  });
});
