/**
 * Every assertion from plan §6, run before any loader writes a row. A
 * failure here means "nothing was written" — `main.ts` exits 1 without
 * opening a single loader transaction.
 *
 * Split into target-database checks (run against Postgres — real in this
 * sandbox, since a dev database is reachable) and source-database checks
 * (run against the legacy MySQL dump — correct here, but **not executable in
 * this sandbox**, which has no MySQL server; see `migration/README.md` and
 * the final report for which is which). Every function takes exactly what it
 * needs rather than a whole `RunContext`, so each is independently testable
 * against a fake without standing up either database.
 */
import { readdirSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { APOIO_INEM_TO_UNIT_TYPE, NO_STRUCTURED_INEM_ROW, TRANSPORTE_TO_DESTINATION } from './mapping.config';
import { normaliseAmbulanciaCode } from './transform/ambulancia-code';
import { LocalityOverride } from './resolvers/locality.resolver';
import { LegacySource } from './source/queries';

export interface PreflightIssue {
  id: string;
  message: string;
}

export interface PreflightResult {
  failures: PreflightIssue[];
  warnings: PreflightIssue[];
}

function ok(): PreflightIssue[] {
  return [];
}

// ─── Target-database prerequisites ─────────────────────────────────────────────

/** #1/#2 — `prisma migrate deploy` is current, checked against the migrations directory on disk. */
export async function assertMigrationsCurrent(
  prisma: PrismaClient,
  migrationsDir: string,
): Promise<PreflightIssue[]> {
  const onDisk = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const newest = onDisk[onDisk.length - 1];
  if (!newest) return [{ id: 'migrations-current', message: `No migrations found under ${migrationsDir}.` }];

  const applied = await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null }>>(
    `SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name = $1`,
    newest,
  );
  const row = applied[0];
  if (!row || !row.finished_at) {
    return [
      {
        id: 'migrations-current',
        message: `Migration "${newest}" is not applied. Run: pnpm --filter backend prisma:migrate:deploy`,
      },
    ];
  }
  return ok();
}

/** #3 — `prisma:seed` (which itself calls `seedGeography()`) has run. */
export async function assertSeedHasRun(prisma: PrismaClient): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  const [municipalities, localities, hospitals, templates] = await Promise.all([
    prisma.municipality.count(),
    prisma.locality.count(),
    prisma.hospital.count(),
    prisma.inventoryTemplate.findMany({ select: { vehicleType: true } }),
  ]);

  if (municipalities < 300) issues.push({ id: 'seed-municipalities', message: `Only ${municipalities} municipalities — expected >= 300.` });
  if (localities < 3000) issues.push({ id: 'seed-localities', message: `Only ${localities} localities — expected >= 3000.` });
  if (hospitals === 0) issues.push({ id: 'seed-hospitals', message: 'No hospitals seeded.' });

  const types = new Set(templates.map((t) => t.vehicleType));
  if (!types.has('EMERGENCY') || !types.has('TRANSPORT')) {
    issues.push({ id: 'seed-inventory-templates', message: 'Missing an InventoryTemplate for EMERGENCY and/or TRANSPORT.' });
  }
  return issues;
}

/** #4 — every hospital `mapping.config.ts` names resolves to exactly one seeded `Hospital`. */
export async function assertMappedHospitalsResolve(prisma: PrismaClient): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  const named = new Map<string, string>();

  for (const mapping of Object.values(TRANSPORTE_TO_DESTINATION)) {
    if (mapping === 'NO_VICTIM' || 'reject' in mapping || !mapping.hospitalName) continue;
    named.set(mapping.hospitalName, mapping.hospitalMunicipality!);
  }
  for (const mapping of Object.values(APOIO_INEM_TO_UNIT_TYPE)) {
    if (mapping === null || mapping === NO_STRUCTURED_INEM_ROW) continue;
    named.set(mapping.hospitalName, mapping.hospitalMunicipality);
  }

  for (const [name, municipality] of named) {
    const matches = await prisma.hospital.findMany({ where: { name, municipality: { name: municipality } } });
    if (matches.length !== 1) {
      issues.push({
        id: 'hospital-mapping',
        message: `"${name}" (${municipality}) resolves to ${matches.length} Hospital rows, expected exactly 1 — a seed rename would turn this into silent rejects.`,
      });
    }
  }
  return issues;
}

