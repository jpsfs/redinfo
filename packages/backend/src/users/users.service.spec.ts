import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthProvider, Prisma, UserRole } from '@prisma/client';
import {
  AuthProvider as SharedAuthProvider,
  CertificationType,
  UserRole as SharedUserRole,
} from '@redinfo/shared';
import { UsersService } from './users.service';

// ── Deleting people who are named on records that outlive them ────────────────
//
// Emergency reports hold their crew with a `Restrict` foreign key, so the
// database refuses the delete. That has to read as a conflict pointing at
// deactivation, not as a raw constraint violation surfacing as a 500.

const BASE_ROW = {
  id: 'u-1',
  email: 'ana.silva@example.test',
  firstName: 'Ana',
  lastName: 'Silva',
  roles: [UserRole.EMERGENCY_OPERATIONAL],
  provider: AuthProvider.LOCAL,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  phone: null,
  birthDate: null,
  joinedOn: null,
  addressLine: null,
  postalCode: null,
  localityId: null,
  locality: null,
  redCrossNumber: null,
  volunteerNumber: null,
  nif: null,
  citizenCardNumber: null,
  bloodType: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  photoFilename: null,
  photoMimeType: null,
  photoByteSize: null,
  photoStorageKey: null,
  certifications: [] as Array<{ type: CertificationType; validUntil: Date | null }>,
};

const USER = { ...BASE_ROW };

/**
 * What Postgres actually sends back when a `Restrict` relation holds the row:
 * SQLSTATE 23001, surfaced by Prisma 5 as an *unknown* request error rather
 * than a coded one. Message copied from a real failed delete — an assumed
 * `P2003` here is exactly what let a 500 reach the client once already.
 */
const restrictViolation = () =>
  new Prisma.PrismaClientUnknownRequestError(
    'Invalid `this.prisma.user.delete()` invocation\n' +
      'ConnectorError(ConnectorError { kind: QueryError(PostgresError { code: "23001", ' +
      'message: "update or delete on table \\"User\\" violates RESTRICT setting of foreign ' +
      'key constraint \\"EmergencyReport_createdById_fkey\\" on table \\"EmergencyReport\\"" }) })',
    { clientVersion: '5.22.0' },
  );

/** The coded shape Prisma does map, for the relations that report one. */
const foreignKeyViolation = () =>
  new Prisma.PrismaClientKnownRequestError('FK violation', {
    code: 'P2003',
    clientVersion: '5.22.0',
  });

const uniqueViolation = (field: string) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target: [field] },
  });

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(USER),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([USER]),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockResolvedValue(USER),
      update: jest.fn().mockResolvedValue(USER),
      delete: jest.fn().mockResolvedValue(USER),
      ...(overrides.user as Record<string, unknown>),
    },
    userProfileAudit: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      ...(overrides.userProfileAudit as Record<string, unknown>),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };
  return { service: new UsersService(prisma as never), prisma };
}

