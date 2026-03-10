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
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBody, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
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
  async login(@Req() req: any) {
    return this.authService.login(req.user as User);
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
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Redirect is handled by passport
  }

  @Get('google/callback')
  @ApiExcludeEndpoint()
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: any) {
    const tokens = await this.authService.login(req.user as User);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    res.redirect(
      `${frontendUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`,
    );
  }

  // ── Microsoft OAuth ───────────────────────────────────────────────────────────

  @Get('microsoft')
  @ApiExcludeEndpoint()
  @UseGuards(AuthGuard('microsoft'))
  microsoftLogin() {
    // Redirect is handled by passport
  }

  @Get('microsoft/callback')
  @ApiExcludeEndpoint()
  @UseGuards(AuthGuard('microsoft'))
  async microsoftCallback(@Req() req: any, @Res() res: any) {
    const tokens = await this.authService.login(req.user as User);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    res.redirect(
      `${frontendUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`,
    );
  }
}
