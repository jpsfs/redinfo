/**
 * `Material` (grouped by `ambulancias.tipo` → `VehicleType`) →
 * `InventoryTemplate` / `InventoryTemplateItem` (plan §4.9).
 *
 * **Adopts** the two templates `prisma/seed.ts` already creates
 * (`InventoryTemplate.vehicleType` is `@unique`) rather than creating new
 * ones — a bug that tried to create a second `EMERGENCY` template would fail
 * loudly on that constraint, which is the point of adopting instead of
 * guessing whether the seed has run.
 *
 * `templateItemSet(T)` is the **union** across every vehicle of type `T`, not
 * the intersection: for a 9-vehicle fleet, intersection would drop almost the
 * whole catalogue. A vehicle that never carried a given item still gets a
 * `VehicleInventoryItem` (loader 06) with `actualQuantity: null` — "not
 * counted yet" on the recount sheet, not "zero".
 */
import { VehicleType } from '@prisma/client';
import { normaliseAmbulanciaCode } from '../transform/ambulancia-code';
import { mapVehicleType } from '../transform/enums';
import { materialCatalogueKey, medianRoundedUp } from '../transform/material-name';
import { MATERIAL_TEMPLATE_DEFAULTS } from '../mapping.config';
import { RunContext, runInLoaderTransaction } from '../run-context';
import { adoptOrCreate, legacyKey, sourceHash } from '../upsert-engine';

const TEMPLATE_ENTITY = 'InventoryTemplate';
const ITEM_ENTITY = 'InventoryTemplateItem';

export interface TemplateItemInfo {
  templateItemId: string;
  materialItemId: string;
}

export interface InventoryTemplatesResult {
  templateIdByType: Map<VehicleType, string>;
  /** Keyed by `${VehicleType}::${catalogueKey}` — what loader 06 joins against. */
  templateItemByTypeAndKey: Map<string, TemplateItemInfo>;
}

export async function loadInventoryTemplates(
  ctx: RunContext,
  materialItemIdByKey: Map<string, string>,
): Promise<InventoryTemplatesResult> {
  const [ambulancias, materials] = await Promise.all([ctx.source.ambulancias(), ctx.source.material()]);

  const vehicleTypeByCode = new Map<string, VehicleType>();
  for (const row of ambulancias) {
    const type = mapVehicleType(row.tipo);
    if (type) vehicleTypeByCode.set(normaliseAmbulanciaCode(row.n_regional), type as unknown as VehicleType);
  }

  // (VehicleType, catalogueKey) -> the Quantidade_minima values seen across
  // every vehicle of that type carrying the item, plus one raw name for display.
  const perTypeAndKey = new Map<
    string,
    { type: VehicleType; catalogueKey: string; quantities: (number | null)[]; anyRawName: string }
  >();

  for (const material of materials) {
    const type = vehicleTypeByCode.get(normaliseAmbulanciaCode(material.Ambulancia));
    if (!type) continue; // Vehicle type unknown/unmapped — loader 03 already rejects it; nothing to group here.

    const catalogueKey = materialCatalogueKey(material.Descricao);
    const groupKey = `${type}::${catalogueKey}`;
    const entry = perTypeAndKey.get(groupKey) ?? {
      type,
      catalogueKey,
      quantities: [],
      anyRawName: material.Descricao,
    };
    entry.quantities.push(material.Quantidade_minima);
    perTypeAndKey.set(groupKey, entry);
  }

  const templateIdByType = new Map<VehicleType, string>();
  for (const type of [VehicleType.EMERGENCY, VehicleType.TRANSPORT]) {
    templateIdByType.set(type, await loadOneTemplate(ctx, type));
  }

  const templateItemByTypeAndKey = new Map<string, TemplateItemInfo>();
  for (const type of [VehicleType.EMERGENCY, VehicleType.TRANSPORT]) {
    const entries = [...perTypeAndKey.values()]
      .filter((e) => e.type === type)
      .sort((a, b) => a.anyRawName.localeCompare(b.anyRawName));

    for (const [order, entry] of entries.entries()) {
      const materialItemId = materialItemIdByKey.get(entry.catalogueKey);
      if (!materialItemId) continue; // Built from the same source in loader 04 — should always be found.

      const templateItemId = await loadOneTemplateItem(ctx, {
        templateId: templateIdByType.get(type)!,
        type,
        catalogueKey: entry.catalogueKey,
        materialItemId,
        recommendedQuantity: medianRoundedUp(entry.quantities),
        name: entry.anyRawName,
        order,
      });
      templateItemByTypeAndKey.set(`${type}::${entry.catalogueKey}`, { templateItemId, materialItemId });
    }
  }

  return { templateIdByType, templateItemByTypeAndKey };
}

async function loadOneTemplate(ctx: RunContext, vehicleType: VehicleType): Promise<string> {
  const key = legacyKey('inventory-template', vehicleType);
  const result = await runInLoaderTransaction(ctx, (tx) =>
    adoptOrCreate({
      tx,
      entity: TEMPLATE_ENTITY,
      legacyId: key,
      sourceHash: sourceHash({ vehicleType }),
      runId: ctx.runId,
      naturalKeyLookup: async () => (await tx.inventoryTemplate.findUnique({ where: { vehicleType } }))?.id ?? null,
      create: async () => (await tx.inventoryTemplate.create({ data: { vehicleType } })).id,
      update: async () => {}, // Nothing legacy-derived to update — vehicleType is the whole identity.
    }),
  );
  ctx.counters.record(TEMPLATE_ENTITY, result.outcome);
  return result.newId;
}

interface TemplateItemParams {
  templateId: string;
  type: VehicleType;
  catalogueKey: string;
  materialItemId: string;
  recommendedQuantity: number | null;
  name: string;
  order: number;
}

async function loadOneTemplateItem(ctx: RunContext, params: TemplateItemParams): Promise<string> {
  const key = legacyKey('inventory-template-item', params.type, params.catalogueKey);
  const data = {
    templateId: params.templateId,
    materialItemId: params.materialItemId,
    name: params.name,
    type: MATERIAL_TEMPLATE_DEFAULTS.itemType,
    recommendedQuantity: params.recommendedQuantity,
    unit: MATERIAL_TEMPLATE_DEFAULTS.unit,
    order: params.order,
  };
  const hash = sourceHash(data);

  const result = await runInLoaderTransaction(ctx, (tx) =>
    adoptOrCreate({
      tx,
      entity: ITEM_ENTITY,
      legacyId: key,
      sourceHash: hash,
      runId: ctx.runId,
      naturalKeyLookup: async () =>
        (
          await tx.inventoryTemplateItem.findFirst({
            where: { templateId: params.templateId, name: params.name },
          })
        )?.id ?? null,
      create: async () => (await tx.inventoryTemplateItem.create({ data })).id,
      update: async (id) => {
        await tx.inventoryTemplateItem.update({ where: { id }, data });
      },
    }),
  );
  ctx.counters.record(ITEM_ENTITY, result.outcome);
  return result.newId;
}
