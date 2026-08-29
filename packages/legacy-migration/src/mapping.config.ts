/**
 * Legacy → target mapping tables, as data.
 *
 * Pure data only — no functions, no Prisma client, no mysql2, nothing beyond
 * `@redinfo/shared`'s enums and constants. `transform/enums.ts` is the only
 * module that reads this file; every loader reads it through `enums.ts`, never
 * directly, so there is exactly one place that knows how to fall back safely.
 *
 * All of plan §10's open questions (Q1, Q2, Q5, Q6, Q7 — Q3/Q4/Q8/Q9/Q10 were
 * settled earlier) are resolved, so no table below carries a live
 * `TodoReview` sentinel any more. The sentinel machinery itself
 * (`TodoReview`/`todoReview`/`isTodoReview`/`assertResolved`) stays exported:
 * `transform/vitals.ts` still uses it for `avaliacoes_saida.temperatura`'s
 * unresolved scale (Q5's second half — low urgency, dead code today because
 * that table has 0 rows in the live dump). A sentinel is a normal, typed
 * value — nothing here throws — so an unmapped-code path is exercised by the
 * same total lookup functions as every mapped one; what *does* throw is
 * `assertResolved()`, for a caller that finds one where it must not.
 *
 * Enums are imported from `@prisma/client`, not `@redinfo/shared`, even
 * though both define the same values: every mapping here ends up written to
 * a Prisma field, and importing the Prisma-generated enum is what makes that
 * assignment type-check with no cast at every call site, in every loader.
 * `@prisma/client`'s enums are plain string-valued objects with no database
 * dependency at import time, so this does not compromise this file staying
 * pure data with no side effects.
 */
import {
  AvailabilityWindowCategory,
  BloodType,
  CertificationType,
  EventLocationType,
  Gender,
  InemSupportUnitType,
  InventoryItemType,
  UserRole,
  VehicleType,
  VictimDestinationKind,
  VolunteerActivityType,
} from '@prisma/client';

// ─── The open-question sentinel ────────────────────────────────────────────────

/**
 * Marks a mapping table entry this plan cannot resolve without a product
 * decision. Carries the question id so a reject row, a report line or a
 * thrown error can all point at the same place (`migration/README.md`)
 * instead of three slightly different explanations of the same gap.
 */
export interface TodoReview {
  readonly reviewNeeded: true;
  /** e.g. "Q1" — the open-question id in `migration/README.md` / plan §10. */
  readonly question: string;
  readonly note: string;
}

export function todoReview(question: string, note: string): TodoReview {
  return { reviewNeeded: true, question, note };
}

export function isTodoReview(value: unknown): value is TodoReview {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).reviewNeeded === true
  );
}

/**
 * The other half of the sentinel contract: total lookups never throw, but
 * code that is actually about to *use* a mapped value for a write must not
 * silently persist a guess. Track B loaders call this immediately after a
 * lookup that might have returned a sentinel; nothing in Track A calls it,
 * because nothing in Track A resolves a value that could be one.
 */
export function assertResolved<T>(value: T | TodoReview, context: string): T {
  if (isTodoReview(value)) {
    throw new Error(
      `${context}: blocked on open question ${value.question} — ${value.note}. ` +
        'See migration/README.md ("Open questions") before writing this row.',
    );
  }
  return value;
}

// ─── 4.1 tipo_local → EventLocationType ────────────────────────────────────────

/**
 * `PUBLIC_SPACE` intentionally receives nothing — no legacy code means it.
 * `vf` (via férrea) has no good bucket; folded into `OTHER_PUBLIC_LOCATION`
 * with a per-row warning rather than `ROAD`, which would be one degree less
 * true. Not an open question — a labelling call the report surfaces, not one
 * that blocks a write.
 */
export const TIPO_LOCAL_TO_LOCATION_TYPE: Record<string, EventLocationType> = {
  dom: EventLocationType.HOME,
  lt: EventLocationType.WORK_PLACE,
  est: EventLocationType.ROAD,
  aest: EventLocationType.ROAD,
  vu: EventLocationType.ROAD,
  lp: EventLocationType.OTHER_PUBLIC_LOCATION,
  vf: EventLocationType.OTHER_PUBLIC_LOCATION,
};

/** Codes folded into `OTHER_PUBLIC_LOCATION` for want of a better bucket. */
export const TIPO_LOCAL_REVIEW_CODES: ReadonlySet<string> = new Set(['vf']);

