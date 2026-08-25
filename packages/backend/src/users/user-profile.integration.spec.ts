import { PrismaClient } from '@prisma/client';
import { UserRole } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfileService } from './user-profile.service';
import { AttachmentStorage } from '../storage/attachment-storage';

/**
 * Integration coverage for #180 phase 1's one schema change — `User.locale` —
 * against a real Postgres. The unit spec (`user-profile.service.spec.ts`)
 * covers the same behaviour against a mocked Prisma; this is what actually
 * proves the column round-trips and the audit table stays untouched.
 *
 * Skipped unless DATABASE_URL is set, and named so
 * `pnpm --filter backend test:integration` selects it.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const email = (local: string) => `${local}.${RUN}@profile.test`;

const noopStorage: AttachmentStorage = {
  save: () => Promise.reject(new Error('not used by this suite')),
  read: () => Promise.reject(new Error('not used by this suite')),
  remove: () => Promise.resolve(),
};

describeIntegration('UserProfileService.updateOwn (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const service = new UserProfileService(prisma, noopStorage);
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: email('sofia'),
        firstName: 'Sofia',
        lastName: 'Test',
        role: UserRole.EMERGENCY_OPERATIONAL,
        isActive: true,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.userProfileAudit.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it('integration: persists a chosen locale and returns it from getOwn', async () => {
    await service.updateOwn(userId, { locale: 'en' });

    const row = await prisma.user.findUnique({ where: { id: userId } });
    expect(row?.locale).toBe('en');

    const profile = await service.getOwn(userId);
    expect(profile.locale).toBe('en');
  });

  it('integration: writes no profile-audit row for a locale change', async () => {
    await service.updateOwn(userId, { locale: 'pt' });

    const rows = await prisma.userProfileAudit.findMany({ where: { userId } });
    expect(rows.filter((row) => row.field === 'locale')).toHaveLength(0);
  });

  it('integration: still audits a real personnel field changed in the same request', async () => {
    await service.updateOwn(userId, { phone: '912345678', locale: 'en' });

    const rows = await prisma.userProfileAudit.findMany({ where: { userId, field: 'phone' } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[rows.length - 1].newValue).toBe('912345678');
  });
});
