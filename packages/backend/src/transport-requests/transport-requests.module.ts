import { Module } from '@nestjs/common';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { FacilitiesModule } from '../facilities/facilities.module';
import { TransportRequestsService } from './transport-requests.service';
import { TransportRequestsController } from './transport-requests.controller';

@Module({
  imports: [FacilitiesModule],
  providers: [TransportRequestsService, AuditInterceptor],
  controllers: [TransportRequestsController],
  exports: [TransportRequestsService],
})
export class TransportRequestsModule {}
