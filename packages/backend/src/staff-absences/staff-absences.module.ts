import { Module } from '@nestjs/common';
import { StaffAbsencesService } from './staff-absences.service';
import { StaffAbsencesController } from './staff-absences.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

@Module({
  providers: [StaffAbsencesService, AuditInterceptor],
  controllers: [StaffAbsencesController],
  exports: [StaffAbsencesService],
})
export class StaffAbsencesModule {}
