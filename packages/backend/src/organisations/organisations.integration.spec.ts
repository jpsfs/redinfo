import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrganisationsService } from './organisations.service';
import { AgreementsService } from './agreements.service';

/**
 * Integration coverage for #227 against a real Postgres — the unit specs
 * (`organisations.service.spec.ts`, `agreements.service.spec.ts`) cover the
 * same behaviour against a mocked Prisma; this proves the schema-level
 * constraints actually hold: one reference code per organisation, cascading
 * deletes for reference codes, and the FK restrict that makes an
 * agreement-referenced organisation retire instead of disappear.
 *
 * Skipped unless DATABASE_URL is set, and named so
 * `pnpm --filter backend test:integration` selects it.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describeIntegration('OrganisationsService / AgreementsService (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const organisations = new OrganisationsService(prisma);
  const agreements = new AgreementsService(prisma);
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    await prisma.agreement.deleteMany({ where: { payerOrganisationId: { in: createdOrgIds } } });
    await prisma.organisationReference.deleteMany({ where: { organisationId: { in: createdOrgIds } } });
    await prisma.organisation.deleteMany({ where: { id: { in: createdOrgIds } } });
  });

  it('integration: the schema itself rejects the same reference code twice on one organisation', async () => {
    // The service already guards against a duplicate *within one payload*
    // (covered by the unit spec) — this proves the `@@unique` constraint
    // backs it at the database too, for any caller that bypasses the service.
    const org = await organisations.create({ name: `AXA Assistance ${RUN}`, isRequester: true });
    createdOrgIds.push(org.id);

    await prisma.organisationReference.create({ data: { organisationId: org.id, code: `AZP-${RUN}` } });
    await expect(
      prisma.organisationReference.create({ data: { organisationId: org.id, code: `AZP-${RUN}` } }),
    ).rejects.toThrow();
  });

  it('integration: the same code is free to reuse on a different organisation', async () => {
    const first = await organisations.create({
      name: `AXA Assistance ${RUN}`,
      isRequester: true,
      references: [{ code: `SHARED-${RUN}` }],
    });
    createdOrgIds.push(first.id);

    const second = await organisations.create({
      name: `Allianz ${RUN}`,
      isPayer: true,
      references: [{ code: `SHARED-${RUN}` }],
    });
    createdOrgIds.push(second.id);

    expect(second.references?.map((r) => r.code)).toContain(`SHARED-${RUN}`);
  });

  it('integration: reference codes cascade-delete with their organisation', async () => {
    const org = await organisations.create({
      name: `Cruz Vermelha ${RUN}`,
      isRequester: true,
      references: [{ code: `CV-${RUN}` }],
    });

    await prisma.organisation.delete({ where: { id: org.id } });

    const remaining = await prisma.organisationReference.findMany({ where: { organisationId: org.id } });
    expect(remaining).toEqual([]);
  });

  it('integration: retires rather than deletes an organisation an agreement still names as payer', async () => {
    const payer = await organisations.create({ name: `Allianz Seguros ${RUN}`, isPayer: true });
    createdOrgIds.push(payer.id);

    const agreement = await agreements.create({
      payerOrganisationId: payer.id,
      name: `Apólice ${RUN}`,
      validFrom: '2026-01-01',
    });

    const result = await organisations.remove(payer.id);
    expect(result.isActive).toBe(false);

    // The agreement still resolves the same payer — nothing was orphaned.
    const stillThere = await agreements.findOne(agreement.id);
    expect(stillThere.payerOrganisationId).toBe(payer.id);

    await prisma.agreement.delete({ where: { id: agreement.id } });
  });

  it('integration: refuses an agreement for an organisation not flagged as a payer', async () => {
    const requesterOnly = await organisations.create({ name: `Bombeiros ${RUN}`, isRequester: true });
    createdOrgIds.push(requesterOnly.id);

    await expect(
      agreements.create({
        payerOrganisationId: requesterOnly.id,
        name: `Acordo ${RUN}`,
        validFrom: '2026-01-01',
      }),
    ).rejects.toThrow();
  });
});
