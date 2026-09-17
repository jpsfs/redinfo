import { UserProfileService } from './user-profile.service';

// ── Locale, the one field on this endpoint that is not personnel data ─────────
//
// #180 phase 1: `updateOwn` accepts `locale` alongside the contact fields it
// already handled, but it must never appear in the profile audit trail — see
// the comment on `SELF_AUDITED_FIELDS` and the exclusion in `updateOwn`
// itself. These cases pin that down, rather than trusting the eye.

const personRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'u-1',
  email: 'ana.silva@example.test',
  firstName: 'Ana',
  lastName: 'Silva',
  roles: ['EMERGENCY_OPERATIONAL'],
  provider: 'LOCAL',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  phone: null,
  birthDate: null,
  joinedOn: null,
  addressLine: null,
  postalCode: null,
  localityId: null,
  locality: null,
  redCrossNumber: null,
  volunteerNumber: null,
  fullName: null,
  nif: null,
  citizenCardNumber: null,
  bloodType: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  photoFilename: null,
  photoMimeType: null,
  photoByteSize: null,
  photoStorageKey: null,
  locale: null,
  certifications: [],
  ...overrides,
});

function makeService(row = personRow()) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(row),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...row, ...args.data }),
      ),
    },
    userProfileAudit: { createMany: jest.fn() },
  };

  const storage = { save: jest.fn(), read: jest.fn(), remove: jest.fn() };

  return { service: new UserProfileService(prisma as never, storage as never), prisma };
}

describe('UserProfileService.updateOwn — locale', () => {
  it('persists the chosen locale', async () => {
    const { service, prisma } = makeService();

    const result = await service.updateOwn('u-1', { locale: 'en' });

    expect(result.locale).toBe('en');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ locale: 'en' }) }),
    );
  });

  it('writes no profile-audit row for a locale change — it is a UI preference, not personnel data', async () => {
    const { service, prisma } = makeService();

    await service.updateOwn('u-1', { locale: 'en' });

    expect(prisma.userProfileAudit.createMany).not.toHaveBeenCalled();
  });

  it('leaves locale untouched when the field is absent from the request', async () => {
    const { service, prisma } = makeService(personRow({ locale: 'pt' }));

    const result = await service.updateOwn('u-1', { phone: '912345678' });

    expect(result.locale).toBe('pt');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ locale: expect.anything() }) }),
    );
  });

  it('still audits the other fields changed in the same request', async () => {
    const { service, prisma } = makeService();

    await service.updateOwn('u-1', { phone: '912345678', locale: 'en' });

    expect(prisma.userProfileAudit.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ field: 'phone', newValue: '912345678' })],
      }),
    );
  });
});
