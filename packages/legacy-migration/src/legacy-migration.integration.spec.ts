/**
 * Integration coverage for the legacy-migration harness, run against a real
 * Postgres (skipped with no `DATABASE_URL`, per `packages/backend/CLAUDE.md`).
 *
 * No MySQL container: `LegacySource` (see `source/queries.ts`) is injected as
 * an in-memory fixture with hand-written synthetic data — never production
 * values — which is the entire reason `source/queries.ts` is the only module
 * allowed to speak SQL to the legacy side.
 *
 * Proofs 1, 2, 4 and 6 (plan §8.2) are implemented against the three entities
 * that never depended on an open question: `User`, `Vehicle`, `MaterialItem`.
 * Proofs 3, 5 and 7 are implemented against `EventReport` (loader 12), now
 * that Q1/Q2/Q5/Q6/Q7 are all resolved.
 */
import { EventLocationType, EventReportType as PrismaEventReportType, PrismaClient } from '@prisma/client';
import { createRunContext, RunContext } from './run-context';
import { RunOptions } from './cli';
import { LegacySource } from './source/queries';
import {
  AberturaDisponibilidadeRow,
  AlteracoesEscalaRow,
  AmbulanciasHistRow,
  AmbulanciasRow,
  ApoioInemRow,
  DisponibilidadeRow,
  EscalaRow,
  FuncaoRow,
  HabilitacoesRow,
  HorasVoluntariadoRow,
  MaterialRow,
  MaterialSaidaRow,
  SaidasRow,
  SocorristaHistRow,
  SocorristaRow,
  TipoLocalRow,
  TipoOcorrenciaRow,
  TransporteRow,
  UsuariosHistRow,
  UsuariosRow,
} from './source/row-types';
import { loadSystemActor } from './loaders/00-system-actor.loader';
import { loadUsers } from './loaders/01-users.loader';
import { loadVehicles } from './loaders/03-vehicles.loader';
import { loadMaterialItems } from './loaders/04-material-items.loader';
import { loadEventReports } from './loaders/12-event-reports.loader';
import { loadRenumbering } from './loaders/15-renumber.loader';
import { UserResolver } from './resolvers/user.resolver';
import { LocalityResolver } from './resolvers/locality.resolver';
import { DryRunRollback } from './upsert-engine';

const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

