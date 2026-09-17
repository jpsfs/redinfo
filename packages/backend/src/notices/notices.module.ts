import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';

@Module({
  imports: [NotificationsModule],
  providers: [NoticesService, AuditInterceptor],
  controllers: [NoticesController],
})
export class NoticesModule {}