// ─── 4.2 tipo_ocorrencia → narrative prefix ────────────────────────────────────

/**
 * Fallback only. The real `descricao` values live in the legacy
 * `tipo_ocorrencia` table and `narrative.ts` should be handed them at load
 * time (`source/queries.ts` reads the whole table once); this is what a code
 * the lookup table has lost falls back to, not the primary source. Not gated
 * on an open question — reconstructed labels are conservative and the report
 * lists which rows used this fallback rather than the live table.
 */
export const TIPO_OCORRENCIA_LABELS: Record<string, string> = {
  af: 'Acidente ferroviário',
  afog: 'Afogamento',
  agr: 'Agressão',
  at: 'Acidente de trabalho',
  atrop: 'Atropelamento',
  av: 'Acidente de viação',
  desab: 'Desabamento',
  ds: 'Doença súbita',
  grav: 'Gravidez/parto',
  inc: 'Incêndio',
  intox: 'Intoxicação',
  queda: 'Queda',
};

// ─── 4.3 apoio_inem → InemSupportUnitType + base hospital ──────────────────────

export interface InemUnitMapping {
  unitType: InemSupportUnitType;
  /** Looked up against `Hospital` by exact `(name, municipality.name)`. */
  hospitalName: string;
  hospitalMunicipality: string;
}

/**
 * `null` = legacy "Nenhum" (`0`): no `EventReportInemSupportUnit` row at all,
 * not an absence of a mapping.
 *
 * `NO_STRUCTURED_INEM_ROW` — **Q1, resolved.** `heli`/`moto`/`pem`/`out` have
 * no `InemSupportUnitType` bucket to become; `vout`/`sivou`/`umip` have a
 * valid type but no base hospital named anywhere in the legacy row (and
 * `hospitalId` is NOT NULL). None of the six becomes a structured
 * `EventReportInemSupportUnit` row — the fact is not lost, it goes into the
 * report's narrative instead (loader 12, using the legacy `apoio_inem
 * .descricao` label read live), and is counted informationally in
 * `report.md`. This is not a reject: the report still imports normally.
 */
export const NO_STRUCTURED_INEM_ROW = 'NO_STRUCTURED_INEM_ROW' as const;

export const APOIO_INEM_TO_UNIT_TYPE: Record<string, InemUnitMapping | typeof NO_STRUCTURED_INEM_ROW | null> = {
  '0': null,
  vbar: {
    unitType: InemSupportUnitType.VMER,
    hospitalName: 'Hospital Santa Maria Maior',
    hospitalMunicipality: 'Barcelos',
  },
  vbra: {
    unitType: InemSupportUnitType.VMER,
    hospitalName: 'Hospital de Braga',
    hospitalMunicipality: 'Braga',
  },
  vfam: {
    unitType: InemSupportUnitType.VMER,
    hospitalName: 'Centro Hospitalar do Médio Ave',
    hospitalMunicipality: 'Vila Nova de Famalicão',
  },
  vgui: {
    unitType: InemSupportUnitType.VMER,
    hospitalName: 'Hospital da Senhora da Oliveira',
    hospitalMunicipality: 'Guimarães',
  },
  vvian: {
    unitType: InemSupportUnitType.VMER,
    hospitalName: 'ULS do Alto Minho — Unidade de Viana do Castelo',
    hospitalMunicipality: 'Viana do Castelo',
  },
  vout: NO_STRUCTURED_INEM_ROW,
  sivpl: {
    unitType: InemSupportUnitType.SIV,
    hospitalName: 'ULS do Alto Minho — Unidade de Ponte de Lima',
    hospitalMunicipality: 'Ponte de Lima',
  },
  sivou: NO_STRUCTURED_INEM_ROW,
  umip: NO_STRUCTURED_INEM_ROW,
  heli: NO_STRUCTURED_INEM_ROW,
  moto: NO_STRUCTURED_INEM_ROW,
  pem: NO_STRUCTURED_INEM_ROW,
  out: NO_STRUCTURED_INEM_ROW,
};

// ─── 4.4 transporte → VictimDestinationKind + hospital ─────────────────────────

export interface DestinationMapping {
  kind: VictimDestinationKind;
  /** Set only for `kind === HOSPITAL`. */
  hospitalName: string | null;
  hospitalMunicipality: string | null;
  /**
   * Set when the mapping loses a nuance worth keeping on record — appended to
   * the report's narrative "not migrated" appendix by loader 12. `n4` is the
   * only case today: `CANCELLED` is the closest true statement, but it drops
   * the "someone else had already taken the victim away" detail.
   */
  narrativeNote?: string;
}

