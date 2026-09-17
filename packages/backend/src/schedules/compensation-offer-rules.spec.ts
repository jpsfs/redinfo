import {
  AssignmentCompensationKind,
  CompensationOfferKind,
  resolveCompensationOffer,
  shiftHasUnclassifiedPaidCrew,
  validateCompensationOffer,
} from '@redinfo/shared';

// ── The visible offer (#246 Stage 2) ────────────────────────────────────────
//
// `resolveCompensationOffer` decides which one row's fields apply — never a
// splice of the two. Pure, so this is where the "never field-wise ??" rule
// (D4) gets pinned down against the exact case that would otherwise slip
// through silently.

const { HOURLY, FIXED, NONE } = CompensationOfferKind;

describe('resolveCompensationOffer', () => {
  it('returns null when neither row ever offered anything', () => {
    expect(resolveCompensationOffer(undefined, undefined)).toBeNull();
    expect(resolveCompensationOffer({ compensationKind: null }, { compensationKind: null })).toBeNull();
  });

  it('falls back to the window when the schedule has never touched it', () => {
    const offer = resolveCompensationOffer(
      { compensationKind: null },
      { compensationKind: HOURLY, compensationRateCents: 500 },
    );
    expect(offer).toEqual({ kind: HOURLY, rateCents: 500, amountCents: null });
  });

  it('replaces the window entirely once the schedule sets a kind of its own', () => {
    const offer = resolveCompensationOffer(
      { compensationKind: FIXED, compensationAmountCents: 2500 },
      { compensationKind: HOURLY, compensationRateCents: 500 },
    );
    expect(offer).toEqual({ kind: FIXED, rateCents: null, amountCents: 2500 });
  });

  // The exact regression this function exists to prevent: a schedule that
  // switched kind to HOURLY but was never given its own rate must not read
  // the window's FIXED amount instead — that would invent a rate nobody set.
  it("never splices the window's amount into a schedule HOURLY offer with no rate of its own", () => {
    const offer = resolveCompensationOffer(
      { compensationKind: HOURLY, compensationRateCents: null },
      { compensationKind: FIXED, compensationAmountCents: 2500 },
    );
    expect(offer).toEqual({ kind: HOURLY, rateCents: null, amountCents: null });
  });

  it('an explicit schedule-level NONE cancels a window offer outright', () => {
    const offer = resolveCompensationOffer(
      { compensationKind: NONE },
      { compensationKind: HOURLY, compensationRateCents: 500 },
    );
    expect(offer).toBeNull();
  });

  it('a window-level NONE (withdrawn, never rescinded) resolves to no offer', () => {
    const offer = resolveCompensationOffer(undefined, { compensationKind: NONE });
    expect(offer).toBeNull();
  });
});

describe('validateCompensationOffer', () => {
  it('accepts a coherent HOURLY offer', () => {
    expect(validateCompensationOffer(HOURLY, 500, null)).toBeNull();
  });

  it('accepts a coherent FIXED offer', () => {
    expect(validateCompensationOffer(FIXED, null, 2500)).toBeNull();
  });

  it('accepts NONE with nothing else set', () => {
    expect(validateCompensationOffer(NONE, null, null)).toBeNull();
  });

  it('rejects HOURLY with no rate', () => {
    expect(validateCompensationOffer(HOURLY, null, null)).not.toBeNull();
  });

  it('rejects HOURLY carrying an amount too', () => {
    expect(validateCompensationOffer(HOURLY, 500, 100)).not.toBeNull();
  });

  it('rejects FIXED with no amount', () => {
    expect(validateCompensationOffer(FIXED, null, null)).not.toBeNull();
  });

  it('rejects FIXED carrying a rate too', () => {
    expect(validateCompensationOffer(FIXED, 500, 100)).not.toBeNull();
  });

  it('rejects NONE carrying a rate or amount', () => {
    expect(validateCompensationOffer(NONE, 500, null)).not.toBeNull();
    expect(validateCompensationOffer(NONE, null, 100)).not.toBeNull();
  });

  it('rejects a negative or fractional cents value', () => {
    expect(validateCompensationOffer(HOURLY, -1, null)).not.toBeNull();
    expect(validateCompensationOffer(HOURLY, 5.5, null)).not.toBeNull();
  });
});

describe('shiftHasUnclassifiedPaidCrew', () => {
  const offer = { kind: HOURLY, rateCents: 500, amountCents: null } as const;

  it('is false when no offer resolves, however the crew is classified', () => {
    expect(
      shiftHasUnclassifiedPaidCrew(null, [
        { compensation: AssignmentCompensationKind.VOLUNTEER, compensationSetById: null },
      ]),
    ).toBe(false);
  });

  it('is true when an offer resolves and someone is still at the untouched default', () => {
    expect(
      shiftHasUnclassifiedPaidCrew(offer, [
        { compensation: AssignmentCompensationKind.VOLUNTEER, compensationSetById: null },
      ]),
    ).toBe(true);
  });

  it('is false once a coordinator explicitly chose VOLUNTEER despite the offer', () => {
    expect(
      shiftHasUnclassifiedPaidCrew(offer, [
        { compensation: AssignmentCompensationKind.VOLUNTEER, compensationSetById: 'u-coord' },
      ]),
    ).toBe(false);
  });

  it('is false when everyone on the shift is already PAID or SALARY', () => {
    expect(
      shiftHasUnclassifiedPaidCrew(offer, [
        { compensation: AssignmentCompensationKind.PAID, compensationSetById: 'u-coord' },
        { compensation: AssignmentCompensationKind.SALARY, compensationSetById: null },
      ]),
    ).toBe(false);
  });
});
