import { Module } from '@nestjs/common';
import { PaidStaffScheduleService } from './paid-staff-schedule.service';
import { PaidStaffScheduleController } from './paid-staff-schedule.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

@Module({
  providers: [PaidStaffScheduleService, AuditInterceptor],
  controllers: [PaidStaffScheduleController],
  exports: [PaidStaffScheduleService],
})
export class PaidStaffScheduleModule {}
