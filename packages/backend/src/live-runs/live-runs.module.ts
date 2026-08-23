import { Module } from '@nestjs/common';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { EventReportsModule } from '../event-reports/event-reports.module';
import { LiveRunsService } from './live-runs.service';
import { LiveRunsController } from './live-runs.controller';
import { IdentityCipher } from './identity-cipher';
import { IdentityPurgeService } from './identity-purge.service';
import { DelegationSettingsService } from './delegation-settings.service';
import { RouteDistanceService } from './route-distance.service';

/**
 * Live emergency runs.
 *
 * Depends on `EventReportsModule` and not the other way round: closing a run
 * *creates* a report, so the arrow points from the transient thing to the
 * permanent one. The one place the reports module touches a run — destroying its
 * identity the instant the report is filed — is a single `updateMany` written
 * inline there rather than an injected service, precisely so this stays a
 * one-way dependency.
 *
 * `IdentityCipher` and `RouteDistanceService` are factories because both take a
 * plain string from the environment with a default, and `useClass` would have
 * Nest try to inject that string and fail to start.
 */
@Module({
  imports: [EventReportsModule],
  providers: [
    LiveRunsService,
    IdentityPurgeService,
    DelegationSettingsService,
    AuditInterceptor,
    { provide: IdentityCipher, useFactory: () => new IdentityCipher() },
    { provide: RouteDistanceService, useFactory: () => new RouteDistanceService() },
  ],
  controllers: [LiveRunsController],
  exports: [LiveRunsService, DelegationSettingsService],
})
export class LiveRunsModule {}