/** Legacy "falso alarme / trote" — the report has zero victims, not one with no destination. */
export const NO_VICTIM = 'NO_VICTIM' as const;

/**
 * A `transporte` code that names no destination this plan can safely write —
 * **Q2, resolved**: the *victim* row is not created and the whole
 * `EventReport` is rejected (never a placeholder Hospital, never a guessed
 * `VictimDestinationKind`), so a human can read the dump and either add a
 * rule or hand-fix the handful of affected reports.
 */
export interface RejectedDestination {
  reject: true;
  reasonCode: string;
  reason: string;
}

function rejectedDestination(reasonCode: string, reason: string): RejectedDestination {
  return { reject: true, reasonCode, reason };
}

/**
 * `n4` ("já transportado por outrem" — someone else had already taken the
 * victim away before the crew arrived) → `CANCELLED`, the closest true
 * statement `EVENT_REPORT_TYPE_RULES.EMERGENCY` allows (`TREATED_ON_SCENE` is
 * invalid there — plan finding F1) — with a `narrativeNote` so the "already
 * transported by someone else" detail is not silently lost.
 *
 * `n6` ("outro") and `s5` ("sim, outro hospital", no name given) both reject
 * the parent report — see `RejectedDestination`.
 */
export const TRANSPORTE_TO_DESTINATION: Record<
  string,
  DestinationMapping | typeof NO_VICTIM | RejectedDestination
> = {
  s1: {
    kind: VictimDestinationKind.HOSPITAL,
    hospitalName: 'Hospital Santa Maria Maior',
    hospitalMunicipality: 'Barcelos',
  },
  s2: {
    kind: VictimDestinationKind.HOSPITAL,
    hospitalName: 'Hospital de Braga',
    hospitalMunicipality: 'Braga',
  },
  s3: {
    kind: VictimDestinationKind.HOSPITAL,
    hospitalName: 'ULS do Alto Minho — Unidade de Viana do Castelo',
    hospitalMunicipality: 'Viana do Castelo',
  },
  s4: {
    kind: VictimDestinationKind.HOSPITAL,
    hospitalName: 'ULS do Alto Minho — Unidade de Ponte de Lima',
    hospitalMunicipality: 'Ponte de Lima',
  },
  s5: rejectedDestination('UNRESOLVED_HOSPITAL_S5', 'transporte=s5 (sim, hospital outro) names no hospital in legacy data.'),
  n1: NO_VICTIM,
  n2: { kind: VictimDestinationKind.DECEASED_ON_SCENE, hospitalName: null, hospitalMunicipality: null },
  n3: { kind: VictimDestinationKind.REFUSED_TRANSPORT, hospitalName: null, hospitalMunicipality: null },
  n4: {
    kind: VictimDestinationKind.CANCELLED,
    hospitalName: null,
    hospitalMunicipality: null,
    narrativeNote: 'Legacy transporte=n4 (já transportado por outrem): victim had already been taken away by another party before the crew arrived.',
  },
  n5: { kind: VictimDestinationKind.CANCELLED, hospitalName: null, hospitalMunicipality: null },
  n6: rejectedDestination('UNRESOLVED_VICTIM_DESTINATION_N6', 'transporte=n6 (outro) is too vague to classify.'),
};

// ─── 4.5 curso_tripulante / tem_carta → CertificationType ──────────────────────

/**
 * Blank/unknown → no certification row (not a sentinel — this is an ordinary
 * absence, listed in the report, not an open question). `CERTIFICATION_IMPLIES`
 * (shared) already grants SBV from TAT and TAT+SBV from TAS at read time, so a
 * materialised SBV row would be a second truth — never write one.
 */
export const CURSO_TRIPULANTE_TO_CERTIFICATION: Record<string, CertificationType> = {
  tat: CertificationType.TAT,
  tas: CertificationType.TAS,
};

// ─── 4.6 ambulancias.tipo → VehicleType (confirmed) ────────────────────────────

/**
 * `B` (ambulância de socorro tipo B) → EMERGENCY; `A1` (transporte tipo A1)
 * and `VDTD` (veículo dedicado ao transporte de doentes) → TRANSPORT.
 * Confirmed by the delegation — this drives which of the two seeded
 * `InventoryTemplate`s each vehicle's material rows land in.
 */