/** #5 — every `localityId` named in the overrides CSV actually exists. */
export async function assertOverridesLocalitiesExist(
  prisma: PrismaClient,
  overrides: Map<string, LocalityOverride>,
): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  for (const [legacyText, override] of overrides) {
    const found = await prisma.locality.findUnique({ where: { id: override.localityId } });
    if (!found) {
      issues.push({
        id: 'override-locality-missing',
        message: `locality-map.csv maps "${legacyText}" to localityId "${override.localityId}", which does not exist.`,
      });
    }
  }
  return issues;
}

/** #6 — no `LegacyIdMap.newId` points at a row that no longer exists (sampled, not exhaustive). */
export async function assertLegacyIdMapIntegrity(prisma: PrismaClient, sampleSize = 50): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  const sample = await prisma.legacyIdMap.findMany({ take: sampleSize, orderBy: { lastSeenAt: 'desc' } });

  const checks: Record<string, (id: string) => Promise<boolean>> = {
    User: async (id) => !!(await prisma.user.findUnique({ where: { id } })),
    Vehicle: async (id) => !!(await prisma.vehicle.findUnique({ where: { id } })),
    MaterialItem: async (id) => !!(await prisma.materialItem.findUnique({ where: { id } })),
  };

  for (const row of sample) {
    const check = checks[row.entity];
    if (!check) continue; // No cheap existence check wired up for this entity yet — not a failure.
    if (!(await check(row.newId))) {
      issues.push({
        id: 'legacy-id-map-integrity',
        message: `LegacyIdMap entity=${row.entity} legacyId=${row.legacyId} points at newId=${row.newId}, which no longer exists.`,
      });
    }
  }
  return issues;
}

// ─── Source-database prerequisites ─────────────────────────────────────────────
// Correct, but NOT executable in this sandbox — there is no live MySQL server
// here. See the final report for what this means in practice.

/** #7 — connectivity, and that the source really is a MariaDB 11.x server. */
export async function assertMysqlVersion(query: () => Promise<string>): Promise<PreflightIssue[]> {
  const version = await query();
  if (!/11\.\d+\.\d+-MariaDB/i.test(version)) {
    return [{ id: 'mysql-version', message: `Unexpected SELECT VERSION(): "${version}" — expected MariaDB 11.x.` }];
  }
  return ok();
}

/**
 * #9 — row counts compared against the brief's baseline. A ±20% swing is a
 * warning, not a failure: the whole point is to notice a truncated dump
 * before spending an hour debugging a loader that was never wrong.
 */
export const EXPECTED_ROW_COUNTS: Record<string, number> = {
  usuarios: 74,
  socorrista: 67,
  ambulancias: 9,
  saidas: 1835,
  escala: 4812,
  disponibilidade: 8308,
  horas_voluntariado: 5712,
  Material: 183,
  material_saida: 7312,
};

export function assertRowCountsWithinTolerance(
  actual: Record<string, number>,
  tolerance = 0.2,
): PreflightIssue[] {
  const warnings: PreflightIssue[] = [];
  for (const [table, expected] of Object.entries(EXPECTED_ROW_COUNTS)) {
    const got = actual[table];
    if (got === undefined) continue;
    const delta = Math.abs(got - expected) / expected;
    if (delta > tolerance) {
      warnings.push({
        id: 'row-count-swing',
        message: `${table}: expected ~${expected} rows, dump has ${got} (${Math.round(delta * 100)}% off).`,
      });
    }
  }
  return warnings;
}

/**
 * #10 — the F6 join-shape assertions, as pure functions over already-fetched
 * rows (never row *contents* in the message — codes and counts only).
 */
export function assertAmbulanciaJoinShape(
  saidasAmbulancias: readonly number[],
  materialAmbulancias: readonly number[],
  legacyRegionalCodes: readonly string[],
): PreflightIssue[] {
  const known = new Set(legacyRegionalCodes.map(normaliseAmbulanciaCode));
  const unmatched = new Set(
    [...saidasAmbulancias, ...materialAmbulancias]
      .filter((code) => code !== 0)
      .map(normaliseAmbulanciaCode)
      .filter((code) => !known.has(code)),
  );
  return unmatched.size > 0
    ? [{ id: 'join-ambulancia', message: `${unmatched.size} distinct ambulancia code(s) match no ambulancias.n_regional.` }]
    : ok();
}

