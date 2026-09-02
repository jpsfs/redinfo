import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { INEMLoginJob } from '@redinfo/shared';
import { InemLoginResultDto } from './dto/inem-login-result.dto';
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