export const AMBULANCIA_TIPO_TO_VEHICLE_TYPE: Record<string, VehicleType> = {
  B: VehicleType.EMERGENCY,
  A1: VehicleType.TRANSPORT,
  VDTD: VehicleType.TRANSPORT,
};

// ─── 4.7 sexo → Gender ──────────────────────────────────────────────────────────

/** Compared case- and accent-insensitively via `foldForSearch` in `enums.ts`. */
export const SEXO_TO_GENDER: Record<string, Gender> = {
  masculino: Gender.MALE,
  feminino: Gender.FEMALE,
};

// ─── 4.8 sangue → BloodType ─────────────────────────────────────────────────────

/**
 * Keys are pre-normalised (uppercased, whitespace stripped, leading `0`
 * folded to `O`) by `enums.ts::mapBloodType` before this table is consulted.
 */
export const SANGUE_TO_BLOOD_TYPE: Record<string, BloodType> = {
  'A+': BloodType.A_POS,
  'A-': BloodType.A_NEG,
  'B+': BloodType.B_POS,
  'B-': BloodType.B_NEG,
  'AB+': BloodType.AB_POS,
  'AB-': BloodType.AB_NEG,
  'O+': BloodType.O_POS,
  'O-': BloodType.O_NEG,
  'APOS': BloodType.A_POS,
  'ANEG': BloodType.A_NEG,
  'BPOS': BloodType.B_POS,
  'BNEG': BloodType.B_NEG,
  'ABPOS': BloodType.AB_POS,
  'ABNEG': BloodType.AB_NEG,
  'OPOS': BloodType.O_POS,
  'ONEG': BloodType.O_NEG,
};

// ─── 4.9 Material → catalogue + template inference ─────────────────────────────

/**
 * Legacy has no unit or unlimited-quantity concept: every migrated item is
 * `COUNTABLE` in whole `pcs`. Not gated — this is the only shape legacy data
 * can support, not a judgement call.
 */
export const MATERIAL_TEMPLATE_DEFAULTS = {
  itemType: InventoryItemType.COUNTABLE,
  unit: 'pcs',
} as const;

/**
 * `templateItemSet` uses "at least one vehicle of the type carries it" rather
 * than "every vehicle does" — the alternative (intersection) would silently
 * drop most of a 9-vehicle fleet's catalogue. A vehicle that never had an item
 * gets a `VehicleInventoryItem` with `actualQuantity: null`, which reads on the
 * recount sheet as "not counted yet" rather than "zero".
 *
 * `recommendedQuantity` is read from `Quantidade_minima` (the intended stock
 * level), never `Quantidade` (a live count, which becomes `actualQuantity`).
 *
 * Fields with no target — `Tipo`, `Status`, `validade`, `preco_unitario`,
 * `Imagem` — are not migrated; `aviso` is appended to `MaterialItem.notes`
 * when non-empty. None of this is gated on an open question.
 */
export const MATERIAL_TEMPLATE_INFERENCE = {
  templateItemMembership: 'UNION' as const,
  recommendedQuantitySource: 'Quantidade_minima' as const,
  droppedColumns: ['Tipo', 'Status', 'validade', 'preco_unitario', 'Imagem'] as const,
  notesColumn: 'aviso' as const,
};

// ─── 4.10 horas_voluntariado.tipo → VolunteerActivityType ──────────────────────

/**
 * Grounded in the legacy `stats` view (plan finding F5), which enumerates
 * exactly these four labels — not a guess. Anything else → `OTHER`, which
 * `validateManualHours` (shared) requires a non-null `description` for; the
 * loader falls back to the legacy `tipo` string itself.
 */
export const HORAS_TIPO_TO_ACTIVITY: Record<string, VolunteerActivityType> = {
  'Escala de Emergência': VolunteerActivityType.EMERGENCY,
  Apoio: VolunteerActivityType.LOCAL_SUPPORT,
  Formação: VolunteerActivityType.TRAINING,
  Reunião: VolunteerActivityType.MEETING,
};

// ─── 4.11 funcao / escala crew slots → AvailabilityWindowRole ──────────────────

/**
 * The three `escala` crew columns are *positions*, not `funcao` codes, so they
 * get their own fixed names rather than a lookup — confirmed by the
 * delegation this session. Note the naming keeps the legacy column names
 * (`socorrista_1`, `socorrista_3`) even though there is no `socorrista_2`:
 * the confirmed role names settle plan §10 Q4 by making the numbering
 * irrelevant — three named seats, however the legacy schema numbered them.
 */
