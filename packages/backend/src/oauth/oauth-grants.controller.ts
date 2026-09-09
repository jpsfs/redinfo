import { Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Backs the "AI connections" settings page
 * (`pages/AiConnectionsPage.tsx`) — every user's own view of which AI
 * clients currently hold a grant, and their way to revoke one. Self-scoped
 * only: there is no admin listing of everyone's grants here, the same way
 * there is no admin listing of everyone's portal refresh tokens.
 */
@ApiTags('OAuth')
@ApiBearerAuth()
@Controller('oauth/grants')
@UseGuards(JwtAuthGuard)
export class OAuthGrantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: { id: string }) {
    const grants = await this.prisma.oAuthGrant.findMany({
      where: { userId: user.id, revokedAt: null },
      include: { client: { select: { clientName: true, clientId: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return grants.map((grant) => ({
      id: grant.id,
      clientName: grant.client.clientName,
      scopes: grant.scopes,
      createdAt: grant.createdAt,
      lastUsedAt: grant.lastUsedAt,
      expiresAt: grant.expiresAt,
    }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    const grant = await this.prisma.oAuthGrant.findUnique({ where: { id } });
    if (!grant) throw new NotFoundException('Connection not found');
    if (grant.userId !== user.id) throw new ForbiddenException();

    await this.prisma.oAuthGrant.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }
}