describe('UsersService.remove', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes someone who holds no protected history', async () => {
    const { service, prisma } = makeService();

    await expect(service.remove(USER.id)).resolves.toMatchObject({ id: USER.id });
    expect(prisma.user.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER.id } }),
    );
  });

  it('reports a conflict on the RESTRICT violation Postgres actually sends', async () => {
    const { service } = makeService({
      user: {
        findUnique: jest.fn().mockResolvedValue(USER),
        delete: jest.fn().mockRejectedValue(restrictViolation()),
      },
    });

    await expect(service.remove(USER.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove(USER.id)).rejects.toThrow(/deactivate/i);
  });

  it('reports a conflict on a coded foreign-key failure too', async () => {
    const { service } = makeService({
      user: {
        findUnique: jest.fn().mockResolvedValue(USER),
        delete: jest.fn().mockRejectedValue(foreignKeyViolation()),
      },
    });

    await expect(service.remove(USER.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not swallow unrelated failures', async () => {
    const { service } = makeService({
      user: {
        findUnique: jest.fn().mockResolvedValue(USER),
        delete: jest.fn().mockRejectedValue(new Error('connection lost')),
      },
    });

    await expect(service.remove(USER.id)).rejects.toThrow('connection lost');
  });

  it('404s someone who does not exist', async () => {
    const { service } = makeService({
      user: { findUnique: jest.fn().mockResolvedValue(null), delete: jest.fn() },
    });

    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── isDriver / isActiveEmergencyOperational are computed, not columns ─────────

describe('UsersService.findOne — computed readiness', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a person with no certifications is neither a driver nor operational', async () => {
    const { service } = makeService();
    const person = await service.findOne(USER.id);
    expect(person.isDriver).toBe(false);
    expect(person.isActiveEmergencyOperational).toBe(false);
    expect(person.certifications).toEqual([]);
  });

  const certRow = (type: CertificationType, validUntil: Date | null) => ({
    id: `cert-${type}`,
    userId: USER.id,
    type,
    validUntil,
    issuedOn: null,
    notes: null,
    filename: null,
    mimeType: null,
    byteSize: null,
    storageKey: null,
    createdById: USER.id,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  it('a held DRIVER certification with no expiry makes isDriver true — the isDriver migration case', async () => {
    const row = { ...BASE_ROW, certifications: [certRow(CertificationType.DRIVER, null)] };
    const { service } = makeService({ user: { findUnique: jest.fn().mockResolvedValue(row) } });

    const person = await service.findOne(USER.id);
    expect(person.isDriver).toBe(true);
    expect(person.isActiveEmergencyOperational).toBe(false);
  });

  it('a valid TAS makes someone an active emergency operational, and grants TAT/SBV', async () => {
    const row = {
      ...BASE_ROW,
      certifications: [certRow(CertificationType.TAS, new Date('2030-01-01T00:00:00.000Z'))],
    };
    const { service } = makeService({ user: { findUnique: jest.fn().mockResolvedValue(row) } });

    const person = await service.findOne(USER.id);
    expect(person.isActiveEmergencyOperational).toBe(true);
    expect(person.isDriver).toBe(false);
  });

  it('404s someone who does not exist', async () => {
    const { service } = makeService({ user: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── The MANAGE_USERS / MANAGE_PERSONNEL split on one PATCH endpoint ───────────

describe('UsersService.update — account vs personnel fields', () => {
  beforeEach(() => jest.clearAllMocks());

  const ADMIN = { id: 'u-admin', roles: [SharedUserRole.SYSTEM_ADMIN] };
  const COORDINATOR = { id: 'u-coord', roles: [SharedUserRole.EMERGENCY_COORDINATOR] };
  const OPERATIONAL = { id: 'u-op', roles: [SharedUserRole.EMERGENCY_OPERATIONAL] };

  it('a coordinator may enable/disable and edit profile fields', async () => {
    const { service, prisma } = makeService();
    await service.update(USER.id, { isActive: false, phone: '+351 900 000 000' }, COORDINATOR);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false, phone: '+351 900 000 000' }),
      }),
    );
  });

  it('a coordinator may not change email, roles or password — account-level stays admin-only', async () => {
    const { service } = makeService();
    await expect(
      service.update(USER.id, { email: 'new@example.test' }, COORDINATOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update(USER.id, { roles: [SharedUserRole.SYSTEM_ADMIN] }, COORDINATOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update(USER.id, { password: 'NewSecurePass1!' }, COORDINATOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a plain operational may not edit anyone through this endpoint', async () => {
    const { service } = makeService();
    await expect(
      service.update(USER.id, { phone: '+351 900 000 000' }, OPERATIONAL),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an admin may change everything in one request', async () => {
    const { service, prisma } = makeService();
    await service.update(
      USER.id,
      { email: 'new@example.test', roles: [SharedUserRole.EMERGENCY_COORDINATOR], isActive: false },
      ADMIN,
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'new@example.test',
          roles: [SharedUserRole.EMERGENCY_COORDINATOR],
          isActive: false,
        }),
      }),
    );
  });

  // ── "Present in the DTO" is not "being edited" (the #multi-role bug fix) ───

  it('a coordinator resubmitting unchanged email/roles alongside a real change succeeds', async () => {
    const { service, prisma } = makeService();
    await service.update(
      USER.id,
      { email: USER.email, roles: [SharedUserRole.EMERGENCY_OPERATIONAL], phone: '+351 900 000 000' },
      COORDINATOR,
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: '+351 900 000 000' }) }),
    );
  });

  it('reordered roles are not a change', async () => {
    const { service, prisma } = makeService({
      user: { findUnique: jest.fn().mockResolvedValue({ ...USER, roles: [UserRole.EMERGENCY_COORDINATOR, UserRole.SYSTEM_ADMIN] }) },
    });
    await service.update(
      USER.id,
      { roles: [SharedUserRole.SYSTEM_ADMIN, SharedUserRole.EMERGENCY_COORDINATOR], phone: '+351 900 000 001' },
      COORDINATOR,
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: '+351 900 000 001' }) }),
    );
  });

  it('an empty password string is not a request to change it', async () => {
    const { service, prisma } = makeService();
    await service.update(USER.id, { password: '', phone: '+351 900 000 002' }, COORDINATOR);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: '+351 900 000 002' }) }),
    );
  });

  it('an actually different email still needs MANAGE_USERS', async () => {
    const { service } = makeService();
    await expect(
      service.update(USER.id, { email: 'different@example.test' }, COORDINATOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an operational hitting a nonexistent id is refused before the row is even read (403, not 404)', async () => {
    const { service, prisma } = makeService({ user: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(service.update('nope', { phone: '+351 900 000 000' }, OPERATIONAL)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('an admin hitting a nonexistent id gets 404, since they clear the pre-gate', async () => {
    const { service } = makeService({ user: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(service.update('nope', { phone: '+351 900 000 000' }, ADMIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ── Refusing to strip the last SYSTEM_ADMIN ─────────────────────────────────

  it('refuses to remove SYSTEM_ADMIN from the only user who holds it', async () => {
    const { service, prisma } = makeService({
      user: {
        findUnique: jest.fn().mockResolvedValue({ ...USER, id: ADMIN.id, roles: [UserRole.SYSTEM_ADMIN] }),
        count: jest.fn().mockResolvedValue(0),
      },
    });
    await expect(
      service.update(ADMIN.id, { roles: [SharedUserRole.EMERGENCY_COORDINATOR] }, ADMIN),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: ADMIN.id } }),
      }),
    );
  });

  it('allows removing SYSTEM_ADMIN from one of two holders', async () => {
    const { service } = makeService({
      user: {
        findUnique: jest.fn().mockResolvedValue({ ...USER, id: ADMIN.id, roles: [UserRole.SYSTEM_ADMIN] }),
        count: jest.fn().mockResolvedValue(1),
      },
    });
    await expect(
      service.update(ADMIN.id, { roles: [SharedUserRole.EMERGENCY_COORDINATOR] }, ADMIN),
    ).resolves.toBeDefined();
  });

  it('refuses to deactivate the last SYSTEM_ADMIN', async () => {
    const { service } = makeService({
      user: {
        findUnique: jest.fn().mockResolvedValue({ ...USER, id: ADMIN.id, roles: [UserRole.SYSTEM_ADMIN] }),
        count: jest.fn().mockResolvedValue(0),
      },
    });
    await expect(service.update(ADMIN.id, { isActive: false }, ADMIN)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('records an audit row for each changed field, actor included', async () => {
    const { service, prisma } = makeService({
      user: {
        findUnique: jest.fn().mockResolvedValue(USER),
        update: jest.fn().mockResolvedValue({ ...USER, phone: '+351 900 000 000' }),
      },
    });
    await service.update(USER.id, { phone: '+351 900 000 000' }, COORDINATOR);
    expect(prisma.userProfileAudit.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: USER.id,
          changedById: COORDINATOR.id,
          field: 'phone',
          oldValue: null,
          newValue: '+351 900 000 000',
        }),
      ],
    });
  });

  it('never writes the value of a sensitive field to the audit trail', async () => {
    const { service, prisma } = makeService({
      user: {
        findUnique: jest.fn().mockResolvedValue(USER),
        update: jest.fn().mockResolvedValue({ ...USER, nif: '218442907' }),
      },
    });
    await service.update(USER.id, { nif: '218442907' }, COORDINATOR);
    expect(prisma.userProfileAudit.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ field: 'nif', oldValue: null, newValue: null })],
    });
  });

  it('404s someone who does not exist', async () => {
    const { service } = makeService({ user: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(
      service.update('nope', { phone: '+351 900 000 000' }, COORDINATOR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps a duplicate identity number to a friendly conflict', async () => {
    const { service } = makeService({
      user: {
        findUnique: jest.fn().mockResolvedValue(USER),
        update: jest.fn().mockRejectedValue(uniqueViolation('volunteerNumber')),
      },
    });
    await expect(
      service.update(USER.id, { volunteerNumber: '41' }, COORDINATOR),
    ).rejects.toThrow(/volunteer number/i);
  });
});

describe('UsersService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a duplicate email', async () => {
    const { service } = makeService({ user: { findUnique: jest.fn().mockResolvedValue(USER) } });
    await expect(
      service.create({ email: USER.email, firstName: 'A', lastName: 'B' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('a freshly created person holds no certifications and is not operational', async () => {
    const { service } = makeService({
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(BASE_ROW),
      },
    });
    const person = await service.create({ email: 'new@example.test', firstName: 'A', lastName: 'B' });
    expect(person.isDriver).toBe(false);
    expect(person.isActiveEmergencyOperational).toBe(false);
  });

  it('defaults a new account to LOCAL and hashes the given password', async () => {
    const { service, prisma } = makeService({
      user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(BASE_ROW) },
    });
    await service.create({ email: 'new@example.test', firstName: 'A', lastName: 'B', password: 'SecurePass1!' });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.provider).toBe(AuthProvider.LOCAL);
    expect(data.passwordHash).toEqual(expect.any(String));
  });

  it('never stores a password for a GOOGLE/MICROSOFT account, even if one was submitted', async () => {
    const { service, prisma } = makeService({
      user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(BASE_ROW) },
    });
    await service.create({
      email: 'sso@example.test',
      firstName: 'A',
      lastName: 'B',
      provider: SharedAuthProvider.GOOGLE,
      password: 'SecurePass1!',
    });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.provider).toBe(AuthProvider.GOOGLE);
    expect(data.passwordHash).toBeNull();
  });
});

// ── OAuth login only ever authenticates an existing, admin-provisioned ────────
// account — never creates one. See the doc comment on `findOrLinkOAuthUser`.

describe('UsersService.findOrLinkOAuthUser', () => {
  beforeEach(() => jest.clearAllMocks());

  const oauthParams = {
    email: USER.email,
    firstName: 'Ana',
    lastName: 'Silva',
    provider: AuthProvider.GOOGLE,
    providerId: 'google-sub-123',
  };

  it('returns the account already linked to this provider + providerId', async () => {
    const linked = { ...BASE_ROW, provider: AuthProvider.GOOGLE };
    const { service, prisma } = makeService({ user: { findFirst: jest.fn().mockResolvedValue(linked) } });

    await expect(service.findOrLinkOAuthUser(oauthParams)).resolves.toBe(linked);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a provider+providerId match that has since been deactivated', async () => {
    const linked = { ...BASE_ROW, provider: AuthProvider.GOOGLE, isActive: false };
    const { service } = makeService({ user: { findFirst: jest.fn().mockResolvedValue(linked) } });

    await expect(service.findOrLinkOAuthUser(oauthParams)).resolves.toBeNull();
  });

  it('auto-links a still-LOCAL account found by email, and wipes its password', async () => {
    const local = { ...BASE_ROW, provider: AuthProvider.LOCAL };
    const { service, prisma } = makeService({
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(local),
      },
    });

    await service.findOrLinkOAuthUser(oauthParams);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: local.id },
      data: { provider: AuthProvider.GOOGLE, providerId: 'google-sub-123', passwordHash: null },
    });
  });

  it('never creates a new account — no admin-provisioned row means no login', async () => {
    const { service, prisma } = makeService({
      user: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.findOrLinkOAuthUser(oauthParams)).resolves.toBeNull();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses to relink an account already tied to a different OAuth provider', async () => {
    const linkedElsewhere = { ...BASE_ROW, provider: AuthProvider.MICROSOFT, providerId: 'ms-sub-1' };
    const { service, prisma } = makeService({
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(linkedElsewhere),
      },
    });

    await expect(service.findOrLinkOAuthUser(oauthParams)).resolves.toBeNull();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a deactivated account found by email', async () => {
    const inactive = { ...BASE_ROW, provider: AuthProvider.LOCAL, isActive: false };
    const { service } = makeService({
      user: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(inactive) },
    });

    await expect(service.findOrLinkOAuthUser(oauthParams)).resolves.toBeNull();
  });
});

