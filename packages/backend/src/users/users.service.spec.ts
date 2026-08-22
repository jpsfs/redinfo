import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRole } from '@redinfo/shared';
import { UsersService } from './users.service';

// ── Deleting people who are named on records that outlive them ────────────────
//
// Emergency reports hold their crew with a `Restrict` foreign key, so the
// database refuses the delete. That has to read as a conflict pointing at
// deactivation, not as a raw constraint violation surfacing as a 500.

const USER = {
  id: 'u-1',
  email: 'ana.silva@example.test',
  firstName: 'Ana',
  lastName: 'Silva',
  role: UserRole.EMERGENCY_OPERATIONAL,
  isActive: true,
  isDriver: true,
};

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

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(USER),
      delete: jest.fn().mockResolvedValue(USER),
      ...(overrides.user as Record<string, unknown>),
    },
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
