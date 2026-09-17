/**
 * `ambulancias` → `Vehicle` (9 rows).
 *
 * `seguro`/`inspecao` are nullable in legacy; `insuranceRenewalDate`/
 * `nextImtInspectionDate` are NOT NULL with no DB default. A null becomes
 * `MISSING_DATE_SENTINEL` (1970-01-01), which makes
 * `VehiclesService.findUpcoming` list the vehicle as overdue immediately —
 * the intended nag, listed in `report.md` rather than discovered later.
 *
 * `descricao` (a free-text label, not a manufacturer/model pair legacy never
 * recorded) goes to `Vehicle.notes`, since there is nowhere more specific for
 * it and it is not one of `MATERIAL_TEMPLATE_INFERENCE`'s dropped columns.
 */
import { RunContext, runInLoaderTransaction } from '../run-context';
import { normalisePlate } from '../transform/plate';
import { mapVehicleType } from '../transform/enums';
import { MISSING_DATE_SENTINEL } from '../mapping.config';
import { adoptOrCreate, legacyKey, sourceHash } from '../upsert-engine';
import { AmbulanciasRow } from '../source/row-types';

const ENTITY = 'Vehicle';

export interface VehiclesLoaderReport {
  vehiclesWithSentinelDates: string[];
  nonConformingPlates: Array<{ legacyKey: string; value: string }>;
}

export async function loadVehicles(ctx: RunContext): Promise<VehiclesLoaderReport> {
  const rows = await ctx.source.ambulancias();
  const report: VehiclesLoaderReport = { vehiclesWithSentinelDates: [], nonConformingPlates: [] };

  for (const row of rows) {
    await loadOneVehicle(ctx, row, report);
  }
  return report;
}

async function loadOneVehicle(ctx: RunContext, row: AmbulanciasRow, report: VehiclesLoaderReport): Promise<void> {
  const key = legacyKey('ambulancias', row.n_regional);
  const vehicleType = mapVehicleType(row.tipo);
  if (!vehicleType) {
    ctx.counters.reject(ENTITY);
    ctx.rejects.write(ENTITY, {
      legacyKey: key,
      reasonCode: 'UNKNOWN_VEHICLE_TYPE',
      reason: `ambulancias.tipo "${row.tipo}" has no mapping in AMBULANCIA_TIPO_TO_VEHICLE_TYPE.`,
      field: 'tipo',
      valueRedacted: row.tipo,
    });
    return;
  }

  const plate = normalisePlate(row.matricula);
  if (!plate.conforms) {
    report.nonConformingPlates.push({ legacyKey: key, value: plate.value });
  }

  const usedSentinelInsurance = !row.seguro;
  const usedSentinelInspection = !row.inspecao;
  if (usedSentinelInsurance || usedSentinelInspection) {
    report.vehiclesWithSentinelDates.push(key);
  }

  const data = {
    licensePlate: plate.value,
    numeroCauda: row.n_regional,
    vehicleType,
    insuranceRenewalDate: new Date(`${row.seguro ?? MISSING_DATE_SENTINEL}T00:00:00.000Z`),
    nextImtInspectionDate: new Date(`${row.inspecao ?? MISSING_DATE_SENTINEL}T00:00:00.000Z`),
    notes: row.descricao ?? null,
  };
  const hash = sourceHash(data);

  const result = await runInLoaderTransaction(ctx, (tx) =>
    adoptOrCreate({
      tx,
      entity: ENTITY,
      legacyId: key,
      sourceHash: hash,
      runId: ctx.runId,
      naturalKeyLookup: async () => {
        const byCauda = await tx.vehicle.findUnique({ where: { numeroCauda: data.numeroCauda } });
        if (byCauda) return byCauda.id;
        const byPlate = await tx.vehicle.findUnique({ where: { licensePlate: data.licensePlate } });
        return byPlate?.id ?? null;
      },
      create: async () => (await tx.vehicle.create({ data })).id,
      update: async (id) => {
        await tx.vehicle.update({ where: { id }, data });
      },
    }),
  );

  ctx.counters.record(ENTITY, result.outcome);
}
