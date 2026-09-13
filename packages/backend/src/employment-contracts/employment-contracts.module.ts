import { Module } from '@nestjs/common';
import { EmploymentContractsService } from './employment-contracts.service';
import { EmploymentContractsController } from './employment-contracts.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

@Module({
  providers: [EmploymentContractsService, AuditInterceptor],
  controllers: [EmploymentContractsController],
  exports: [EmploymentContractsService],
})
export class EmploymentContractsModule {}
