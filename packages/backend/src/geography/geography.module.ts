import { Module } from '@nestjs/common';
import { GeographyService } from './geography.service';
import { LocalitiesController, MunicipalitiesController } from './geography.controller';
import { DelegationSettingsService } from '../live-runs/delegation-settings.service';

/**
 * `DelegationSettingsService` is provided here too, rather than imported from
 * `LiveRunsModule` — that module depends (transitively, via
 * `EventReportsModule`) on this one, so importing it here would be a cycle.
 * The service itself has no dependency but `PrismaService`, so a second
 * instance costs nothing.
 */
@Module({
  providers: [GeographyService, DelegationSettingsService],
  controllers: [LocalitiesController, MunicipalitiesController],
  exports: [GeographyService],
})
export class GeographyModule {}
