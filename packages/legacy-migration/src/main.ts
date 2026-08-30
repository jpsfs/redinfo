#!/usr/bin/env ts-node
/**
 * CLI entry point — the only file in this tree with side effects at import
 * time (reading `process.argv`/`process.env`, opening real connections).
 * Everything it calls is a plain function taking explicit arguments, so
 * nothing here needs a mock to be exercised by a test.
 *
 * This package (`@redinfo/legacy-migration`) is deliberately standalone —
 * not a dependency of `@redinfo/backend` and never bundled into its image.
 * An operator runs it directly (`pnpm migrate:legacy`, `ts-node src/main.ts`)
 * from their own machine, or via the throwaway image built from this
 * package's own `Dockerfile`, pointed at whichever `DATABASE_URL` /
 * `LEGACY_MYSQL_*` the target environment needs. It is never deployed
 * alongside the app — see `migration/README.md`. Never assumes an
 * interactive TTY beyond the `--apply` countdown below, which explicitly
 * checks for one first.
 */
import { PrismaClient } from '@prisma/client';
import { isAbsolute, join } from 'path';
import { parseCliArgs, loaderIsSelected } from './cli';
import { createLegacyPool, readLegacyConnectionConfigFromEnv } from './source/mysql-client';
import { MysqlLegacySource } from './source/queries';
import { createRunContext, RunContext } from './run-context';
import { loadLocalityOverrides, LocalityResolver } from './resolvers/locality.resolver';
import { HospitalResolver } from './resolvers/hospital.resolver';
import { UserResolver } from './resolvers/user.resolver';
import { ActorResolver } from './resolvers/actor.resolver';
import { runTargetPreflight } from './preflight';
import { loadSystemActor } from './loaders/00-system-actor.loader';
import { loadUsers, UsersLoaderReport } from './loaders/01-users.loader';
import { loadUserCertifications } from './loaders/02-user-certifications.loader';
import { loadVehicles, VehiclesLoaderReport } from './loaders/03-vehicles.loader';
import { loadMaterialItems } from './loaders/04-material-items.loader';
import { loadInventoryTemplates } from './loaders/05-inventory-templates.loader';
import { loadVehicleInventory } from './loaders/06-vehicle-inventory.loader';
import { loadHospitals } from './loaders/07-hospitals.loader';
import { loadAvailabilityWindows } from './loaders/08-availability-windows.loader';
import { loadAvailabilitySubmissions } from './loaders/09-availability-submissions.loader';
import { loadSchedules } from './loaders/10-schedules.loader';
import { loadScheduleOverrides } from './loaders/11-schedule-overrides.loader';
import { loadEventReports, EventReportsLoaderReport } from './loaders/12-event-reports.loader';
import { loadVolunteerHours } from './loaders/13-volunteer-hours.loader';
import { loadProfileAudits } from './loaders/14-profile-audits.loader';
import { loadRenumbering } from './loaders/15-renumber.loader';
import { writeReport } from './report/report-writer';
import { DryRunRollback } from './upsert-engine';

