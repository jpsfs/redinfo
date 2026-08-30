/**
 * `Material` (183 rows, one per `(Ambulancia, Descricao)`) →
 * `VehicleInventoryItem`.
 *
 * `Quantidade` (a live count) becomes `actualQuantity` — never
 * `Quantidade_minima`, which loader 05 already used for the *template's*
 * `recommendedQuantity`. `templateVersion` is read live from the seeded
 * `InventoryTemplate` at write time, matching `inventory.service.ts`'s own
 * convention for what that column means.
 */
import { normaliseAmbulanciaCode } from '../transform/ambulancia-code';
import { mapVehicleType } from '../transform/enums';
import { materialCatalogueKey } from '../transform/material-name';
import { RunContext, runInLoaderTransaction } from '../run-context';
import { InventoryTemplatesResult } from './05-inventory-templates.loader';
import { adoptOrCreate, legacyKey, resolveMappedId, sourceHash } from '../upsert-engine';

const ENTITY = 'VehicleInventoryItem';

export async function loadVehicleInventory(ctx: RunContext, templates: InventoryTemplatesResult): Promise<void> {
  const [ambulancias, materials] = await Promise.all([ctx.source.ambulancias(), ctx.source.material()]);

  const nRegionalByCode = new Map<string, string>();
  const typeByCode = new Map<string, string>();
  for (const row of ambulancias) {
    const code = normaliseAmbulanciaCode(row.n_regional);
    nRegionalByCode.set(code, row.n_regional);
    const type = mapVehicleType(row.tipo);
    if (type) typeByCode.set(code, type);
  }

  for (const material of materials) {
    const code = normaliseAmbulanciaCode(material.Ambulancia);
    const nRegional = nRegionalByCode.get(code);
    const vehicleType = typeByCode.get(code);
    const key = legacyKey('Material', material.Ambulancia, material.Descricao);

    if (!nRegional || !vehicleType) {
      // The vehicle itself was rejected in loader 03 (unknown tipo) or does
      // not exist at all — nothing to attach this stock line to.
      ctx.counters.reject(ENTITY);
      ctx.rejects.write(ENTITY, {
        legacyKey: key,
        reasonCode: 'UNRESOLVED_VEHICLE',
        reason: `No vehicle resolves for ambulancia code "${material.Ambulancia}".`,
        field: 'Ambulancia',
        valueRedacted: String(material.Ambulancia),
      });
      continue;
    }

    const templateItem = templates.templateItemByTypeAndKey.get(
      `${vehicleType}::${materialCatalogueKey(material.Descricao)}`,
    );
    if (!templateItem) {
      // Should not happen — loader 05 builds this set from the same Material
      // rows — but a defensive reject beats a thrown exception mid-run.
      ctx.counters.reject(ENTITY);
      ctx.rejects.write(ENTITY, {
        legacyKey: key,
        reasonCode: 'NO_TEMPLATE_ITEM',
        reason: 'No InventoryTemplateItem was built for this (vehicleType, material) pair.',
      });
      continue;
    }

    await loadOneVehicleInventoryItem(ctx, key, legacyKey('ambulancias', nRegional), templateItem.templateItemId, material.Quantidade);
  }
}

async function loadOneVehicleInventoryItem(
  ctx: RunContext,
  key: string,
  vehicleLegacyKey: string,
  templateItemId: string,
  actualQuantity: number | null,
): Promise<void> {
  const result = await runInLoaderTransaction(ctx, async (tx) => {
    const vehicleId = await resolveMappedId(tx, 'Vehicle', vehicleLegacyKey);
    if (!vehicleId) {
      throw new Error(`VehicleInventoryItem ${key}: no LegacyIdMap row for Vehicle ${vehicleLegacyKey}.`);
    }
    const template = await tx.inventoryTemplateItem.findUnique({
      where: { id: templateItemId },
      select: { template: { select: { version: true } } },
    });

    const data = {
      vehicleId,
      templateItemId,
      actualQuantity,
      templateVersion: template?.template.version ?? 1,
    };

    return adoptOrCreate({
      tx,
      entity: ENTITY,
      legacyId: key,
      sourceHash: sourceHash(data),
      runId: ctx.runId,
      naturalKeyLookup: async () =>
        (
          await tx.vehicleInventoryItem.findUnique({
            where: { vehicleId_templateItemId: { vehicleId, templateItemId } },
          })
        )?.id ?? null,
      create: async () => (await tx.vehicleInventoryItem.create({ data })).id,
      update: async (id) => {
        await tx.vehicleInventoryItem.update({ where: { id }, data: { actualQuantity, templateVersion: data.templateVersion } });
      },
    });
  });

  ctx.counters.record(ENTITY, result.outcome);
}
