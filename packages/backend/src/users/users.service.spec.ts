import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthProvider, Prisma, UserRole } from '@prisma/client';
import { CertificationType, UserRole as SharedUserRole } from '@redinfo/shared';
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
  role: UserRole.EMERGENCY_OPERATIONAL,
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

  const ADMIN = { id: 'u-admin', role: SharedUserRole.SYSTEM_ADMIN };
  const COORDINATOR = { id: 'u-coord', role: SharedUserRole.EMERGENCY_COORDINATOR };
  const OPERATIONAL = { id: 'u-op', role: SharedUserRole.EMERGENCY_OPERATIONAL };

  it('a coordinator may enable/disable and edit profile fields', async () => {
    const { service, prisma } = makeService();
    await service.update(USER.id, { isActive: false, phone: '+351 900 000 000' }, COORDINATOR);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false, phone: '+351 900 000 000' }),
      }),
    );
  });

  it('a coordinator may not change email, role or password — account-level stays admin-only', async () => {
    const { service } = makeService();
    await expect(
      service.update(USER.id, { email: 'new@example.test' }, COORDINATOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update(USER.id, { role: SharedUserRole.SYSTEM_ADMIN }, COORDINATOR),
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
      { email: 'new@example.test', role: SharedUserRole.EMERGENCY_COORDINATOR, isActive: false },
      ADMIN,
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'new@example.test',
          role: SharedUserRole.EMERGENCY_COORDINATOR,
          isActive: false,
        }),
      }),
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
