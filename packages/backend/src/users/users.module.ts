import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserCertificationsService } from './user-certifications.service';
import { UserProfileService } from './user-profile.service';
import { UsersController } from './users.controller';
import { UserCertificationsController } from './user-certifications.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [UsersService, UserCertificationsService, UserProfileService, AuditInterceptor],
  controllers: [UsersController, UserCertificationsController],
  exports: [UsersService, UserCertificationsService, UserProfileService],
})
export class UsersModule {}
