/**
 * Every hospital named by the resolved entries of `TRANSPORTE_TO_DESTINATION`
 * and `APOIO_INEM_TO_UNIT_TYPE` → `LegacyIdMap`.
 *
 * All of them are already seeded (`seed-geography.ts`) for this dataset, so
 * this loader is expected to **adopt**, never create — `--create-hospitals`
 * exists for a delegation whose data names a hospital the seed does not, but
 * preflight assertion 4 is what catches that *before* this loader would
 * otherwise turn a seed rename into a silent reject 900 rows later.
 *
 * Recording the mapping here (rather than resolving by name inline in the
 * event-report loader) is what makes that loader's own lookups a single
 * `LegacyIdMap` read instead of a `Hospital.findFirst` per row.
 */
import { APOIO_INEM_TO_UNIT_TYPE, NO_STRUCTURED_INEM_ROW, TRANSPORTE_TO_DESTINATION } from '../mapping.config';
import { HospitalResolver } from '../resolvers/hospital.resolver';
import { RunContext, runInLoaderTransaction } from '../run-context';
import { adoptOrCreate, legacyKey, sourceHash } from '../upsert-engine';

const ENTITY = 'Hospital';

export async function loadHospitals(ctx: RunContext, hospitalResolver: HospitalResolver): Promise<void> {
  const named = new Map<string, { name: string; municipality: string }>();

  for (const mapping of Object.values(TRANSPORTE_TO_DESTINATION)) {
    if (mapping === 'NO_VICTIM' || 'reject' in mapping || !mapping.hospitalName) continue;
    named.set(`${mapping.hospitalName}::${mapping.hospitalMunicipality}`, {
      name: mapping.hospitalName,
      municipality: mapping.hospitalMunicipality!,
    });
  }
  for (const mapping of Object.values(APOIO_INEM_TO_UNIT_TYPE)) {
    if (mapping === null || mapping === NO_STRUCTURED_INEM_ROW) continue;
    named.set(`${mapping.hospitalName}::${mapping.hospitalMunicipality}`, {
      name: mapping.hospitalName,
      municipality: mapping.hospitalMunicipality,
    });
  }

  for (const hospital of named.values()) {
    await loadOneHospital(ctx, hospitalResolver, hospital.name, hospital.municipality);
  }
}

async function loadOneHospital(
  ctx: RunContext,
  hospitalResolver: HospitalResolver,
  name: string,
  municipality: string,
): Promise<void> {
  const key = legacyKey('hospital', name, municipality);
  const hash = sourceHash({ name, municipality });

  const result = await runInLoaderTransaction(ctx, (tx) =>
    adoptOrCreate({
      tx,
      entity: ENTITY,
      legacyId: key,
      sourceHash: hash,
      runId: ctx.runId,
      naturalKeyLookup: () => hospitalResolver.resolve(name, municipality),
      create: async () => {
        throw new Error(
          `Hospital "${name}" (${municipality}) is not seeded and --create-hospitals was not given — ` +
            'this should already have failed preflight assertion 4.',
        );
      },
      update: async () => {}, // Hospital rows are coordinator-managed; the mapping is all this loader owns.
    }),
  );

  ctx.counters.record(ENTITY, result.outcome);
}