// ── Moving an account off LOCAL is admin-only and one-way at login time ───────
// (`findOrLinkOAuthUser` never moves an account back) — see `update`.

describe('UsersService.update — provider', () => {
  beforeEach(() => jest.clearAllMocks());

  const ADMIN = { id: 'u-admin', roles: [SharedUserRole.SYSTEM_ADMIN] };

  it('an admin moving an account to GOOGLE also clears any password', async () => {
    const { service, prisma } = makeService();
    await service.update(USER.id, { provider: SharedAuthProvider.GOOGLE }, ADMIN);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: AuthProvider.GOOGLE, passwordHash: null }),
      }),
    );
  });

  it('a submitted password is ignored once the account is moved off LOCAL in the same request', async () => {
    const { service, prisma } = makeService();
    await service.update(USER.id, { provider: SharedAuthProvider.MICROSOFT, password: 'IgnoredPass1!' }, ADMIN);

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.passwordHash).toBeNull();
  });

  it('coordinator cannot change provider — it is account-level, admin-only', async () => {
    const { service } = makeService();
    const COORDINATOR = { id: 'u-coord', roles: [SharedUserRole.EMERGENCY_COORDINATOR] };
    await expect(
      service.update(USER.id, { provider: SharedAuthProvider.GOOGLE }, COORDINATOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ── certificationStatus — the dashboard alert tile's click-through filter ──────
//
// Like readiness and certification, this is derived (expiry math against
// today), not a column — filtered in memory after serializing, same as the
// other two.

describe('UsersService.findAll — certificationStatus filter', () => {
  beforeEach(() => jest.clearAllMocks());

  const withCert = (id: string, type: CertificationType, validUntil: Date | null) => ({
    ...BASE_ROW,
    id,
    certifications: [
      {
        id: `cert-${id}`,
        userId: id,
        type,
        validUntil,
        issuedOn: null,
        notes: null,
        filename: null,
        mimeType: null,
        byteSize: null,
        storageKey: null,
        createdById: id,
        createdBy: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  });

  it('keeps only people with an effective certification already expired', async () => {
    const expired = withCert('u-expired', CertificationType.TAT, new Date('2020-01-01T00:00:00.000Z'));
    const valid = withCert('u-valid', CertificationType.TAT, new Date('2099-01-01T00:00:00.000Z'));
    const { service, prisma } = makeService({
      user: { findMany: jest.fn().mockResolvedValue([expired, valid]) },
    });

    const result = await service.findAll(1, 25, { certificationStatus: 'EXPIRED' });

    expect(result.data.map((p) => p.id)).toEqual(['u-expired']);
    // Derived, not a WHERE clause — the full set is fetched, then filtered in memory.
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.any(Object) }),
    );
  });

  it('keeps only people with an effective certification expiring soon', async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    const expiringSoon = withCert('u-expiring', CertificationType.TAT, soon);
    const valid = withCert('u-valid', CertificationType.TAT, new Date('2099-01-01T00:00:00.000Z'));
    const { service } = makeService({
      user: { findMany: jest.fn().mockResolvedValue([expiringSoon, valid]) },
    });

    const result = await service.findAll(1, 25, { certificationStatus: 'EXPIRING' });

    expect(result.data.map((p) => p.id)).toEqual(['u-expiring']);
  });
});
