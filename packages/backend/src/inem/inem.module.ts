import { Module } from '@nestjs/common';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { IdentityCipher } from '../common/identity-cipher';
import { InemApiClient } from './inem-api.client';
import { InemController } from './inem.controller';
import { InemQueueService } from './inem-queue.service';
import { InemReconcilerService } from './inem-reconciler.service';
import { InemService } from './inem.service';
import { InemSessionService } from './inem-session.service';
import { InemWorkerController } from './inem-worker.controller';
import { InemWorkerGuard } from './inem-worker.guard';

/**
 * The INEM unit-status integration (#211/#214). `PrismaModule` is `@Global`
 * so it isn't imported here.
 *
 * `IdentityCipher` and `InemApiClient` are factories for the same reason
 * `LiveRunsModule` uses one for `IdentityCipher`/`RouteDistanceService`: each
 * takes a plain string from the environment with a default, and `useClass`
 * would have Nest try to inject that string by type and fail to start.
 */
@Module({
  providers: [
    { provide: InemApiClient, useFactory: () => new InemApiClient() },
    { provide: IdentityCipher, useFactory: () => new IdentityCipher() },
    InemSessionService,
    InemQueueService,
    InemReconcilerService,
    InemService,
    InemWorkerGuard,
    AuditInterceptor,
  ],
  controllers: [InemController, InemWorkerController],
  exports: [InemService],
})
export class InemModule {}
