import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Action } from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { NoticesService, RequestUser } from './notices.service';
import { CreateNoticeDto } from './dto/create-notice.dto';

@ApiTags('Notices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('notices')
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Post()
  @Actions(Action.MANAGE_NOTICES)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateNoticeDto) {
    return this.notices.create(user, dto);
  }

  /** The caller's own active, targeted notices — ungated, like `GET /volunteer-hours/me`. */
  @Get('me')
  listMine(@CurrentUser() user: RequestUser) {
    return this.notices.listForMember(user);
  }

  /** Full history, active or not — the coordinator's notices screen. */
  @Get()
  @Actions(Action.MANAGE_NOTICES)
  listAll() {
    return this.notices.listForCoordinator();
  }

  @Get(':id/recipients')
  @Actions(Action.MANAGE_NOTICES)
  getRecipients(@Param('id') id: string) {
    return this.notices.getRecipients(id);
  }

  /** Ungated: marking your own receipt read needs no capability, just being a recipient. */
  @Post(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.notices.markRead(id, user.id);
  }

  @Post(':id/acknowledge')
  acknowledge(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.notices.acknowledge(id, user.id);
  }

  @Post(':id/deactivate')
  @Actions(Action.MANAGE_NOTICES)
  deactivate(@Param('id') id: string) {
    return this.notices.deactivate(id);
  }
}