export function assertCrewJoinShape(
  crewNumbers: readonly number[],
  socorristaNumeros: readonly number[],
): PreflightIssue[] {
  const known = new Set(socorristaNumeros);
  const unmatched = new Set(crewNumbers.filter((n) => n !== 0 && !known.has(n)));
  return unmatched.size > 0
    ? [{ id: 'join-crew', message: `${unmatched.size} distinct crew number(s) match no socorrista.numero.` }]
    : ok();
}

/** Settles F5's `usuarios.id` vs `usuarios.usuario` ambiguity by measurement. */
export function assertUsuariosIdEqualsUsuario(
  rows: readonly { id: string; usuario: string }[],
): PreflightIssue[] {
  const mismatches = rows.filter((row) => /^\d+$/.test(row.usuario) && row.usuario !== row.id);
  return mismatches.length > 0
    ? [{ id: 'usuarios-id-usuario', message: `${mismatches.length} row(s) have a numeric usuario that differs from id.` }]
    : ok();
}

export function assertMaterialSaidaJoinShape(
  materialSaidaIds: readonly { id: string; ano: number }[],
  saidasIds: readonly { id: number; ano: number }[],
): PreflightIssue[] {
  const known = new Set(saidasIds.map((s) => `${s.id}-${s.ano}`));
  const unmatched = materialSaidaIds.filter((m) => !known.has(`${Number.parseInt(m.id, 10)}-${m.ano}`));
  return unmatched.length > 0
    ? [{ id: 'join-material-saida', message: `${unmatched.length} material_saida row(s) match no saidas row after zero-pad normalisation.` }]
    : ok();
}

export function assertEscalaHasNoSocorrista2(columns: readonly string[]): PreflightIssue[] {
  return columns.includes('socorrista_2')
    ? [{ id: 'escala-socorrista-2', message: 'escala now has a socorrista_2 column — plan §10 Q4 needs re-checking against the dump that produced this.' }]
    : ok();
}

// ─── Orchestration ──────────────────────────────────────────────────────────────

export interface RunTargetPreflightParams {
  prisma: PrismaClient;
  migrationsDir: string;
  overrides: Map<string, LocalityOverride>;
}

/** Everything checkable against Postgres alone — runnable in this sandbox. */
export async function runTargetPreflight(params: RunTargetPreflightParams): Promise<PreflightResult> {
  const [migrations, seed, hospitals, overridesExist, integrity] = await Promise.all([
    assertMigrationsCurrent(params.prisma, params.migrationsDir),
    assertSeedHasRun(params.prisma),
    assertMappedHospitalsResolve(params.prisma),
    assertOverridesLocalitiesExist(params.prisma, params.overrides),
    assertLegacyIdMapIntegrity(params.prisma),
  ]);

  return {
    failures: [...migrations, ...seed, ...hospitals, ...overridesExist, ...integrity],
    warnings: [],
  };
}

/**
 * Everything checkable only against the legacy MySQL source. Real in a dev
 * environment with `mysql-legacy` up; **not run in this sandbox**, which has
 * no MySQL server — see the final report.
 */
export async function runSourcePreflight(source: LegacySource, mysqlVersionQuery: () => Promise<string>): Promise<PreflightResult> {
  const [
    version,
    usuarios,
    socorrista,
    ambulancias,
    saidas,
    material,
    materialSaida,
  ] = await Promise.all([
    assertMysqlVersion(mysqlVersionQuery),
    source.usuarios(),
    source.socorrista(),
    source.ambulancias(),
    source.saidas(),
    source.material(),
    source.materialSaida(),
  ]);

  const rowCounts = assertRowCountsWithinTolerance({
    usuarios: usuarios.length,
    socorrista: socorrista.length,
    ambulancias: ambulancias.length,
    saidas: saidas.length,
    Material: material.length,
    material_saida: materialSaida.length,
  });

  const joinShape = [
    ...assertAmbulanciaJoinShape(
      saidas.map((s) => s.ambulancia),
      material.map((m) => m.Ambulancia),
      ambulancias.map((a) => a.n_regional),
    ),
    ...assertCrewJoinShape(
      saidas.flatMap((s) => [s.condutor, s.socorrista1, s.socorrista2]),
      socorrista.map((s) => s.numero),
    ),
    ...assertUsuariosIdEqualsUsuario(usuarios),
    ...assertMaterialSaidaJoinShape(materialSaida, saidas),
  ];

  return { failures: [...version, ...joinShape], warnings: rowCounts };
}
