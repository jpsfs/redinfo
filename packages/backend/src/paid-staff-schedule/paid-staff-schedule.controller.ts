import { Body, Controller, Delete, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Action } from '@redinfo/shared';
import { PaidStaffScheduleService } from './paid-staff-schedule.service';
import { CreatePaidStaffScheduleBlockDto } from './dto/create-schedule-block.dto';
import { CreatePaidStaffScheduleOverrideDto } from './dto/create-schedule-override.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { RequestUser } from '../users/users.controller';

/**
 * A paid staffer's on-the-clock hours (#245). Writes are `MANAGE_PERSONNEL`
 * only — this is a coordinator's record of a contract, not something a
 * person edits about themselves. Reading one's own schedule needs no
 * `Action`, the same way `GET /schedules/me` doesn't: it's you.
 */
@ApiTags('Paid staff schedule')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('paid-staff-schedule')
export class PaidStaffScheduleController {
  constructor(private readonly schedule: PaidStaffScheduleService) {}

  @Get('me')
  getMine(@CurrentUser() user: RequestUser) {
    return this.schedule.getSchedule(user.id);
  }

  @Get(':userId')
  @Actions(Action.MANAGE_PERSONNEL)
  getSchedule(@Param('userId') userId: string) {
    return this.schedule.getSchedule(userId);
  }

  @Post(':userId/blocks')
  @Actions(Action.MANAGE_PERSONNEL)
  addBlock(
    @Param('userId') userId: string,
    @Body() dto: CreatePaidStaffScheduleBlockDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.schedule.addBlock(userId, dto, user.id);
  }

  @Delete(':userId/blocks/:blockId')
  @Actions(Action.MANAGE_PERSONNEL)
  removeBlock(@Param('userId') userId: string, @Param('blockId') blockId: string) {
    return this.schedule.removeBlock(userId, blockId);
  }

  @Post(':userId/overrides')
  @Actions(Action.MANAGE_PERSONNEL)
  setOverride(
    @Param('userId') userId: string,
    @Body() dto: CreatePaidStaffScheduleOverrideDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.schedule.setOverride(userId, dto, user.id);
  }

  @Delete(':userId/overrides/:overrideId')
  @Actions(Action.MANAGE_PERSONNEL)
  removeOverride(@Param('userId') userId: string, @Param('overrideId') overrideId: string) {
    return this.schedule.removeOverride(userId, overrideId);
  }
}
