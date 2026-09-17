import { Module } from '@nestjs/common';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { IdentityCipher } from '../common/identity-cipher';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { PatientIdentityPurgeService } from './patient-identity-purge.service';

/**
 * Non-urgent transport patients (#219, #226).
 *
 * `IdentityCipher` is a factory, not a plain provider: its constructor takes a
 * bare string from the environment with a default, and `useClass` would have
 * Nest try to inject that string and fail to start — same reasoning as
 * `LiveRunsModule`'s identical comment.
 */
@Module({
  providers: [
    PatientsService,
    PatientIdentityPurgeService,
    AuditInterceptor,
    { provide: IdentityCipher, useFactory: () => new IdentityCipher() },
  ],
  controllers: [PatientsController],
  exports: [PatientsService],
})
export class PatientsModule {}
