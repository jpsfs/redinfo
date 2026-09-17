import { Module } from '@nestjs/common';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { LiveRunsModule } from '../live-runs/live-runs.module';
import { OccurrenceTypePoliciesService } from './occurrence-type-policies.service';
import { TransportConfigController } from './transport-config.controller';

/**
 * Planning policy config for non-urgent transport (#233). Imports
 * `LiveRunsModule` for `DelegationSettingsService` — the arrival window
 * thresholds live on its `DelegationSettings` singleton row, not a table of
 * their own. Exports `OccurrenceTypePoliciesService` for
 * `TransportRequestsModule`, which needs the duration floors to resolve a
 * leg's effective estimated end.
 */
@Module({
  imports: [LiveRunsModule],
  providers: [OccurrenceTypePoliciesService, AuditInterceptor],
  controllers: [TransportConfigController],
  exports: [OccurrenceTypePoliciesService],
})
export class TransportConfigModule {}
