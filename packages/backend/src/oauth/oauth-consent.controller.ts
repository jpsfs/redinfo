import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OAuthProviderService, type ConsentTicketPayload } from './oauth-provider.service';
import { MCP_CONSENT_TICKET_AUDIENCE } from './mcp-token.constants';
import { ConsentDecisionDto } from './dto/consent-decision.dto';

/**
 * The human half of `OAuthProviderService.authorize()` — see that method's
 * doc comment for the full round trip. `GET /oauth/consent/:ticket` is what
 * the SPA's `/oauth/consent` route (`pages/oauth/ConsentPage.tsx`) loads to
 * render "App X wants to access redinfo as you"; `POST .../decision` is what
 * Approve/Deny calls, authenticated as the actual signed-in user via the
 * normal `JwtAuthGuard` — this is the one place identity binds to the grant.
 */
@ApiTags('OAuth')
@Controller('oauth/consent')
export class OAuthConsentController {
  constructor(
    private readonly oauthProvider: OAuthProviderService,
    private readonly jwtService: JwtService,
  ) {}

  @Get(':ticket')
  @ApiExcludeEndpoint()
  async describe(@Param('ticket') ticket: string) {
    const payload = this.verifyTicket(ticket);
    return {
      clientName: payload.clientName,
      scopes: payload.scopes,
    };
  }

  @Post('decision')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiExcludeEndpoint()
  @UseGuards(JwtAuthGuard)
  async decide(@Body() dto: ConsentDecisionDto, @CurrentUser() user: { id: string }) {
    const payload = this.verifyTicket(dto.ticket);
    const redirectUrl = new URL(payload.redirectUri);

    if (dto.decision === 'deny') {
      redirectUrl.searchParams.set('error', 'access_denied');
      if (payload.state) redirectUrl.searchParams.set('state', payload.state);
      return { redirectUrl: redirectUrl.href };
    }

    const code = await this.oauthProvider.issueAuthorizationCode(user.id, payload);
    redirectUrl.searchParams.set('code', code);
    if (payload.state) redirectUrl.searchParams.set('state', payload.state);
    return { redirectUrl: redirectUrl.href };
  }

  private verifyTicket(ticket: string): ConsentTicketPayload {
    try {
      return this.jwtService.verify<ConsentTicketPayload>(ticket, {
        audience: MCP_CONSENT_TICKET_AUDIENCE,
      });
    } catch {
      throw new BadRequestException(
        'This connection request has expired or is invalid — go back to the AI assistant and try connecting again.',
      );
    }
  }
}
