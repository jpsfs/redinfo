import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { ApiTags } from '@nestjs/swagger';
import { AppVersionInfo } from '@redinfo/shared';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaHealth.isHealthy('database'),
    ]);
  }

  /**
   * Backs the frontend's About dialog. `GIT_COMMIT_SHA`/`GIT_COMMIT_DATE` are
   * baked in at image build time (see packages/backend/Dockerfile and
   * .ado/deployment.yml) — unset outside a CI-built image (local dev), where
   * the fallbacks below make that visible rather than showing a stale value.
   */
  @Get('version')
  version(): AppVersionInfo {
    return {
      commit: process.env.GIT_COMMIT_SHA || 'dev',
      commitDate: process.env.GIT_COMMIT_DATE || null,
    };
  }
}
