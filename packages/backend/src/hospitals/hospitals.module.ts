import { Module } from '@nestjs/common';
import { GeographyModule } from '../geography/geography.module';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { HospitalsService } from './hospitals.service';
import { HospitalsController } from './hospitals.controller';

@Module({
  imports: [GeographyModule],
  providers: [HospitalsService, AuditInterceptor],
  controllers: [HospitalsController],
  exports: [HospitalsService],
})
export class HospitalsModule {}
