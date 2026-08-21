import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Action } from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { SchedulesService } from './schedules.service';
import { ScheduleAssignmentsService } from './schedule-assignments.service';
import { ScheduleAutofillService } from './schedule-autofill.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { CreateScheduleAssignmentDto } from './dto/create-assignment.dto';
import { AutofillScheduleDto } from './dto/autofill-schedule.dto';

@ApiTags('Schedules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('schedules')
export class SchedulesController {
  constructor(
    private readonly schedules: SchedulesService,
    private readonly assignments: ScheduleAssignmentsService,
    private readonly autofill: ScheduleAutofillService,
  ) {}

  /**
   * Someone's own published duties.
   *
   * Ungated on purpose (RolesGuard lets an un-annotated handler through to any
   * authenticated user) and scoped to the caller in the service, so a volunteer
   * sees their rota without being able to read anyone else's.
   *
   * Declared before `:id` so "me" is never read as a schedule id.
   */
  @Get('me')
  getMyDuties(@CurrentUser() user: { id: string }) {
    return this.schedules.getMyDuties(user.id);
  }

  @Get()
  @Actions(Action.VIEW_SCHEDULES)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'windowId', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(25), ParseIntPipe) perPage: number,
    @Query('windowId') windowId?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    return this.schedules.findAll(page, perPage, { windowId, category, status });
  }

  @Get(':id')
  @Actions(Action.VIEW_SCHEDULES)
  findOne(@Param('id') id: string) {
    return this.schedules.findOne(id);
  }

  /** The whole board: days, shifts, assignments, gaps and conflicts. */
  @Get(':id/board')
  @Actions(Action.VIEW_SCHEDULES)
  getBoard(@Param('id') id: string) {
    return this.schedules.getBoard(id);
  }

  @Get(':id/csv')
  @Actions(Action.VIEW_SCHEDULES)
  async exportCsv(@Param('id') id: string, @Res() res: Response) {
    const csv = await this.schedules.getCsv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="schedule-${id}.csv"`);
    res.send(csv);
  }

  @Get(':id/candidates')
  @Actions(Action.MANAGE_SCHEDULES)
  @ApiQuery({ name: 'date', required: true, type: String })
  @ApiQuery({ name: 'slot', required: true, type: Number })
  @ApiQuery({ name: 'roleId', required: false, type: String })
  getCandidates(
    @Param('id') id: string,
    @Query('date') date: string,
    @Query('slot', ParseIntPipe) slot: number,
    @Query('roleId') roleId?: string,
  ) {
    return this.assignments.getCandidates(id, date, slot, roleId);
  }

  @Post()
  @Actions(Action.MANAGE_SCHEDULES)
  create(@Body() dto: CreateScheduleDto, @CurrentUser() user: { id: string }) {
    return this.schedules.create(dto, user.id);
  }

  @Delete(':id')
  @Actions(Action.MANAGE_SCHEDULES)
  remove(@Param('id') id: string) {
    return this.schedules.remove(id);
  }

  @Post(':id/autofill')
  @Actions(Action.MANAGE_SCHEDULES)
  runAutofill(
    @Param('id') id: string,
    @Body() dto: AutofillScheduleDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.autofill.autofill(id, dto, user.id);
  }

  @Post(':id/assignments')
  @Actions(Action.MANAGE_SCHEDULES)
  assign(
    @Param('id') id: string,
    @Body() dto: CreateScheduleAssignmentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.assignments.assign(id, dto, user.id);
  }

  @Delete(':id/assignments/:assignmentId')
  @Actions(Action.MANAGE_SCHEDULES)
  unassign(@Param('id') id: string, @Param('assignmentId') assignmentId: string) {
    return this.assignments.unassign(id, assignmentId);
  }

  @Post(':id/publish')
  @Actions(Action.MANAGE_SCHEDULES)
  publish(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.schedules.publish(id, user.id);
  }
}
