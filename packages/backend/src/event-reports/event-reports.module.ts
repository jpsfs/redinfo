import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { GeographyModule } from '../geography/geography.module';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { StorageModule } from '../storage/storage.module';
import { EventReportsService } from './event-reports.service';
import { EventReportNumbering } from './event-report-numbering';
import { EventReportCrewService } from './event-report-crew.service';
import { EventReportAttachmentsService } from './event-report-attachments.service';
import { EventReportsController } from './event-reports.controller';

@Module({
  // `AvailabilityModule` for `ShiftScheduleService`: the crew pre-fill and the
  // shift label both need to know what hours a shift covered.
  imports: [AvailabilityModule, GeographyModule, StorageModule],
  providers: [
    EventReportsService,
    EventReportNumbering,
    EventReportCrewService,
    EventReportAttachmentsService,
    AuditInterceptor,
  ],
  controllers: [EventReportsController],
  exports: [EventReportsService],
})
export class EventReportsModule {}
