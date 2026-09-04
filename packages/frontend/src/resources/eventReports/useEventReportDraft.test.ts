import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EventLocationType,
  EventReportType,
  Gender,
  InventoryItemType,
  VictimDestinationKind,
} from '@redinfo/shared';
import { useEventReportDraft } from './useEventReportDraft';
import { emptyDraft, loadDraft, saveDraft } from './reportDraft';

// ── The state behind both form layouts ─────────────────────────────────────────
//
// The wizard walks the steps and the desktop form shows them at once, but
// neither owns a rule. What matters here: the steps follow the type, every
// change reaches the device, and an edit never inherits somebody's abandoned
// draft.

const coherent = {
  occurredOn: '2026-08-22',
  startedAt: new Date(2026, 7, 22, 20, 14).toISOString(),
  locationType: EventLocationType.HOME,
  localityId: 'loc-1',
  externalReference: '2608 4471',
};

beforeEach(() => window.localStorage.clear());

describe('starting a report', () => {
  it('starts on the first step with today pre-filled', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    expect(result.current.stepId).toBe('whenWhere');
    expect(result.current.isFirstStep).toBe(true);
    expect(result.current.isLastStep).toBe(false);
    expect(result.current.draft.occurredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has ten steps for an emergency and seven for a support report', () => {
    // Ten rather than seven: an emergency carries a chronology, INEM support
    // units *and* a clinical record, and a support report carries none of them.
    const emergency = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );
    expect(emergency.result.current.steps).toHaveLength(10);

    const support = renderHook(() =>
      useEventReportDraft({ type: EventReportType.LOCAL_SUPPORT }),
    );
    expect(support.result.current.steps).toHaveLength(7);
  });
});

describe('walking the steps', () => {
  it('goes forward and back, and stops at both ends', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    act(() => result.current.back());
    expect(result.current.stepId).toBe('whenWhere');

    act(() => result.current.next());
    expect(result.current.stepId).toBe('times');

    for (let i = 0; i < 20; i += 1) act(() => result.current.next());
    expect(result.current.stepId).toBe('review');
    expect(result.current.isLastStep).toBe(true);
  });

  it('skips the chronology step on a support report', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.LOCAL_SUPPORT }),
    );

    act(() => result.current.next());
    expect(result.current.stepId).toBe('crew');
  });

  it('jumps straight to a step, which is how the review screen edits', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    act(() => result.current.goTo('victims'));
    expect(result.current.stepId).toBe('victims');
    expect(result.current.stepIndex).toBe(5);
  });
});

describe('changing the type mid-report', () => {
  it('drops the chronology the new type cannot carry', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    act(() =>
      result.current.patch({ activationAt: new Date(2026, 7, 22, 20, 14).toISOString() }),
    );
    expect(result.current.draft.activationAt).not.toBeNull();

    act(() => result.current.setType(EventReportType.LOCAL_SUPPORT));
    expect(result.current.draft.activationAt).toBeNull();
    expect(result.current.steps).not.toContain('times');
  });

  it('does not leave the wizard stranded on a step that no longer exists', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    act(() => result.current.goTo('times'));
    expect(result.current.stepId).toBe('times');

    act(() => result.current.setType(EventReportType.CNE_SUPPORT));
    // `times` is gone; falling back to the first step beats a blank screen.
    expect(result.current.stepId).toBe('whenWhere');
  });

  it('trims vehicles down when moving to a type that allows fewer', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.LOCAL_SUPPORT }),
    );

    act(() =>
      result.current.patch({
        vehicles: [
          { vehicleId: 'a', kilometres: 10 },
          { vehicleId: 'b', kilometres: 20 },
        ],
      }),
    );
    act(() => result.current.setType(EventReportType.EMERGENCY));

    expect(result.current.draft.vehicles).toHaveLength(1);
  });
});

describe('what blocks a save and what merely warns', () => {
  it('blocks a new report until it says where it happened', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    // Nothing is guessed, so a fresh draft has neither answer. The location
    // type is asked for first.
    expect(result.current.canSave).toBe(false);
    // A code, not prose: the screen translates it, so the crew never reads the
    // API's English sentence.
    expect(result.current.error?.code).toBe('MISSING_LOCATION_TYPE');
  });

  it('then asks for the locality, then the CODU number', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    act(() => result.current.patch({ locationType: EventLocationType.HOME }));
    expect(result.current.error?.code).toBe('MISSING_LOCALITY');

    act(() => result.current.patch({ localityId: 'loc-1' }));
    expect(result.current.error?.code).toBe('MISSING_REFERENCE');

    act(() => result.current.patch({ externalReference: '2608 4471' }));
    expect(result.current.canSave).toBe(true);
  });

  it('allows a save with plenty left unfinished', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    act(() => result.current.patch(coherent));

    expect(result.current.canSave).toBe(true);
    expect(result.current.error).toBeNull();
    // …and says what is missing without standing in the way.
    expect(result.current.warnings).toContain('MISSING_END_TIME');
    expect(result.current.warnings).toContain('MISSING_NARRATIVE');
  });

  it('has nothing left to warn about once the report is finished', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    act(() =>
      result.current.patch({
        ...coherent,
        endedAt: new Date(2026, 7, 22, 22, 5).toISOString(),
        activationAt: new Date(2026, 7, 22, 20, 14).toISOString(),
        operationalReport: '<p>Relato.</p>',
        crew: [{ userId: 'u1', roleName: 'Driver' }],
        vehicles: [{ vehicleId: 'veh-1', kilometres: 42 }],
        victims: [
          {
            gender: Gender.FEMALE,
            age: 67,
            destinationKind: VictimDestinationKind.HOSPITAL,
            destinationHospitalId: 'hosp-1',
          },
        ],
      }),
    );

    expect(result.current.warnings).toEqual([]);
    expect(result.current.canSave).toBe(true);
  });
});

