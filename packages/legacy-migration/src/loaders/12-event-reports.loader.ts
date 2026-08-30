/**
 * `saidas` + `material_saida` → `EventReport` and its children (1,835 rows).
 * Every row is an EMERGENCY (plan finding F1). Q1/Q2/Q5/Q7 are all resolved
 * — see `mapping.config.ts` and `migration/README.md`.
 *
 * `submittedAt` (`create_date`): confirmed against the real dump, ~39% of
 * rows still hold MySQL's zero-datetime default rather than a real
 * timestamp. Unlike the sentinel-as-absent fixes elsewhere, `submittedAt`
 * carries real meaning here — `IS NULL` *is* the draft state (see
 * `EventReport`'s own doc comment) — and these are complete historical
 * records, not paperwork still owed, so `resolveSubmittedAt` falls back to
 * `update_date`, then `occurredOn`, rather than `null`. Every fallback is
 * listed in `report.md` as the assumption it is.
 *
 * Writes with the Prisma client directly, never `EventReportsService.create`
 * — see plan §5.7 for why (permission check with no actor here, a
 * per-request-shaped renumber decision 13 excludes, and no upsert path).
 * What *is* reused: `validateEventReport` (the single source of truth this
 * loader must not silently disagree with), `sanitizeReportHtml` (via
 * `transform/narrative.ts`), `foldForSearch` (via the locality resolver),
 * `EVENT_REPORT_TYPE_RULES` (implicitly, through `validateEventReport`), and
 * `EventReportNumbering` — called **twice**: once per chunk, here, because
 * `EventReport_filed_is_numbered` is a deferred constraint trigger that must
 * be satisfied before that chunk's transaction commits (see `loadEventReports`
 * below), and once more by loader 15 at the very end of the whole run, whose
 * full-partition resequence is what makes the numbering correct *across*
 * chunks rather than just within each one.
 *
 * Children are replaced wholesale per report (`deleteMany` then `createMany`,
 * inside the report's own transaction) — the same pattern the service uses
 * on update, and the only one keepable across a re-run of a batched loader.
 *
 * Never reads `saidas.contacto` (Q7 — dropped entirely, nowhere).
 */
import {
  EventReportType as PrismaEventReportType,
  Gender,
  InemSupportUnitType,
  Prisma,
  VictimDestinationKind,
} from '@prisma/client';
import { EventReportInput, EventReportType, validateEventReport } from '@redinfo/shared';
import { EventReportNumbering } from '../../../backend/src/event-reports/event-report-numbering';
import { chunk } from '../chunk';
import { isTodoReview } from '../mapping.config';
import { buildChronology } from '../transform/chronology';
import { mapDestination, mapGender, mapInemUnit, mapLocationType, mapOcorrenciaLabel } from '../transform/enums';
import { buildNarrative } from '../transform/narrative';
import { normaliseAmbulanciaCode } from '../transform/ambulancia-code';
import { materialCatalogueKey } from '../transform/material-name';
import { DEFAULT_LEGACY_TIMEZONE, NO_STRUCTURED_INEM_ROW, SAIDAS_CREW_ROLE_NAMES } from '../mapping.config';
import { LocalityResolver } from '../resolvers/locality.resolver';
import { UserResolver } from '../resolvers/user.resolver';
import { RunContext, runInLoaderTransaction } from '../run-context';
import { AmbulanciasRow, MaterialSaidaRow, SaidasRow } from '../source/row-types';
import { adoptOrCreate, legacyKey, resolveMappedId, sourceHash } from '../upsert-engine';

const ENTITY = 'EventReport';

interface ResolvedCrewMember {
  userId: string;
  roleName: string;
}

interface RejectOutcome {
  reasonCode: string;
  reason: string;
  field?: string;
}

/** Everything preloaded once for the whole loader, rather than per row. */
interface EventReportsContext {
  ambulanciasByCode: Map<string, AmbulanciasRow>;
  materialSaidaByReport: Map<string, MaterialSaidaRow[]>;
  apoioInemLabels: Map<string, string>;
  tipoOcorrenciaLabels: Map<string, string>;
  materialItemIdByKey: Map<string, string>;
}

