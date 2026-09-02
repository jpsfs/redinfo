import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { INEMLoginJob } from '@redinfo/shared';
import { InemLoginResultDto } from './dto/inem-login-result.dto';
import { SetOwaSessionDto } from './dto/set-owa-session.dto';
import { InemSessionService } from './inem-session.service';
import { InemWorkerGuard } from './inem-worker.guard';

/**
 * The worker-facing half of #214's session handoff. `packages/inem-worker`
 * (#215) *polls* this — it is never called, has no `Service`/ingress of its
 * own, and only holds an outbound `INEM_WORKER_TOKEN`. Kept off the Swagger
 * surface: this isn't part of the API redinfo exposes to anyone with a user
 * account.
 */
@ApiExcludeController()
@UseGuards(InemWorkerGuard)
@Controller('internal/inem/login-jobs')
export class InemWorkerController {
  constructor(private readonly session: InemSessionService) {}

  @Get()
  async claim(): Promise<{ job: INEMLoginJob | null }> {
    return { job: await this.session.claimLoginJob() };
  }

  @Post(':id/result')
  @HttpCode(204)
  async submitResult(@Param('id') id: string, @Body() dto: InemLoginResultDto): Promise<void> {
    await this.session.submitLoginResult(id, dto.toResult());
  }
}

/**
 * The bootstrap script's (#215) one write: a human completes MFA in a headed
 * browser once, and this stores the resulting `storageState`. Split from
 * `InemWorkerController` so the routine poll-loop guard and the one-off
 * bootstrap write aren't on the same controller class by coincidence — both
 * still share `InemWorkerGuard` and the same shared secret.
 */
@ApiExcludeController()
@UseGuards(InemWorkerGuard)
@Controller('internal/inem/owa-session')
export class InemOwaBootstrapController {
  constructor(private readonly session: InemSessionService) {}

  @Post()
  @HttpCode(204)
  async setOwaSession(@Body() dto: SetOwaSessionDto): Promise<void> {
    await this.session.bootstrapOwaSession(dto.storageState);
  }
}
