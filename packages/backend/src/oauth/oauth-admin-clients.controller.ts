import { randomBytes } from 'node:crypto';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityCipher } from '../common/identity-cipher';
import { RegisterAdminClientDto } from './dto/register-admin-client.dto';

const CLIENT_SECRET_SCOPE = 'oauth-client-secret';

/**
 * Hand-provisioning for a confidential OAuth client — the half of the
 * "open DCR + admin pre-registration" decision that open registration
 * (`RedinfoClientsStore.registerClient`) never grants: DCR always downgrades
 * to a public, PKCE-only client, no matter what a caller asks for, so this
 * is the only path that ever hands out a durable `client_secret`. Exists for
 * a platform like Copilot Studio that actually requires one rather than
 * self-registering with PKCE.
 *
 * `@Roles(SYSTEM_ADMIN)` rather than `@Actions(...)`: this is an operational
 * "who may run infrastructure for this delegation" gate, not a domain
 * capability — there is no natural `Action` for it, and every other admin
 * surface in this codebase reaches SYSTEM_ADMIN-only routes via `@Actions`
 * simply because SYSTEM_ADMIN holds every `Action`; this route has none to
 * borrow, so it uses the coarser mechanism `RolesGuard` exists for instead
 * of inventing an `Action` no other role would ever hold.
 */
@ApiTags('OAuth')
@ApiBearerAuth()
@Controller('oauth/admin/clients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
export class OAuthAdminClientsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityCipher: IdentityCipher,
  ) {}

  @Get()
  async list() {
    const rows = await this.prisma.oAuthClient.findMany({
      where: { isDynamic: false },
      select: { id: true, clientId: true, clientName: true, redirectUris: true, createdAt: true, disabledAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows;
  }

  /** The raw secret is returned exactly once, here — it is sealed, not stored, from this point on. */
  @Post()
  async create(@Body() dto: RegisterAdminClientDto) {
    const clientId = randomBytes(16).toString('hex');
    const clientSecret = randomBytes(32).toString('base64url');

    const row = await this.prisma.oAuthClient.create({
      data: { clientId, clientName: dto.clientName, redirectUris: dto.redirectUris, isDynamic: false },
    });
    const sealed = this.identityCipher.seal(CLIENT_SECRET_SCOPE, row.id, clientSecret);
    await this.prisma.oAuthClient.update({ where: { id: row.id }, data: { clientSecretSealed: sealed } });

    return { clientId, clientSecret, clientName: dto.clientName, redirectUris: dto.redirectUris };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disable(@Param('id') id: string) {
    const row = await this.prisma.oAuthClient.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('OAuth client not found');
    await this.prisma.oAuthClient.update({ where: { id }, data: { disabledAt: new Date() } });
  }
}