export interface EventReportsLoaderReport {
  /**
   * Rows where `saidas.create_date` was MySQL's zero-datetime sentinel
   * (confirmed against the real dump: ~39% of all rows) — `submittedAt` fell
   * back to `update_date` where usable, else `occurredOn`, rather than the
   * `null` ("draft") this app gives that meaning to elsewhere. These are
   * complete historical records, not paperwork someone still owes.
   */
  assumedSubmittedAt: Array<{ legacyKey: string; date: string; source: 'update_date' | 'occurredOn' }>;
}

const ZERO_DATETIME = '0000-00-00 00:00:00';

/**
 * `create_date` when usable; otherwise the closest fact still available,
 * flagged in `report.md` since it's a guess rather than the real value.
 */
function resolveSubmittedAt(
  row: SaidasRow,
  occurredOn: string,
  key: string,
  report: EventReportsLoaderReport,
): Date {
  if (row.create_date !== ZERO_DATETIME) return new Date(row.create_date);
  if (row.update_date !== ZERO_DATETIME) {
    report.assumedSubmittedAt.push({ legacyKey: key, date: row.update_date, source: 'update_date' });
    return new Date(row.update_date);
  }
  report.assumedSubmittedAt.push({ legacyKey: key, date: occurredOn, source: 'occurredOn' });
  return new Date(`${occurredOn}T00:00:00.000Z`);
}

function ageFromLegacy(idade: number | null, idadeAM: string | null): { age: number; note: string | null } {
  const raw = idade ?? 0;
  if (!idadeAM || idadeAM === 'Anos') return { age: raw, note: null };

  const unit = idadeAM.toLowerCase();
  const years = unit.startsWith('mes') ? Math.floor(raw / 12) : unit.startsWith('dia') ? Math.floor(raw / 365) : raw;
  return { age: years, note: `idade_AM: ${idadeAM} (idade original: ${raw})` };
}

export async function loadEventReports(
  ctx: RunContext,
  localityResolver: LocalityResolver,
  userResolver: UserResolver,
  materialItemIdByKey: Map<string, string>,
): Promise<{ yearsTouched: Set<number>; report: EventReportsLoaderReport }> {
  const [saidas, ambulancias, materialSaida, apoioInem, tipoOcorrencia] = await Promise.all([
    ctx.source.saidas(ctx.options.since ?? undefined),
    ctx.source.ambulancias(),
    ctx.source.materialSaida(),
    ctx.source.apoioInem(),
    ctx.source.tipoOcorrencia(),
  ]);

  const preload: EventReportsContext = {
    ambulanciasByCode: new Map(ambulancias.map((row) => [normaliseAmbulanciaCode(row.n_regional), row])),
    materialSaidaByReport: new Map(),
    apoioInemLabels: new Map(apoioInem.map((row) => [row.id, row.descricao])),
    tipoOcorrenciaLabels: new Map(tipoOcorrencia.map((row) => [row.id, row.descricao])),
    materialItemIdByKey,
  };
  for (const row of materialSaida) {
    // Zero-pad normalisation (plan finding F6): material_saida.id is
    // varchar(4), saidas.id is int(4) — compare as integers.
    const reportKey = `${Number.parseInt(row.id, 10)}-${row.ano}`;
    preload.materialSaidaByReport.set(reportKey, [...(preload.materialSaidaByReport.get(reportKey) ?? []), row]);
  }

  const yearsTouched = new Set<number>();
  const report: EventReportsLoaderReport = { assumedSubmittedAt: [] };
  const numbering = new EventReportNumbering();

  for (const batch of chunk(saidas, ctx.options.batchSize)) {
    // `EventReport_filed_is_numbered` is a DEFERRABLE ... INITIALLY IMMEDIATE
    // constraint trigger: it checks at the end of the *statement* unless
    // deferred *before* that statement runs. `lockPartition` (which issues
    // `SET CONSTRAINTS ALL DEFERRED`) therefore has to run for every year this
    // chunk might touch **before** the first insert, not after — every
    // distinct `ano` in the batch is knowable up front, so there is no need
    // to discover it row by row first.
    const candidateYears = new Set(batch.map((row) => row.ano));

    await runInLoaderTransaction(ctx, async (tx) => {
      for (const year of candidateYears) {
        await numbering.lockPartition(tx, EventReportType.EMERGENCY, year);
      }

      const yearsInThisChunk = new Set<number>();
      for (const row of batch) {
        const wrote = await loadOneEventReport(ctx, tx, preload, localityResolver, userResolver, row, report);
        if (wrote) {
          yearsTouched.add(row.ano);
          yearsInThisChunk.add(row.ano);
        }
      }

      // A resequence before commit is what actually satisfies the deferred
      // trigger — loader 15's own pass at the very end of the run is what
      // makes the numbering correct *across* chunks, not just within one.
      for (const year of yearsInThisChunk) {
        await numbering.resequence(tx, EventReportType.EMERGENCY, year);
      }
    });
  }

  return { yearsTouched, report };
}

