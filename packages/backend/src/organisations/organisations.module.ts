import { Module } from '@nestjs/common';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { OrganisationsService } from './organisations.service';
import { OrganisationsController } from './organisations.controller';
import { AgreementsService } from './agreements.service';
import { AgreementsController } from './agreements.controller';

@Module({
  providers: [OrganisationsService, AgreementsService, AuditInterceptor],
  controllers: [OrganisationsController, AgreementsController],
  exports: [OrganisationsService, AgreementsService],
})
export class OrganisationsModule {}
