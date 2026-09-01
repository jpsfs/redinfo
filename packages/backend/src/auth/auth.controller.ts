import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBody, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-oauth.guard';
import { MicrosoftAuthGuard } from './guards/microsoft-oauth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { User } from '@prisma/client';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── Local login ─────────────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @ApiBody({ type: LoginDto })
  async login(@Req() req: any, @Body() dto: LoginDto) {
    return this.authService.login((req.user as User).id, dto.remember ?? false);
  }

  // ── Public config ────────────────────────────────────────────────────────────

  /**
   * Whether the login screen should show the password form at all —
   * unauthenticated by necessity (it's what the login screen itself uses),
   * but a single global boolean, not tied to any particular account, so it
   * carries none of the per-email enumeration risk a lookup would.
   */
  @Get('config')
  @ApiExcludeEndpoint()
  getConfig() {
    return { localLoginEnabled: this.authService.isLocalLoginEnabled() };
  }

  // ── Refresh ─────────────────────────────────────────────────────────────────

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
  }

  // ── Me ───────────────────────────────────────────────────────────────────────

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    return this.authService.sanitize(user);
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────────

  @Get('google')
  @ApiExcludeEndpoint()
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // Redirect is handled by passport
  }

  @Get('google/callback')
  @ApiExcludeEndpoint()
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: any, @Res() res: any) {
    // No matching admin-provisioned account — see `GoogleAuthGuard.handleRequest`.
    if (!req.user) {
      return res.redirect(this.frontendRoute('/login?error=oauth_account_not_found'));
    }
    const remember = req.query.state === 'true';
    const tokens = await this.authService.login((req.user as User).id, remember);
    res.redirect(this.callbackRoute(tokens, remember));
  }

  // ── Microsoft OAuth ───────────────────────────────────────────────────────────

  @Get('microsoft')
  @ApiExcludeEndpoint()
  @UseGuards(MicrosoftAuthGuard)
  microsoftLogin() {
    // Redirect is handled by passport
  }

  @Get('microsoft/callback')
  @ApiExcludeEndpoint()
  @UseGuards(MicrosoftAuthGuard)
  async microsoftCallback(@Req() req: any, @Res() res: any) {
    if (!req.user) {
      return res.redirect(this.frontendRoute('/login?error=oauth_account_not_found'));
    }
    const remember = req.query.state === 'true';
    const tokens = await this.authService.login((req.user as User).id, remember);
    res.redirect(this.callbackRoute(tokens, remember));
  }

  // ── Redirecting back into the SPA ─────────────────────────────────────────────

  /**
   * Builds an absolute URL for an in-app route.
   *
   * The frontend is react-admin 5, whose `<Admin>` mounts a **HashRouter** —
   * every in-app route lives after the `#`, so a bare `${frontendUrl}/login`
   * is not the login screen, it is a path the router never sees. The browser
   * fetches it, nginx serves `index.html`, the router boots on an empty hash,
   * lands on `/` and (unauthenticated) bounces to `#/login`, leaving the
   * tokens unread in a query string nothing is listening to. Hence the `/#`.
   *
   * `route` carries its own query string *inside* the fragment, so the SPA
   * reads it off the router's location, not `window.location.search`.
   */
  private frontendRoute(route: string): string {
    const frontendUrl = (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
    return `${frontendUrl}/#${route}`;
  }

  private callbackRoute(
    tokens: { accessToken: string; refreshToken: string },
    remember: boolean,
  ): string {
    const params = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      remember: String(remember),
    });
    return this.frontendRoute(`/auth/callback?${params.toString()}`);
  }
}