async function loadOneEventReport(
  ctx: RunContext,
  tx: Prisma.TransactionClient,
  preload: EventReportsContext,
  localityResolver: LocalityResolver,
  userResolver: UserResolver,
  row: SaidasRow,
  report: EventReportsLoaderReport,
): Promise<boolean> {
  const key = legacyKey('saidas', row.id, row.ano);

  const reject = (outcome: RejectOutcome): false => {
    ctx.counters.reject(ENTITY);
    ctx.rejects.write(ENTITY, { legacyKey: key, ...outcome });
    return false;
  };

  // ── Chronology ──
  const chronology = buildChronology({
    data: row.data,
    hChamada: row.h_chamada,
    hcl: row.hcl,
    hsl: row.hsl,
    hch: row.hch,
    hd: row.hd,
    timezone: process.env.LEGACY_TIMEZONE ?? DEFAULT_LEGACY_TIMEZONE,
  });
  if (!chronology.ok) {
    return reject({ reasonCode: chronology.problem.code, reason: chronology.problem.message });
  }

  // ── Location ──
  const locationType = mapLocationType(row.tipo_local);
  if (!locationType) {
    return reject({ reasonCode: 'UNKNOWN_LOCATION_TYPE', reason: `tipo_local "${row.tipo_local}" has no mapping.`, field: 'tipo_local' });
  }
  const localityId = await localityResolver.resolve(row.freguesia, key);
  if (!localityId) {
    return reject({ reasonCode: 'UNRESOLVED_LOCALITY', reason: `freguesia "${row.freguesia}" did not resolve.`, field: 'freguesia' });
  }

  // ── Vehicle ──
  const ambulancia = preload.ambulanciasByCode.get(normaliseAmbulanciaCode(row.ambulancia));
  const vehicleId = ambulancia ? await resolveMappedId(tx, 'Vehicle', legacyKey('ambulancias', ambulancia.n_regional)) : null;
  if (!vehicleId) {
    return reject({ reasonCode: 'UNRESOLVED_VEHICLE', reason: `ambulancia "${row.ambulancia}" did not resolve to a Vehicle.`, field: 'ambulancia' });
  }

  // ── Crew ──
  const crew: ResolvedCrewMember[] = [];
  for (const [numero, roleName] of [
    [row.condutor, SAIDAS_CREW_ROLE_NAMES.condutor],
    [row.socorrista1, SAIDAS_CREW_ROLE_NAMES.socorrista1],
    [row.socorrista2, SAIDAS_CREW_ROLE_NAMES.socorrista2],
  ] as const) {
    if (numero === 0) continue;
    const userId = await userResolver.resolve(numero);
    if (userId) crew.push({ userId, roleName });
    // An unresolved individual crew member is noted, not a reason to reject
    // the whole report — validateEventReport places no minimum on crew size.
  }

  // ── Narrative notes (never saidas.contacto — Q7) ──
  const droppedNotes: string[] = [];
  const { age, note: ageNote } = ageFromLegacy(row.idade, row.idade_AM);
  if (ageNote) droppedNotes.push(ageNote);

  // ── INEM support unit (Q1, resolved) ──
  const inemUnits: Array<{ unitType: InemSupportUnitType; hospitalId: string }> = [];
  const inemMapping = mapInemUnit(row.inem);
  if (inemMapping === NO_STRUCTURED_INEM_ROW || inemMapping === undefined) {
    const label = preload.apoioInemLabels.get(row.inem) ?? row.inem;
    droppedNotes.push(`Apoio INEM: ${label}`);
  } else if (inemMapping) {
    const hospitalId = await resolveMappedId(tx, 'Hospital', legacyKey('hospital', inemMapping.hospitalName, inemMapping.hospitalMunicipality));
    if (hospitalId) {
      inemUnits.push({ unitType: inemMapping.unitType, hospitalId });
    } else {
      // Defensive only — loader 07 + preflight assertion 4 should already
      // guarantee this resolves. Never blocks the import (Q1's whole point).
      droppedNotes.push(`Apoio INEM: ${preload.apoioInemLabels.get(row.inem) ?? row.inem} (base hospital not found)`);
    }
  }

  // ── Victim / destination (Q2, resolved) ──
  const destination = mapDestination(row.transporte);
  if (destination === undefined) {
    return reject({ reasonCode: 'UNKNOWN_TRANSPORTE_CODE', reason: `transporte "${row.transporte}" has no mapping.`, field: 'transporte' });
  }
  if (isTodoReview(destination) || (typeof destination === 'object' && 'reject' in destination)) {
    const rejected = destination as { reasonCode: string; reason: string };
    return reject({ reasonCode: rejected.reasonCode, reason: rejected.reason, field: 'transporte' });
  }

  const victims: EventReportInput['victims'] = [];
  let destinationHospitalId: string | null = null;
  if (destination !== 'NO_VICTIM') {
    if (destination.narrativeNote) droppedNotes.push(destination.narrativeNote);
    if (destination.hospitalName) {
      destinationHospitalId = await resolveMappedId(
        tx,
        'Hospital',
        legacyKey('hospital', destination.hospitalName, destination.hospitalMunicipality!),
      );
      if (!destinationHospitalId) {
        return reject({ reasonCode: 'UNRESOLVED_HOSPITAL', reason: `Destination hospital "${destination.hospitalName}" did not resolve.`, field: 'transporte' });
      }
    }
    victims.push({
      gender: mapGender(row.sexo) as unknown as EventReportInput['victims'][number]['gender'],
      age,
      destinationKind: destination.kind as unknown as EventReportInput['victims'][number]['destinationKind'],
      destinationHospitalId,
    });
  }

  // ── Materials ──
  const materialRows = preload.materialSaidaByReport.get(`${row.id}-${row.ano}`) ?? [];
  const materials: NonNullable<EventReportInput['materials']> = [];
  for (const materialRow of materialRows) {
    const materialItemId = preload.materialItemIdByKey.get(materialCatalogueKey(materialRow.material));
    if (!materialItemId) continue; // Built from the same source in loader 04 — should always be found.
    materials.push({
      materialItemId,
      itemType: 'COUNTABLE' as NonNullable<EventReportInput['materials']>[number]['itemType'],
      vehicleId,
      quantity: materialRow.quantidade,
    });
  }

  // ── Narrative ──
  const ocorrenciaLabel = mapOcorrenciaLabel(row.tipo_ocorrencia, preload.tipoOcorrenciaLabels.get(row.tipo_ocorrencia));
  const narrative = buildNarrative({ descricao: row.descricao, ocorrenciaLabel, droppedNotes });

  // ── Validate before writing anything, exactly as the API would ──
  const input: EventReportInput = {
    type: EventReportType.EMERGENCY,
    occurredOn: chronology.result.occurredOn,
    startedAt: chronology.result.startedAt,
    endedAt: chronology.result.endedAt ?? undefined,
    externalReference: row.ficha_codu != null ? String(row.ficha_codu) : undefined,
    locationType: locationType as unknown as EventReportInput['locationType'],
    localityId,
    activationAt: chronology.result.activationAt,
    sceneArrivalAt: chronology.result.sceneArrivalAt ?? undefined,
    sceneDepartureAt: chronology.result.sceneDepartureAt ?? undefined,
    hospitalArrivalAt: chronology.result.hospitalArrivalAt ?? undefined,
    availableAt: chronology.result.availableAt ?? undefined,
    operationalReport: narrative.html,
    crew: crew.map((c) => ({ userId: c.userId, roleName: c.roleName })),
    vehicles: [{ vehicleId, kilometres: row.quilometros }],
    victims,
    inemSupportUnits: inemUnits.map((u) => ({
      unitType: u.unitType as unknown as NonNullable<EventReportInput['inemSupportUnits']>[number]['unitType'],
      hospitalId: u.hospitalId,
    })),
    materials,
  };

  const problem = validateEventReport(input);
  if (problem) {
    return reject({ reasonCode: problem.code, reason: problem.message });
  }

  // ── Write ──
  const reportData = {
    type: PrismaEventReportType.EMERGENCY,
    number: null,
    legacyNumber: row.id,
    year: row.ano,
    submittedAt: resolveSubmittedAt(row, chronology.result.occurredOn, key, report),
    submittedById: ctx.importActorId,
    occurredOn: new Date(`${chronology.result.occurredOn}T00:00:00.000Z`),
    startedAt: new Date(chronology.result.startedAt),
    endedAt: chronology.result.endedAt ? new Date(chronology.result.endedAt) : null,
    externalReference: input.externalReference ?? null,
    locationType: locationType,
    localityId,
    activationAt: new Date(chronology.result.activationAt),
    sceneArrivalAt: chronology.result.sceneArrivalAt ? new Date(chronology.result.sceneArrivalAt) : null,
    sceneDepartureAt: chronology.result.sceneDepartureAt ? new Date(chronology.result.sceneDepartureAt) : null,
    hospitalArrivalAt: chronology.result.hospitalArrivalAt ? new Date(chronology.result.hospitalArrivalAt) : null,
    availableAt: chronology.result.availableAt ? new Date(chronology.result.availableAt) : null,
    operationalReport: narrative.html,
    createdById: ctx.importActorId,
  };
  const hash = sourceHash({ reportData, crew, materials, victims, inemUnits });

  const result = await adoptOrCreate({
    tx,
    entity: ENTITY,
    legacyId: key,
    sourceHash: hash,
    runId: ctx.runId,
    naturalKeyLookup: async () =>
      (
        await tx.eventReport.findFirst({
          where: { type: PrismaEventReportType.EMERGENCY, year: row.ano, legacyNumber: row.id },
        })
      )?.id ?? null,
    create: async () => (await tx.eventReport.create({ data: reportData })).id,
    update: async (id) => {
      await tx.eventReport.update({ where: { id }, data: reportData });
    },
  });

  ctx.counters.record(ENTITY, result.outcome);

  if (result.outcome !== 'unchanged') {
    const reportId = result.newId;
    await Promise.all([
      tx.eventReportCrewMember.deleteMany({ where: { reportId } }),
      tx.eventReportVehicle.deleteMany({ where: { reportId } }),
      tx.eventReportMaterial.deleteMany({ where: { reportId } }),
      tx.eventReportVictim.deleteMany({ where: { reportId } }),
      tx.eventReportInemSupportUnit.deleteMany({ where: { reportId } }),
    ]);

    if (crew.length > 0) {
      await tx.eventReportCrewMember.createMany({
        data: crew.map((c, position) => ({ reportId, userId: c.userId, roleName: c.roleName, position })),
      });
    }
    await tx.eventReportVehicle.create({ data: { reportId, vehicleId, kilometres: row.quilometros, position: 0 } });
    if (materials.length > 0) {
      await tx.eventReportMaterial.createMany({
        data: materials.map((m, position) => ({
          reportId,
          materialItemId: m.materialItemId,
          vehicleId: m.vehicleId!,
          quantity: m.quantity ?? null,
          position,
        })),
      });
    }
    if (victims.length > 0) {
      await tx.eventReportVictim.createMany({
        data: victims.map((v, position) => ({
          reportId,
          position,
          gender: v.gender as unknown as Gender,
          age: v.age,
          destinationKind: v.destinationKind as unknown as VictimDestinationKind,
          destinationHospitalId: v.destinationHospitalId ?? null,
        })),
      });
    }
    if (inemUnits.length > 0) {
      await tx.eventReportInemSupportUnit.createMany({
        data: inemUnits.map((u, position) => ({ reportId, unitType: u.unitType, hospitalId: u.hospitalId, position })),
      });
    }
  }

  return true;
}
