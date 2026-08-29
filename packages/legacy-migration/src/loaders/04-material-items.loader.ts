/**
 * `Material.Descricao` ∪ `material_saida.material` → `MaterialItem` (~200
 * distinct catalogue entries, per plan §4.9).
 *
 * One `MaterialItem` per folded name (`materialCatalogueKey`), regardless of
 * which of the two legacy tables it came from — `material_saida.material`
 * (consumption lines) absorbs into the same catalogue as `Material.Descricao`
 * (vehicle sheets) so `EventReportMaterial.materialItemId` (Restrict, NOT
 * NULL) always has somewhere to point once the event-report loader exists,
 * even for a name that was only ever ordered off a vehicle checklist.
 * `Material.aviso`, when non-empty, is appended to `notes`; `Tipo`, `Status`,
 * `validade` and `preco_unitario` have no target field and are dropped.
 */
import { canonicalDisplayName, materialCatalogueKey } from '../transform/material-name';
import { MATERIAL_TEMPLATE_DEFAULTS } from '../mapping.config';
import { RunContext, runInLoaderTransaction } from '../run-context';
import { adoptOrCreate, legacyKey, sourceHash } from '../upsert-engine';

const ENTITY = 'MaterialItem';

export interface MaterialCatalogueEntry {
  catalogueKey: string;
  namePt: string;
  notes: string | null;
}

/** Exported so 05/06 (which need the same key→id mapping) don't re-derive it. */
export async function buildMaterialCatalogue(ctx: RunContext): Promise<Map<string, MaterialCatalogueEntry>> {
  const [materials, materialSaida] = await Promise.all([ctx.source.material(), ctx.source.materialSaida()]);

  const rawNamesByKey = new Map<string, string[]>();
  const avisosByKey = new Map<string, Set<string>>();

  for (const row of materials) {
    const key = materialCatalogueKey(row.Descricao);
    rawNamesByKey.set(key, [...(rawNamesByKey.get(key) ?? []), row.Descricao]);
    if (row.aviso) {
      avisosByKey.set(key, (avisosByKey.get(key) ?? new Set()).add(row.aviso));
    }
  }
  for (const row of materialSaida) {
    const key = materialCatalogueKey(row.material);
    rawNamesByKey.set(key, [...(rawNamesByKey.get(key) ?? []), row.material]);
  }

  const catalogue = new Map<string, MaterialCatalogueEntry>();
  for (const [key, rawNames] of rawNamesByKey) {
    const avisos = [...(avisosByKey.get(key) ?? [])];
    catalogue.set(key, {
      catalogueKey: key,
      namePt: canonicalDisplayName(rawNames),
      notes: avisos.length > 0 ? avisos.join(' / ') : null,
    });
  }
  return catalogue;
}

/** `catalogueKey → MaterialItem.id`, for 05/06 to join against. */
export async function loadMaterialItems(ctx: RunContext): Promise<Map<string, string>> {
  const catalogue = await buildMaterialCatalogue(ctx);
  const idByKey = new Map<string, string>();

  for (const entry of catalogue.values()) {
    const id = await loadOneMaterialItem(ctx, entry);
    idByKey.set(entry.catalogueKey, id);
  }
  return idByKey;
}

async function loadOneMaterialItem(ctx: RunContext, entry: MaterialCatalogueEntry): Promise<string> {
  const key = legacyKey('material-item', entry.catalogueKey);
  const data = {
    namePt: entry.namePt,
    unit: MATERIAL_TEMPLATE_DEFAULTS.unit,
    type: MATERIAL_TEMPLATE_DEFAULTS.itemType,
    notes: entry.notes,
  };
  const hash = sourceHash(data);

  const result = await runInLoaderTransaction(ctx, (tx) =>
    adoptOrCreate({
      tx,
      entity: ENTITY,
      legacyId: key,
      sourceHash: hash,
      runId: ctx.runId,
      naturalKeyLookup: async () => (await tx.materialItem.findFirst({ where: { namePt: data.namePt } }))?.id ?? null,
      create: async () => (await tx.materialItem.create({ data })).id,
      update: async (id) => {
        await tx.materialItem.update({ where: { id }, data });
      },
    }),
  );

  ctx.counters.record(ENTITY, result.outcome);
  return result.newId;
}
