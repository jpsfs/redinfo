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
  // HolidaysService is also exported for RoutingModule's traffic-day-type
  // resolution (#232) — a departure date needs to know whether it's a
  // holiday, not just what weekday it falls on.
  exports: [ShiftScheduleService, AvailabilityWindowsService, AvailabilityService, HolidaysService],
})
export class AvailabilityModule {}
