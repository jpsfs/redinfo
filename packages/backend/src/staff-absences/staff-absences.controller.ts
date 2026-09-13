import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Action } from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { StaffAbsencesService } from './staff-absences.service';
import { CreateStaffAbsenceDto } from './dto/create-staff-absence.dto';
import { UpdateStaffAbsenceDto } from './dto/update-staff-absence.dto';
import { RequestUser } from '../users/users.controller';

/**
 * Staff absence calendar (#224). Reading is ungated (`RolesGuard` lets an
 * un-annotated handler through to any authenticated user) — the service
 * scopes the result to the caller without `MANAGE_PERSONNEL`, the same way
 * `GET /schedules/me` does. Writes are `MANAGE_PERSONNEL` only: this is a
 * coordinator's record of a durable HR fact, not something a person edits
 * about themselves.
 */
@ApiTags('Staff absences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('staff-absences')
export class StaffAbsencesController {
  constructor(private readonly staffAbsences: StaffAbsencesService) {}

  @Get()
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  list(
    @CurrentUser() user: RequestUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('userId') userId?: string,
  ) {
    return this.staffAbsences.list(user, from, to, userId);
  }

  @Post()
  @Actions(Action.MANAGE_PERSONNEL)
  create(@Body() dto: CreateStaffAbsenceDto, @CurrentUser() user: RequestUser) {
    return this.staffAbsences.create(dto, user.id);
  }

  @Patch(':id')
  @Actions(Action.MANAGE_PERSONNEL)
  update(@Param('id') id: string, @Body() dto: UpdateStaffAbsenceDto) {
    return this.staffAbsences.update(id, dto);
  }

  @Delete(':id')
  @Actions(Action.MANAGE_PERSONNEL)
  remove(@Param('id') id: string) {
    return this.staffAbsences.remove(id);
  }
}
