import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { GeographyModule } from '../geography/geography.module';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { EventReportsService } from './event-reports.service';
import { EventReportNumbering } from './event-report-numbering';
import { EventReportCrewService } from './event-report-crew.service';
import { EventReportAttachmentsService } from './event-report-attachments.service';
import { EventReportsController } from './event-reports.controller';
import { ATTACHMENT_STORAGE, DiskAttachmentStorage } from './attachment-storage';

@Module({
  // `AvailabilityModule` for `ShiftScheduleService`: the crew pre-fill and the
  // shift label both need to know what hours a shift covered.
  imports: [AvailabilityModule, GeographyModule],
  providers: [
    EventReportsService,
    EventReportNumbering,
    EventReportCrewService,
    EventReportAttachmentsService,
    AuditInterceptor,
    // Behind a token so a test can hand the service an in-memory store instead
    // of writing photographs into the repository.
    //
    // A factory rather than `useClass`: the constructor takes the uploads root
    // as a plain string with a default, and `useClass` would have Nest try to
    // inject that string and fail to start.
    {
      provide: ATTACHMENT_STORAGE,
      useFactory: () => new DiskAttachmentStorage(process.env.ATTACHMENTS_DIR),
    },
  ],
  controllers: [EventReportsController],
  exports: [EventReportsService],
})
export class EventReportsModule {}
