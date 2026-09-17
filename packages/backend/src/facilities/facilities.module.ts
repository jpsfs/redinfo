import { Module } from '@nestjs/common';
import { GeographyModule } from '../geography/geography.module';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { FacilitiesService } from './facilities.service';
import { FacilitiesController } from './facilities.controller';

@Module({
  imports: [GeographyModule],
  providers: [FacilitiesService, AuditInterceptor],
  controllers: [FacilitiesController],
  exports: [FacilitiesService],
})
export class FacilitiesModule {}