export const ESCALA_ROLE_NAMES = {
  condutor: 'Condutor',
  socorrista1: 'Chefe de Equipa',
  socorrista3: 'Socorrista',
} as const;

/**
 * `saidas`' own three crew columns (`condutor`, `socorrista1`, `socorrista2`
 * — a different pair of names again from `escala`'s) → the `roleName`
 * snapshotted on each `EventReportCrewMember`. Kept consistent with
 * `ESCALA_ROLE_NAMES`'s wording for the same two crew positions, since both
 * ultimately describe the same delegation roles, just recorded by two
 * differently-shaped legacy tables.
 */
export const SAIDAS_CREW_ROLE_NAMES = {
  condutor: 'Condutor',
  socorrista1: 'Chefe de Equipa',
  socorrista2: 'Socorrista',
} as const;

/**
 * Per-role defaults for every synthesised window role (the three above, and
 * every `funcao` row materialised as a role). `maxPeople: 0` is the schema's
 * own "unlimited" sentinel — legacy enforced no cap, so claiming one would be
 * a statement the source data cannot support. Same reasoning for
 * `mandatoryCount: 0` and `requiredCertification: null`.
 */
export const SYNTHETIC_ROLE_DEFAULTS = {
  maxPeople: 0,
  mandatoryCount: 0,
  requiredCertification: null,
} as const;

// ─── 4.12 escala.mes → month number ────────────────────────────────────────────

/**
 * Keys are folded with `foldForSearch` before lookup (in `enums.ts`), so
 * accents and case never matter — `março`, `Março` and `MARCO` all hit `marco`.
 * Numeric and zero-padded forms (`'1'`..`'12'`, `'01'`..`'12'`) are handled by
 * `enums.ts::lookupMonth` parsing the string as an integer when it is not a
 * label here, not by enumerating them in this table.
 */
export const MES_LABEL_TO_MONTH: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3, // "março" folds to this
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

// ─── 4.13 UserProfileAudit sensitive fields ────────────────────────────────────

/**
 * Per the `UserProfileAudit` doc comment: these fields record *that* a change
 * happened with `oldValue`/`newValue` left null. Read by
 * `transform/audit-diff.ts`, used by `14-profile-audits.loader.ts`.
 */
export const SENSITIVE_AUDIT_FIELDS: ReadonlySet<string> = new Set([
  'nif',
  'citizenCardNumber',
  'bloodType',
  'emergencyContactName',
  'emergencyContactPhone',
  'birthDate',
]);

// ─── 4.14 Sentinels ─────────────────────────────────────────────────────────────

/**
 * `Vehicle.insuranceRenewalDate`/`nextImtInspectionDate` are NOT NULL with no
 * DB default; legacy `seguro`/`inspecao` are nullable. `1970-01-01` makes
 * `VehiclesService.findUpcoming` list every such vehicle as overdue — the
 * intended nag, stated in the report rather than discovered later.
 */
export const MISSING_DATE_SENTINEL = '1970-01-01';

/** `v-<legacyId>@import.invalid` — never a real inbox, never resolvable. */
export const PLACEHOLDER_EMAIL_DOMAIN = 'import.invalid';

/**
 * Default for `LEGACY_IMPORT_ACTOR_EMAIL` when unset — kept as a literal here
 * (not read from `process.env`) because this module is pure data; the run
 * context is what actually resolves the env var, falling back to this.
 */
export const DEFAULT_IMPORT_ACTOR_EMAIL = 'import@redinfo.invalid';

/** A volunteer with no clearer role in the source data becomes this. */
export const DEFAULT_VOLUNTEER_ROLE = UserRole.EMERGENCY_OPERATIONAL;

/** The role the import actor itself is created with — see `preflight.ts`. */
export const IMPORT_ACTOR_ROLE = UserRole.SYSTEM_ADMIN;

/**
 * Legacy stores `DATE`/`TIME` with no offset. The delegation is in Barcelos,
 * so wall-clock times are assumed Europe/Lisbon unless `LEGACY_TIMEZONE`
 * overrides it — confirmed by the delegation this session (plan §10 Q8).
 */
export const DEFAULT_LEGACY_TIMEZONE = 'Europe/Lisbon';

/** The category every synthesised `AvailabilityWindow` is created with. */
export const SYNTHETIC_WINDOW_CATEGORY = AvailabilityWindowCategory.EMERGENCY;