describe('surviving a closed app', () => {
  it('writes every change to the device', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    act(() => result.current.patch({ localityId: 'loc-taveiro' }));

    expect(loadDraft()?.draft.localityId).toBe('loc-taveiro');
    expect(result.current.savedAt).not.toBeNull();
  });

  it('round-trips material consumption lines through the device', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    const materials = [
      { materialItemId: 'mat-1', itemType: InventoryItemType.COUNTABLE, vehicleId: 'veh-1', quantity: 4 },
    ];
    act(() => result.current.patch({ materials }));

    expect(result.current.draft.materials).toEqual(materials);
    expect(loadDraft()?.draft.materials).toEqual(materials);
  });

  it('remembers which step the crew had reached', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    act(() => result.current.goTo('crew'));

    expect(loadDraft()?.stepId).toBe('crew');
  });

  it('picks the draft back up, on the step it was left on', () => {
    saveDraft(
      { ...emptyDraft(EventReportType.EMERGENCY), localityId: 'loc-resumed' },
      'vehicles',
    );

    const { result } = renderHook(() => useEventReportDraft({ resume: true }));

    expect(result.current.draft.localityId).toBe('loc-resumed');
    expect(result.current.stepId).toBe('vehicles');
  });

  it('ignores a stored draft unless asked to resume', () => {
    saveDraft(
      { ...emptyDraft(EventReportType.EMERGENCY), localityId: 'loc-resumed' },
      'vehicles',
    );

    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    expect(result.current.draft.localityId).toBe('');
  });

  it('forgets the draft, which is what happens after a successful save', () => {
    const { result } = renderHook(() =>
      useEventReportDraft({ type: EventReportType.EMERGENCY }),
    );

    act(() => result.current.patch({ localityId: 'loc-1' }));
    expect(loadDraft()).not.toBeNull();

    act(() => result.current.forget());
    expect(loadDraft()).toBeNull();
    expect(result.current.savedAt).toBeNull();
  });
});

describe('editing a filed report', () => {
  const report = {
    id: 'rep-1',
    type: EventReportType.LOCAL_SUPPORT,
    number: 14,
    year: 2026,
    occurredOn: '2026-08-16',
    startedAt: '2026-08-16T09:00:00.000Z',
    endedAt: null,
    externalReference: null,
    locationType: EventLocationType.PUBLIC_SPACE,
    localityId: 'loc-condeixa',
    operationalReport: '',
    shift: null,
    crew: [],
    vehicles: [],
    victims: [],
    inemSupportUnits: [],
    attachments: [],
    createdById: 'u1',
    createdAt: '2026-08-16T19:00:00.000Z',
    updatedAt: '2026-08-16T19:00:00.000Z',
  } as never;

  it('starts from the stored report', () => {
    const { result } = renderHook(() => useEventReportDraft({ report }));

    expect(result.current.draft.localityId).toBe('loc-condeixa');
    expect(result.current.draft.type).toBe(EventReportType.LOCAL_SUPPORT);
  });

  it('never inherits somebody’s abandoned draft', () => {
    saveDraft(
      { ...emptyDraft(EventReportType.EMERGENCY), localityId: 'loc-someone-else' },
      'crew',
    );

    const { result } = renderHook(() => useEventReportDraft({ report, resume: true }));

    expect(result.current.draft.localityId).toBe('loc-condeixa');
  });

  it('does not write over the draft slot while editing', () => {
    const other = { ...emptyDraft(EventReportType.EMERGENCY), localityId: 'loc-untouched' };
    saveDraft(other, 'crew');

    const { result } = renderHook(() => useEventReportDraft({ report }));
    act(() => result.current.patch({ localityId: 'loc-changed' }));

    // An edit in progress is server-backed; the device's draft belongs to a
    // different, unfinished report and must survive untouched.
    expect(loadDraft()?.draft.localityId).toBe('loc-untouched');
  });
});