/** Unique per run so parallel test runs against a shared database cannot collide. */
const RUN = `mig-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** A `LegacySource` returning empty arrays for everything except the tables the caller overrides. */
class FixtureLegacySource implements LegacySource {
  usuariosRows: UsuariosRow[] = [];
  socorristaRows: SocorristaRow[] = [];
  ambulanciasRows: AmbulanciasRow[] = [];
  materialRows: MaterialRow[] = [];
  materialSaidaRows: MaterialSaidaRow[] = [];
  saidasRows: SaidasRow[] = [];

  async usuarios() { return this.usuariosRows; }
  async usuariosHist(): Promise<UsuariosHistRow[]> { return []; }
  async socorrista() { return this.socorristaRows; }
  async socorristaHist(): Promise<SocorristaHistRow[]> { return []; }
  async ambulancias() { return this.ambulanciasRows; }
  async ambulanciasHist(): Promise<AmbulanciasHistRow[]> { return []; }
  async material() { return this.materialRows; }
  async materialSaida() { return this.materialSaidaRows; }
  async saidas(): Promise<SaidasRow[]> { return this.saidasRows; }
  async escala(): Promise<EscalaRow[]> { return []; }
  async alteracoesEscala(): Promise<AlteracoesEscalaRow[]> { return []; }
  async disponibilidade(): Promise<DisponibilidadeRow[]> { return []; }
  async aberturaDisponibilidade(): Promise<AberturaDisponibilidadeRow[]> { return []; }
  async horasVoluntariado(): Promise<HorasVoluntariadoRow[]> { return []; }
  async tipoLocal(): Promise<TipoLocalRow[]> { return []; }
  async tipoOcorrencia(): Promise<TipoOcorrenciaRow[]> { return []; }
  async apoioInem(): Promise<ApoioInemRow[]> { return []; }
  async transporte(): Promise<TransporteRow[]> { return []; }
  async funcao(): Promise<FuncaoRow[]> { return []; }
  async habilitacoes(): Promise<HabilitacoesRow[]> { return []; }
}

function makeOptions(overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    apply: true,
    batchSize: 500,
    only: null,
    since: null,
    createHospitals: false,
    failOnReject: false,
    outDir: `/tmp/legacy-migration-test-${RUN}`,
    runId: RUN,
    verbose: false,
    ...overrides,
  };
}

function baseSocorrista(overrides: Partial<SocorristaRow>): SocorristaRow {
  return {
    numero: 1,
    imagem: '',
    sangue: 'A+',
    dae: null,
    n_tripulante: null,
    nome: 'Ana Fixture',
    nascimento: '1990-01-01',
    juramento: null,
    contacto: null,
    contacto2: null,
    sexo: 'feminino',
    curso_tripulante: 'tat',
    habilitacoes: null,
    curso: null,
    num_curso: null,
    estado_civil: null,
    n_carta: null,
    data_validade_carta: null,
    data_bi: null,
    bi: null,
    data_ta: null,
    email: `ana.${RUN}@example.test`,
    rua: null,
    cidade: null,
    freguesia: null,
    cod_postal: null,
    grupo_ii: null,
    validade_grupoII: null,
    nif: null,
    numero_porta: null,
    n_cvp: null,
    tem_carta: null,
    data_inicio_carta: null,
    estado: null,
    profissao: null,
    updated_by: 'admin',
    update_date: '2020-01-01 00:00:00',
    ...overrides,
  };
}

function baseSaidas(overrides: Partial<SaidasRow>): SaidasRow {
  return {
    id: 1,
    ano: 2024,
    estado: '',
    data: '2024-06-10',
    tipo_ocorrencia: 'av',
    ambulancia: 0,
    ficha_codu: 12345,
    idade_AM: 'Anos',
    idade: 30,
    sexo: 'feminino',
    h_chamada: '08:00:00',
    hcl: '08:10:00',
    hsl: '08:30:00',
    hch: null,
    quilometros: 10,
    descricao: 'Descrição original',
    contacto: 0,
    tipo_local: 'dom',
    freguesia: '',
    inem: '0',
    transporte: 'n5',
    condutor: 0,
    socorrista1: 0,
    socorrista2: 0,
    hd: '09:00:00',
    created_by: 'admin',
    create_date: '2024-06-10 09:00:00',
    updated_by: 'admin',
    update_date: '2024-06-10 09:00:00',
    ...overrides,
  };
}

describeIntegration('Legacy migration harness (integration)', () => {
  const prisma = new PrismaClient();
  /** A real, already-seeded freguesia name — resolving it needs no override CSV. */
  let realLocalityName: string;

  beforeAll(async () => {
    const locality = await prisma.locality.findFirst();
    if (!locality) throw new Error('No seeded Locality found — has prisma:seed run against this database?');
    realLocalityName = locality.name;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function freshContext(source: FixtureLegacySource, options?: Partial<RunOptions>): Promise<RunContext> {
    const ctx = createRunContext({ prisma, source, options: makeOptions(options) });
    ctx.importActorId = await loadSystemActor(ctx);
    return ctx;
  }

  /** Users + a vehicle set up via the real Track A loaders, ready for an EventReport to reference. */
  async function setUpCrewAndVehicle(
    ctx: RunContext,
    source: FixtureLegacySource,
    suffix: string,
  ): Promise<{ crewNumero: number; ambulanciaCode: number; nRegional: string }> {
    const crewNumero = 9000 + Math.floor(Math.random() * 999);
    source.usuariosRows.push({
      id: `u-${suffix}`,
      nome: 'Crew Member',
      usuario: String(crewNumero),
      tipo: 'voluntario',
      activo: 1,
      fbid: '',
      updated_by: 'admin',
      update_date: '2020-01-01 00:00:00',
    });
    source.socorristaRows.push(baseSocorrista({ numero: crewNumero, email: `crew-${suffix}@example.test`, nome: 'Crew Member' }));

    // saidas.ambulancia is a plain int (F6) that must normalise to the same
    // string as ambulancias.n_regional — a numeric regional code, not a
    // prefixed one, keeps that comparison trivial here.
    const ambulanciaCode = 8000 + Math.floor(Math.random() * 999);
    const nRegional = String(ambulanciaCode);
    // Vehicle.licensePlate is globally unique — derived from ambulanciaCode
    // so two calls in the same test file never collide the way a hard-coded
    // plate would (a real bug this fixture caught: the second vehicle would
    // "adopt" the first one by plate, then fail to claim it a second time).
    source.ambulanciasRows.push({
      n_regional: nRegional,
      matricula: `${String(ambulanciaCode).padStart(4, '0')}AB`,
      descricao: null,
      seguro: '2027-01-01',
      nome_seguro: 'Seguradora',
      inspecao: '2027-01-01',
      inem: '2020-01-01',
      tipo: 'B',
      imagem: null,
      created_by: null,
      creation_date: null,
      updated_by: null,
      update_date: '2020-01-01 00:00:00',
    });

    await loadUsers(ctx, new LocalityResolver(prisma, new Map()));
    await loadVehicles(ctx);

    return { crewNumero, ambulanciaCode, nRegional };
  }

  function userResolverFor(source: FixtureLegacySource, ctx: RunContext): UserResolver {
    const resolver = new UserResolver(ctx);
    resolver.preload(source.usuariosRows);
    return resolver;
  }

  describe('proof 1 — create', () => {
    it('creates a User, a Vehicle and a MaterialItem, each recorded in LegacyIdMap', async () => {
      const source = new FixtureLegacySource();
      source.usuariosRows = [{ id: `u-${RUN}-1`, nome: 'Usuario Um', usuario: '501', tipo: 'voluntario', activo: 1, fbid: '', updated_by: 'admin', update_date: '2020-01-01 00:00:00' }];
      source.socorristaRows = [baseSocorrista({ numero: 501 })];
      // licensePlate is globally unique — never hard-code the same plate
      // across tests in this file (a real collision this fixture caught).
      const plate = `${String(1000 + Math.floor(Math.random() * 8999)).padStart(4, '0')}AB`;
      source.ambulanciasRows = [{ n_regional: `V-${RUN}`, matricula: plate, descricao: null, seguro: '2027-01-01', nome_seguro: 'Seguradora', inspecao: '2027-01-01', inem: '2020-01-01', tipo: 'B', imagem: null, created_by: null, creation_date: null, updated_by: null, update_date: '2020-01-01 00:00:00' }];
      source.materialRows = [{ Ambulancia: 999999, Descricao: `Luvas ${RUN}`, validade: '2027-01-01', Quantidade: 10, Quantidade_minima: 5, Tipo: 'consumivel', Status: 'OP', aviso: null, Imagem: '', preco_unitario: 1 }];

      const ctx = await freshContext(source);
      await loadUsers(ctx, new LocalityResolver(prisma, new Map()));
      const vehicleReport = await loadVehicles(ctx);
      const materialIds = await loadMaterialItems(ctx);

      expect(vehicleReport.vehiclesWithSentinelDates).toEqual([]);
      expect(materialIds.size).toBe(1);

      const user = await prisma.user.findUnique({ where: { email: `ana.${RUN}@example.test` } });
      expect(user).not.toBeNull();
      const vehicle = await prisma.vehicle.findUnique({ where: { numeroCauda: `V-${RUN}` } });
      expect(vehicle).not.toBeNull();
      const material = await prisma.materialItem.findFirst({ where: { namePt: `Luvas ${RUN}` } });
      expect(material).not.toBeNull();

      const maps = await prisma.legacyIdMap.findMany({
        where: { OR: [{ entity: 'User', newId: user!.id }, { entity: 'Vehicle', newId: vehicle!.id }, { entity: 'MaterialItem', newId: material!.id }] },
      });
      expect(maps).toHaveLength(3);
    });
  });

  describe('proof 2 — idempotent re-run', () => {
    it('a second run with identical source data reports unchanged and touches no ids', async () => {
      const source = new FixtureLegacySource();
      source.usuariosRows = [{ id: `u-${RUN}-2`, nome: 'Usuario Dois', usuario: '502', tipo: 'voluntario', activo: 1, fbid: '', updated_by: 'admin', update_date: '2020-01-01 00:00:00' }];
      source.socorristaRows = [baseSocorrista({ numero: 502, email: `bruno.${RUN}@example.test`, nome: 'Bruno Fixture' })];

      const first = await freshContext(source);
      await loadUsers(first, new LocalityResolver(prisma, new Map()));
      const before = await prisma.user.findUnique({ where: { email: `bruno.${RUN}@example.test` } });

      const second = await freshContext(source, { runId: `${RUN}-second` });
      await loadUsers(second, new LocalityResolver(prisma, new Map()));
      const after = await prisma.user.findUnique({ where: { email: `bruno.${RUN}@example.test` } });

      expect(after!.id).toBe(before!.id);
      expect(after!.createdAt).toEqual(before!.createdAt);

      const map = await prisma.legacyIdMap.findFirst({ where: { entity: 'User', newId: before!.id } });
      expect(map!.lastRunId).toBe(`${RUN}-second`);
      expect(map!.firstRunId).not.toBe(`${RUN}-second`);
    });
  });

  describe('proof 4 — adopt existing', () => {
    it('adopts a pre-existing User with a matching email instead of erroring or duplicating', async () => {
      const email = `pre-existing.${RUN}@example.test`;
      const preExisting = await prisma.user.create({
        data: { email, firstName: 'Pre', lastName: 'Existing', role: 'EMERGENCY_OPERATIONAL' },
      });

      const source = new FixtureLegacySource();
      source.usuariosRows = [{ id: `u-${RUN}-3`, nome: 'Ignored', usuario: '503', tipo: 'voluntario', activo: 1, fbid: '', updated_by: 'admin', update_date: '2020-01-01 00:00:00' }];
      source.socorristaRows = [baseSocorrista({ numero: 503, email, nome: 'Carla Fixture' })];

      const ctx = await freshContext(source);
      await loadUsers(ctx, new LocalityResolver(prisma, new Map()));

      const rows = await prisma.user.findMany({ where: { email } });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(preExisting.id);

      const map = await prisma.legacyIdMap.findFirst({ where: { entity: 'User', newId: preExisting.id } });
      expect(map).not.toBeNull();
    });
  });

  describe('proof 6 — dry run writes nothing', () => {
    it('rolls back every write while still computing real counts', async () => {
      const source = new FixtureLegacySource();
      source.usuariosRows = [{ id: `u-${RUN}-4`, nome: 'Dry Run', usuario: '504', tipo: 'voluntario', activo: 1, fbid: '', updated_by: 'admin', update_date: '2020-01-01 00:00:00' }];
      source.socorristaRows = [baseSocorrista({ numero: 504, email: `dryrun.${RUN}@example.test`, nome: 'Dry Runner' })];

      const usersBefore = await prisma.user.count();
      const mapsBefore = await prisma.legacyIdMap.count();

      // freshContext runs loadSystemActor in (the default) apply mode, so the
      // import actor is a real, committed row — every other loader's dry run
      // needs a real actor to reference, exactly as `main.ts` relies on.
      const ctx = await freshContext(source);
      let sameRunResolution: string | null = null;
      await prisma
        .$transaction(async (tx) => {
          ctx.sharedTx = tx;
          ctx.options.apply = false;
          await loadUsers(ctx, new LocalityResolver(prisma, new Map()));

          // Regression for a real bug found against real legacy production
          // data: a `UserResolver` constructed *after* `ctx.sharedTx` is set
          // (exactly as `main.ts` does) must see the `User` `loadUsers` just
          // created a moment ago in this same still-open transaction — a
          // resolver reading via plain `ctx.prisma` instead cannot, because
          // that query runs on a different connection than `tx` and Postgres
          // never lets one connection see another's uncommitted writes. This
          // resolved every crew number in a dry run to `UNRESOLVED_USER`.
          const sameRunResolver = new UserResolver(ctx);
          sameRunResolver.preload(source.usuariosRows);
          sameRunResolution = await sameRunResolver.resolve(504);

          throw new DryRunRollback();
        })
        .catch((err) => {
          if (!(err instanceof DryRunRollback)) throw err;
        });

      const usersAfter = await prisma.user.count();
      const mapsAfter = await prisma.legacyIdMap.count();

      expect(usersAfter).toBe(usersBefore);
      expect(mapsAfter).toBe(mapsBefore);
      // The counters, however, reflect real work computed inside the rolled-back transaction.
      expect(ctx.counters.get('User').created + ctx.counters.get('User').adopted).toBeGreaterThan(0);
      expect(sameRunResolution).not.toBeNull();

      const dryRunUser = await prisma.user.findUnique({ where: { email: `dryrun.${RUN}@example.test` } });
      expect(dryRunUser).toBeNull();
    });
  });

  describe('proof 3 — update in place', () => {
    it('re-running with a mutated descricao updates the same report row, and legacy always wins over an app edit', async () => {
      const source = new FixtureLegacySource();
      const ctx = await freshContext(source);
      const { crewNumero, ambulanciaCode } = await setUpCrewAndVehicle(ctx, source, `p3-${RUN}`);
      const userResolver = userResolverFor(source, ctx);

      const reportId = 3100 + Math.floor(Math.random() * 999);
      source.saidasRows = [
        baseSaidas({
          id: reportId,
          ano: 2024,
          ambulancia: ambulanciaCode,
          condutor: crewNumero,
          freguesia: realLocalityName,
          descricao: 'Descrição original',
        }),
      ];

      await loadEventReports(ctx, new LocalityResolver(prisma, new Map()), userResolver, new Map());
      const before = await prisma.eventReport.findFirst({
        where: { type: PrismaEventReportType.EMERGENCY, year: 2024, legacyNumber: reportId },
      });
      expect(before).not.toBeNull();
      expect(before!.operationalReport).toContain('Descrição original');

      // Mutate the fixture and re-run: the same row must hold the new value.
      source.saidasRows[0] = { ...source.saidasRows[0], descricao: 'Descrição atualizada' };
      const second = await freshContext(source, { runId: `${RUN}-p3-second` });
      await loadEventReports(second, new LocalityResolver(prisma, new Map()), userResolver, new Map());

      const afterUpdate = await prisma.eventReport.findUnique({ where: { id: before!.id } });
      expect(afterUpdate!.id).toBe(before!.id);
      expect(afterUpdate!.operationalReport).toContain('Descrição atualizada');
      expect(afterUpdate!.operationalReport).not.toContain('Descrição original');
      expect(second.counters.get('EventReport').updated).toBe(1);

      // Simulate a coordinator editing the report directly in the app.
      await prisma.eventReport.update({ where: { id: before!.id }, data: { operationalReport: '<p>App edit</p>' } });

      // Re-run with the SAME (unchanged) legacy source — legacy must win.
      const third = await freshContext(source, { runId: `${RUN}-p3-third` });
      await loadEventReports(third, new LocalityResolver(prisma, new Map()), userResolver, new Map());
      const afterAppEdit = await prisma.eventReport.findUnique({ where: { id: before!.id } });
      expect(afterAppEdit!.operationalReport).toContain('Descrição atualizada');
      expect(afterAppEdit!.operationalReport).not.toContain('App edit');
      expect(third.counters.get('EventReport').unchanged).toBe(1);
    });
  });

  describe('proof 5 — gap-free renumbering', () => {
    it('numbers imported reports 1..n with no gaps, interleaved with a pre-existing non-legacy report', async () => {
      const source = new FixtureLegacySource();
      const ctx = await freshContext(source);
      const { crewNumero, ambulanciaCode } = await setUpCrewAndVehicle(ctx, source, `p5-${RUN}`);
      const userResolver = userResolverFor(source, ctx);
      const year = 2100 + Math.floor(Math.random() * 90); // An otherwise-empty year, isolating this partition.

      const locality = await prisma.locality.findFirst();
      // A real, already-filed report needs a real number — `EventReport
      // _filed_is_numbered` is a deferred constraint trigger that only
      // tolerates "filed but unnumbered" transiently, inside a transaction
      // that goes on to resequence before committing (see loader 12). A
      // pre-existing report from outside a migration run is never in that
      // transient state, so it must already carry one.
      const preExisting = await prisma.eventReport.create({
        data: {
          type: PrismaEventReportType.EMERGENCY,
          year,
          number: 1,
          submittedAt: new Date(`${year}-06-15T12:00:00.000Z`),
          submittedById: ctx.importActorId,
          occurredOn: new Date(`${year}-06-15T00:00:00.000Z`),
          startedAt: new Date(`${year}-06-15T12:00:00.000Z`),
          activationAt: new Date(`${year}-06-15T12:00:00.000Z`), // Between the two imported reports below.
          locationType: EventLocationType.HOME,
          localityId: locality!.id,
          operationalReport: '<p>Pre-existing, non-legacy report</p>',
          createdById: ctx.importActorId,
        },
      });

      const earlyId = 5200 + Math.floor(Math.random() * 90);
      const lateId = 5300 + Math.floor(Math.random() * 90);
      source.saidasRows = [
        // Inserted out of activation order on purpose — activation, not id order, drives numbering.
        baseSaidas({
          id: lateId,
          ano: year,
          data: `${year}-06-20`,
          h_chamada: '10:00:00',
          hcl: '10:05:00',
          hd: '11:00:00',
          ambulancia: ambulanciaCode,
          condutor: crewNumero,
          freguesia: realLocalityName,
        }),
        baseSaidas({
          id: earlyId,
          ano: year,
          data: `${year}-06-01`,
          h_chamada: '08:00:00',
          hcl: '08:05:00',
          hd: '09:00:00',
          ambulancia: ambulanciaCode,
          condutor: crewNumero,
          freguesia: realLocalityName,
        }),
      ];

      const { yearsTouched } = await loadEventReports(ctx, new LocalityResolver(prisma, new Map()), userResolver, new Map());
      expect(yearsTouched.has(year)).toBe(true);
      await loadRenumbering(ctx, yearsTouched);

      const partition = await prisma.eventReport.findMany({
        where: { type: PrismaEventReportType.EMERGENCY, year },
        orderBy: { number: 'asc' },
      });
      expect(partition.map((r) => r.number)).toEqual([1, 2, 3]);

      const byLegacyNumber = new Map(partition.map((r) => [r.legacyNumber, r]));
      expect(byLegacyNumber.get(earlyId)!.number).toBe(1); // Activated first.
      expect(byLegacyNumber.get(lateId)!.number).toBe(3); // Activated last.
      const reReadPreExisting = partition.find((r) => r.id === preExisting.id)!;
      expect(reReadPreExisting.number).toBe(2); // Activated in between the two imported reports.
      // `resequence` backfills `legacyNumber = COALESCE(legacyNumber, number)`
      // for *any* report whose number moves — "legacyNumber" means "first
      // number this report was ever given", not "came from the MySQL
      // migration". This one had never been renumbered before, so its first
      // number (1) becomes its permanent legacyNumber now that it has moved.
      expect(reReadPreExisting.legacyNumber).toBe(1);
    });
  });

  describe('proof 7 — rejects do not poison the batch', () => {
    it('one unresolvable locality among several reports lands in the reject count; the rest still import', async () => {
      const source = new FixtureLegacySource();
      const ctx = await freshContext(source, { batchSize: 2 });
      const { crewNumero, ambulanciaCode } = await setUpCrewAndVehicle(ctx, source, `p7-${RUN}`);
      const userResolver = userResolverFor(source, ctx);
      const year = 2200 + Math.floor(Math.random() * 90);

      const ids = [7001, 7002, 7003, 7004, 7005].map((n) => n + Math.floor(Math.random() * 90) * 10);
      source.saidasRows = ids.map((id, index) =>
        baseSaidas({
          id,
          ano: year,
          ambulancia: ambulanciaCode,
          condutor: crewNumero,
          // The middle report of one batch names a freguesia nothing can resolve.
          freguesia: index === 2 ? 'not-a-real-freguesia-anywhere-zzz' : realLocalityName,
        }),
      );

      await loadEventReports(ctx, new LocalityResolver(prisma, new Map()), userResolver, new Map());

      expect(ctx.counters.get('EventReport').rejected).toBe(1);
      expect(ctx.counters.get('EventReport').created).toBe(4);

      const imported = await prisma.eventReport.findMany({ where: { type: PrismaEventReportType.EMERGENCY, year } });
      expect(imported).toHaveLength(4);
      expect(imported.some((r) => r.legacyNumber === ids[2])).toBe(false);
    });
  });
});
