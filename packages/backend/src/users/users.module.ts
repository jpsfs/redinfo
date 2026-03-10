import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';

@Module({
  providers: [UsersService, AuditInterceptor],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
