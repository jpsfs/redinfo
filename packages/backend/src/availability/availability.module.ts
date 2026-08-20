import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { AvailabilityWindowsService } from './availability-windows.service';
import { HolidaysService } from './holidays.service';
import { ShiftScheduleService } from './shift-schedule.service';
import {
  AvailabilityController,
  AvailabilityWindowsController,
  HolidaysController,
} from './availability.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

@Module({
  providers: [
    AvailabilityService,
    AvailabilityWindowsService,
    HolidaysService,
    ShiftScheduleService,
    AuditInterceptor,
  ],
  controllers: [HolidaysController, AvailabilityWindowsController, AvailabilityController],
  exports: [ShiftScheduleService, AvailabilityWindowsService],
})
export class AvailabilityModule {}