// Anchored on __dirname, never process.cwd() — this runs under `ts-node`
// with cwd left wherever the caller happens to be (a bare `node`/`ts-node`
// invocation, `pnpm --filter` switching cwd to this package's own directory,
// or a container WORKDIR), and `migration/` plus `packages/backend/prisma/`
// always sit at the same fixed offset from this file regardless of any of
// that.
const REPO_ROOT = join(__dirname, '..', '..', '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'packages', 'backend', 'prisma', 'migrations');
const OVERRIDES_CSV = join(REPO_ROOT, 'migration', 'overrides', 'locality-map.csv');

async function countdownBeforeCommit(seconds: number): Promise<void> {
  if (!process.stdout.isTTY) return; // Never blocks a non-interactive run (a Job, a CI pipeline, a pipe).
  for (let remaining = seconds; remaining > 0; remaining -= 1) {
    process.stdout.write(`\rCommitting in ${remaining}s — Ctrl+C to abort...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  process.stdout.write('\rCommitting now.                          \n');
}

/** Everything `report.md` needs that a loader — rather than a fixed decision — actually computes. */
export interface TrackAReport {
  placeholderEmails: UsersLoaderReport['placeholderEmails'];
  defaultedVolunteerRoles: UsersLoaderReport['defaultedVolunteerRoles'];
  vehiclesWithSentinelDates: VehiclesLoaderReport['vehiclesWithSentinelDates'];
  nonConformingPlates: VehiclesLoaderReport['nonConformingPlates'];
  assumedSubmittedAt: EventReportsLoaderReport['assumedSubmittedAt'];
}

/** The Track A loader pipeline — every loader that needs no further sign-off. */
async function runTrackA(ctx: RunContext): Promise<TrackAReport> {
  ctx.importActorId = await loadSystemActor(ctx);

  const overrides = loadLocalityOverrides(OVERRIDES_CSV);
  const localityResolver = new LocalityResolver(ctx.prisma, overrides);
  const hospitalResolver = new HospitalResolver(ctx, ctx.options.createHospitals);
  const userResolver = new UserResolver(ctx);
  const actorResolver = new ActorResolver(ctx, ctx.importActorId);
  const usuariosRows = await ctx.source.usuarios();
  userResolver.preload(usuariosRows);
  actorResolver.preload(usuariosRows);

  const usersReport = loaderIsSelected('01-users', ctx.options.only)
    ? await loadUsers(ctx, localityResolver)
    : { placeholderEmails: [], defaultedVolunteerRoles: [] };
  if (loaderIsSelected('02-user-certifications', ctx.options.only)) await loadUserCertifications(ctx, userResolver);
  const vehiclesReport = loaderIsSelected('03-vehicles', ctx.options.only)
    ? await loadVehicles(ctx)
    : { vehiclesWithSentinelDates: [], nonConformingPlates: [] };

  const materialItemIdByKey = loaderIsSelected('04-material-items', ctx.options.only)
    ? await loadMaterialItems(ctx)
    : new Map<string, string>();

  const templates = loaderIsSelected('05-inventory-templates', ctx.options.only)
    ? await loadInventoryTemplates(ctx, materialItemIdByKey)
    : null;
  if (templates && loaderIsSelected('06-vehicle-inventory', ctx.options.only)) {
    await loadVehicleInventory(ctx, templates);
  }

  if (loaderIsSelected('07-hospitals', ctx.options.only)) await loadHospitals(ctx, hospitalResolver);

  const windows = loaderIsSelected('08-availability-windows', ctx.options.only)
    ? await loadAvailabilityWindows(ctx)
    : new Map();
  if (loaderIsSelected('09-availability-submissions', ctx.options.only)) {
    await loadAvailabilitySubmissions(ctx, windows, userResolver);
  }
  if (loaderIsSelected('10-schedules', ctx.options.only)) await loadSchedules(ctx, windows, userResolver);
  if (loaderIsSelected('11-schedule-overrides', ctx.options.only)) await loadScheduleOverrides(ctx);

  const eventReports = loaderIsSelected('12-event-reports', ctx.options.only)
    ? await loadEventReports(ctx, localityResolver, userResolver, materialItemIdByKey)
    : { yearsTouched: new Set<number>(), report: { assumedSubmittedAt: [] } };

  if (loaderIsSelected('13-volunteer-hours', ctx.options.only)) await loadVolunteerHours(ctx, userResolver);
  if (loaderIsSelected('14-profile-audits', ctx.options.only)) await loadProfileAudits(ctx, userResolver, actorResolver);

  if (loaderIsSelected('15-renumber', ctx.options.only)) await loadRenumbering(ctx, eventReports.yearsTouched);

  return {
    placeholderEmails: usersReport.placeholderEmails,
    defaultedVolunteerRoles: usersReport.defaultedVolunteerRoles,
    vehiclesWithSentinelDates: vehiclesReport.vehiclesWithSentinelDates,
    nonConformingPlates: vehiclesReport.nonConformingPlates,
    assumedSubmittedAt: eventReports.report.assumedSubmittedAt,
  };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2), { gitShortSha: process.env.GIT_SHORT_SHA });
  // `--out` (or its default) is repo-root-relative, same reasoning as
  // REPO_ROOT above — never left to resolve against whatever cwd happens
  // to be.
  if (!isAbsolute(options.outDir)) options.outDir = join(REPO_ROOT, options.outDir);
  const startedAt = new Date().toISOString();

  const prisma = new PrismaClient();
  const legacyPool = createLegacyPool(readLegacyConnectionConfigFromEnv());
  const source = new MysqlLegacySource(legacyPool);

  try {
    const overrides = loadLocalityOverrides(OVERRIDES_CSV);
    const target = await runTargetPreflight({ prisma, migrationsDir: MIGRATIONS_DIR, overrides });
    if (target.failures.length > 0) {
      for (const failure of target.failures) console.error(`PREFLIGHT FAILED [${failure.id}]: ${failure.message}`);
      process.exitCode = 1;
      return;
    }

    const ctx = createRunContext({ prisma, source, options });

    // Filled in by whichever branch below actually runs `runTrackA` — the
    // dry-run branch can't rely on `$transaction`'s own resolved value for
    // this (the callback always throws `DryRunRollback` to force the
    // rollback, so nothing "returns" from it in the success sense), hence
    // capturing it via this outer variable instead, same as `ctx.counters`
    // and `ctx.rejects` already are.
    let trackAReport: TrackAReport = {
      placeholderEmails: [],
      defaultedVolunteerRoles: [],
      vehiclesWithSentinelDates: [],
      nonConformingPlates: [],
      assumedSubmittedAt: [],
    };

    if (options.apply) {
      console.log(`Overwrite count will be printed before the first commit. Mode: APPLY (run ${options.runId}).`);
      await countdownBeforeCommit(5);
      trackAReport = await runTrackA(ctx);
    } else {
      console.log(`Mode: DRY RUN (run ${options.runId}) — nothing will be written.`);
      await prisma
        .$transaction(
          async (tx) => {
            ctx.sharedTx = tx;
            trackAReport = await runTrackA(ctx);
            throw new DryRunRollback();
          },
          { timeout: 300_000, maxWait: 10_000 },
        )
        .catch((err) => {
          if (!(err instanceof DryRunRollback)) throw err;
        });
    }

    await ctx.rejects.close();
    writeReport(options.outDir, {
      runId: options.runId,
      mode: options.apply ? 'apply' : 'dry-run',
      startedAt,
      finishedAt: new Date().toISOString(),
      gitSha: process.env.GIT_SHORT_SHA ?? 'nogit',
      counters: ctx.counters,
      rejectEntities: ctx.rejects.entitiesWritten(),
      notMigrated: [
        { table: 'MaintenanceEntry', reason: 'No legacy source table exists (plan finding F2).' },
        { table: 'Holiday', reason: 'No legacy source table exists (plan finding F2).' },
        { table: 'VehicleInventoryAudit', reason: 'No legacy source carries oldQuantity/newQuantity (plan finding F2).' },
        { table: 'material_outro', reason: 'One row, explicitly out of scope (plan §10 Q12).' },
        { table: 'ambulancias_hist', reason: 'No audit model exists for vehicle edit history (plan finding F2 / Q6).' },
        { table: 'saidas_hist', reason: 'No audit model exists for report edit history (plan finding F2 / Q6).' },
        { table: 'material_saida_hist', reason: 'No audit model exists for material-consumption edit history (plan finding F2 / Q6).' },
        { table: 'alteracoes_escala', reason: 'No minutes-shaped fact to migrate into ScheduleShiftOverride — see loader 11.' },
      ],
      placeholderEmails: trackAReport.placeholderEmails,
      defaultedVolunteerRoles: trackAReport.defaultedVolunteerRoles,
      vehiclesWithSentinelDates: trackAReport.vehiclesWithSentinelDates,
      nonConformingPlates: trackAReport.nonConformingPlates,
      assumedSubmittedAt: trackAReport.assumedSubmittedAt,
      truncatedNarratives: [],
      unmappedEnumCodes: [],
      droppedColumns: [
        { table: 'Material', columns: ['Tipo', 'Status', 'validade', 'preco_unitario', 'Imagem'] },
        { table: 'socorrista', columns: ['grupo_ii', 'validade_grupoII', 'estado_civil', 'profissao', 'curso', 'num_curso', 'estado'] },
      ],
    });

    if (options.failOnReject && ctx.counters.totalRejected() > 0) {
      console.error(`--fail-on-reject: ${ctx.counters.totalRejected()} row(s) were rejected.`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
    await legacyPool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
