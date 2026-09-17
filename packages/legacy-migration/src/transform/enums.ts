/**
 * Thin, total lookups over `mapping.config.ts`.
 *
 * "Total" is the operative word: every function here returns a value for
 * every input, including one it has never seen — `null` for "no mapping
 * exists at all". Every open question this file's tables were once gated on
 * (Q1, Q2) is resolved: an `apoio_inem` code with nowhere structured to go
 * resolves to `NO_STRUCTURED_INEM_ROW`, and a `transporte` code with no safe
 * destination resolves to a `RejectedDestination` — both real, decided
 * outcomes a loader acts on directly, not sentinels asking it to stop.
 *
 * Enum *values* (`Gender.UNKNOWN`, `VolunteerActivityType.OTHER`, …) come
 * from `@prisma/client`, matching `mapping.config.ts` — see that file's doc
 * comment for why. This is the one place "pure" means "no I/O and no
 * `PrismaClient`", not "no import with the string `prisma` in its name":
 * nothing here ever opens a connection.
 */
import { BloodType, CertificationType, EventLocationType, Gender, VehicleType, VolunteerActivityType } from '@prisma/client';
import { foldForSearch } from '@redinfo/shared';
import {
  AMBULANCIA_TIPO_TO_VEHICLE_TYPE,
  APOIO_INEM_TO_UNIT_TYPE,
  CURSO_TRIPULANTE_TO_CERTIFICATION,
  DestinationMapping,
  HORAS_TIPO_TO_ACTIVITY,
  InemUnitMapping,
  MES_LABEL_TO_MONTH,
  NO_STRUCTURED_INEM_ROW,
  NO_VICTIM,
  RejectedDestination,
  SANGUE_TO_BLOOD_TYPE,
  SEXO_TO_GENDER,
  TIPO_LOCAL_TO_LOCATION_TYPE,
  TIPO_OCORRENCIA_LABELS,
  TRANSPORTE_TO_DESTINATION,
} from '../mapping.config';

// Re-exported so a caller never has to import both this file and
// `mapping.config` just to name the sentinel type.
export type { TodoReview } from '../mapping.config';
export { isTodoReview, assertResolved } from '../mapping.config';

/** `tipo_local` → `EventLocationType`, or `null` for a code the table has never seen. */
export function mapLocationType(tipoLocal: string): EventLocationType | null {
  return TIPO_LOCAL_TO_LOCATION_TYPE[tipoLocal] ?? null;
}

/**
 * `tipo_ocorrencia` → the narrative prefix label. `liveLabel` is the
 * `descricao` read from the legacy `tipo_ocorrencia` table at load time — the
 * primary source per §4.2 — and wins whenever it is present; the static table
 * is only the fallback for a code the live lookup has lost.
 */
export function mapOcorrenciaLabel(code: string, liveLabel?: string | null): string | null {
  if (liveLabel) return liveLabel;
  return TIPO_OCORRENCIA_LABELS[code] ?? null;
}

/**
 * `apoio_inem` → its unit type and base hospital.
 * - `undefined` — the code is not in the table at all (a dump with a code this
 *   plan never saw).
 * - `null` — legacy "Nenhum" (`0`): a real answer of "no unit".
 * - `NO_STRUCTURED_INEM_ROW` — a real code with nowhere structured to put it
 *   (Q1, resolved) — the loader notes it in the narrative instead.
 * - `InemUnitMapping` — resolved to a structured row.
 */
export function mapInemUnit(
  code: string,
): InemUnitMapping | typeof NO_STRUCTURED_INEM_ROW | null | undefined {
  if (!(code in APOIO_INEM_TO_UNIT_TYPE)) return undefined;
  return APOIO_INEM_TO_UNIT_TYPE[code];
}

/**
 * `transporte` → victim destination.
 * - `undefined` — unknown code.
 * - `'NO_VICTIM'` — `n1`, no `EventReportVictim` row at all.
 * - `RejectedDestination` — `n6`/`s5` (Q2, resolved): the whole report rejects.
 * - `DestinationMapping` — resolved.
 */
export function mapDestination(
  code: string,
): DestinationMapping | typeof NO_VICTIM | RejectedDestination | undefined {
  if (!(code in TRANSPORTE_TO_DESTINATION)) return undefined;
  return TRANSPORTE_TO_DESTINATION[code];
}

/** `curso_tripulante` → `CertificationType`, or `null` for blank/unknown (an ordinary absence). */
export function mapCertification(cursoTripulante: string | null | undefined): CertificationType | null {
  if (!cursoTripulante) return null;
  return CURSO_TRIPULANTE_TO_CERTIFICATION[foldForSearch(cursoTripulante)] ?? null;
}

/** `ambulancias.tipo` → `VehicleType`, or `null` for a code this fleet has never used. */
export function mapVehicleType(tipo: string): VehicleType | null {
  return AMBULANCIA_TIPO_TO_VEHICLE_TYPE[tipo] ?? null;
}

/** `sexo` → `Gender`. Total by construction: anything unrecognised is `UNKNOWN`, never rejected. */
export function mapGender(sexo: string | null | undefined): Gender {
  if (!sexo) return Gender.UNKNOWN;
  return SEXO_TO_GENDER[foldForSearch(sexo)] ?? Gender.UNKNOWN;
}

/**
 * `sangue` → `BloodType`, tolerant of whitespace, a leading `0` for `O`, and
 * the sign spelled out (`POS`/`NEG`). `null` for anything else — never
 * rejects a row, since blood type is not required anywhere downstream.
 */
export function mapBloodType(sangue: string | null | undefined): BloodType | null {
  if (!sangue) return null;
  const normalised = sangue
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^0/, 'O')
    .replace(/POSITIVO$/, 'POS')
    .replace(/NEGATIVO$/, 'NEG');
  return SANGUE_TO_BLOOD_TYPE[normalised] ?? null;
}

/**
 * `horas_voluntariado.tipo` → `VolunteerActivityType` + the description an
 * `OTHER` entry needs (`validateManualHours`, shared, requires one). Grounded
 * in the legacy `stats` view (F5) for the four known labels; anything else
 * becomes `OTHER` with the legacy label itself as the description, never a
 * rejection — every `tipo` value legacy can hold produces a valid entry.
 */
export function mapVolunteerActivity(tipo: string): {
  activityType: VolunteerActivityType;
  description: string | null;
} {
  const mapped = HORAS_TIPO_TO_ACTIVITY[tipo];
  if (mapped) return { activityType: mapped, description: null };
  return { activityType: VolunteerActivityType.OTHER, description: tipo };
}

/**
 * `escala.mes` → 1–12. Tries the folded label table first, then a plain
 * integer parse (covers `'1'`..`'12'` and zero-padded `'01'`..`'12'`).
 * `null` for anything that resolves to neither — the loader rejects the
 * whole `escala` row, since the date literally cannot be built.
 */
export function lookupMonth(mes: string): number | null {
  const folded = foldForSearch(mes).replace(/\s+/g, '');
  const byLabel = MES_LABEL_TO_MONTH[folded];
  if (byLabel) return byLabel;

  const asNumber = Number.parseInt(mes.trim(), 10);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 12) return asNumber;

  return null;
}
