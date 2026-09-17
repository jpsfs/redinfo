import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OAuthGrantsController } from './oauth-grants.controller';

function makeController() {
  const prisma = { oAuthGrant: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
  const controller = new OAuthGrantsController(prisma as never);
  return { controller, prisma };
}

describe('OAuthGrantsController', () => {
  it('list() only ever queries the caller\'s own, still-active grants', async () => {
    const { controller, prisma } = makeController();
    prisma.oAuthGrant.findMany.mockResolvedValue([]);

    await controller.list({ id: 'user-1' });

    expect(prisma.oAuthGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
    );
  });

  it('revoke() 404s on a grant that does not exist', async () => {
    const { controller, prisma } = makeController();
    prisma.oAuthGrant.findUnique.mockResolvedValue(null);

    await expect(controller.revoke('g-1', { id: 'user-1' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("revoke() refuses to touch someone else's grant", async () => {
    const { controller, prisma } = makeController();
    prisma.oAuthGrant.findUnique.mockResolvedValue({ id: 'g-1', userId: 'someone-else' });

    await expect(controller.revoke('g-1', { id: 'user-1' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.oAuthGrant.update).not.toHaveBeenCalled();
  });

  it("revoke() marks the caller's own grant revoked", async () => {
    const { controller, prisma } = makeController();
    prisma.oAuthGrant.findUnique.mockResolvedValue({ id: 'g-1', userId: 'user-1' });

    await controller.revoke('g-1', { id: 'user-1' });

    expect(prisma.oAuthGrant.update).toHaveBeenCalledWith({
      where: { id: 'g-1' },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
