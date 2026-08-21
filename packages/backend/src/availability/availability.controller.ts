import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AvailabilityService, RequestUser } from './availability.service';
import { AvailabilityWindowsService } from './availability-windows.service';
import { HolidaysService } from './holidays.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import {
  CreateAvailabilityWindowDto,
  CreateMonthlyAvailabilityWindowDto,
} from './dto/create-availability-window.dto';
import { SubmitAvailabilityDto } from './dto/submit-availability.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import {
  Action,
  AvailabilityWindowCategory,
  AvailabilityWindowStatus,
} from '@redinfo/shared';

// ─── Holidays ─────────────────────────────────────────────────────────────────

@ApiTags('Holidays')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @Get()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  // Ungated read: the holiday list is what makes the shift pattern
  // predictable, so every volunteer needs it (RolesGuard allows a handler
  // with no @Actions to any authenticated user).
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(100), ParseIntPipe) perPage: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.holidaysService.findAll(page, perPage, from, to);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.holidaysService.findOne(id);
  }

  @Post()
  @Actions(Action.MANAGE_HOLIDAYS)
  create(@Body() dto: CreateHolidayDto) {
    return this.holidaysService.create(dto);
  }

  @Patch(':id')
  @Actions(Action.MANAGE_HOLIDAYS)
  update(@Param('id') id: string, @Body() dto: UpdateHolidayDto) {
    return this.holidaysService.update(id, dto);
  }

  @Delete(':id')
  @Actions(Action.MANAGE_HOLIDAYS)
  remove(@Param('id') id: string) {
    return this.holidaysService.remove(id);
  }
}

// ─── Availability windows ─────────────────────────────────────────────────────

@ApiTags('Availability Windows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('availability-windows')
export class AvailabilityWindowsController {
  constructor(private readonly windowsService: AvailabilityWindowsService) {}

  @Get()
  @Actions(Action.MANAGE_AVAILABILITY_WINDOWS)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'category', required: false, enum: AvailabilityWindowCategory })
  @ApiQuery({ name: 'status', required: false, enum: AvailabilityWindowStatus })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(25), ParseIntPipe) perPage: number,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    return this.windowsService.findAll(page, perPage, { category, status });
  }

  // Ungated: any authenticated user may check whether submissions are open.
  @Get('active')
  findActive() {
    return this.windowsService.findActive();
  }

  /**
   * Every open window. Several can be open at once — one per category — so this
   * is what a caller needs rather than `active`, which only picks the latest.
   */
  @Get('open')
  findOpen() {
    return this.windowsService.findOpen();
  }

  /**
   * Windows of one category already covering a proposed range, so the create
   * screens can warn *before* saving instead of only on the rejected request.
   */
  @Get('overlaps')
  @Actions(Action.MANAGE_AVAILABILITY_WINDOWS)
  @ApiQuery({ name: 'category', required: true, enum: AvailabilityWindowCategory })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  findOverlaps(
    @Query('category') category: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.windowsService.findOverlaps(category, startDate, endDate);
  }

  @Get(':id')
  @Actions(Action.MANAGE_AVAILABILITY_WINDOWS)
  findOne(@Param('id') id: string) {
    return this.windowsService.findOne(id);
  }

  /** The window's own per-day shifts — not the default grid. */
  @Get(':id/calendar')
  @Actions(Action.MANAGE_AVAILABILITY_WINDOWS)
  getCalendar(@Param('id') id: string) {
    return this.windowsService.getCalendar(id);
  }

  @Post()
  @Actions(Action.MANAGE_AVAILABILITY_WINDOWS)
  open(@Body() dto: CreateAvailabilityWindowDto, @CurrentUser() user: RequestUser) {
    return this.windowsService.open(dto, user.id);
  }

  /** Whole calendar month on the default grid; `days` is derived, not sent. */
  @Post('month')
  @Actions(Action.MANAGE_AVAILABILITY_WINDOWS)
  openMonth(
    @Body() dto: CreateMonthlyAvailabilityWindowDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.windowsService.openMonth(dto, user.id);
  }

  @Post(':id/close')
  @Actions(Action.MANAGE_AVAILABILITY_WINDOWS)
  close(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.windowsService.close(id, user.id);
  }
}

// ─── Availability submissions ─────────────────────────────────────────────────

@ApiTags('Availability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get('me')
  @Actions(Action.SUBMIT_AVAILABILITY)
  @ApiQuery({ name: 'windowId', required: false, type: String })
  getMine(@CurrentUser() user: RequestUser, @Query('windowId') windowId?: string) {
    return this.availabilityService.getMine(user.id, windowId);
  }

  @Put('me')
  @Actions(Action.SUBMIT_AVAILABILITY)
  submitMine(@CurrentUser() user: RequestUser, @Body() dto: SubmitAvailabilityDto) {
    return this.availabilityService.submitMine(user, dto);
  }

  @Post('me/decline')
  @Actions(Action.SUBMIT_AVAILABILITY)
  @ApiQuery({ name: 'windowId', required: false, type: String })
  decline(@CurrentUser() user: RequestUser, @Query('windowId') windowId?: string) {
    return this.availabilityService.declineMine(user, windowId);
  }

  @Delete('me/decline')
  @Actions(Action.SUBMIT_AVAILABILITY)
  @ApiQuery({ name: 'windowId', required: false, type: String })
  undecline(@CurrentUser() user: RequestUser, @Query('windowId') windowId?: string) {
    return this.availabilityService.undeclineMine(user, windowId);
  }

  // Ungated at the guard level on purpose: the ownership check inside the
  // service is finer-grained than @Actions can express (self always allowed,
  // anyone else needs VIEW_AVAILABILITY_MATRIX).
  @Get('users/:userId')
  @ApiQuery({ name: 'windowId', required: false, type: String })
  getForUser(
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
    @Query('windowId') windowId?: string,
  ) {
    return this.availabilityService.getForUser(userId, user, windowId);
  }

  @Get('calendar')
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({
    name: 'windowId',
    required: false,
    type: String,
    description: "Use this window's own shifts for the days it covers.",
  })
  getCalendar(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('windowId') windowId?: string,
  ) {
    return this.availabilityService.getCalendar(from, to, windowId);
  }

  @Get('matrix')
  @Actions(Action.VIEW_AVAILABILITY_MATRIX)
  @ApiQuery({ name: 'windowId', required: false, type: String })
  getMatrix(@Query('windowId') windowId?: string) {
    return this.availabilityService.getMatrix(windowId);
  }

  @Get('matrix/csv')
  @Actions(Action.VIEW_AVAILABILITY_MATRIX)
  @ApiQuery({ name: 'windowId', required: false, type: String })
  async getMatrixCsv(@Res() res: Response, @Query('windowId') windowId?: string) {
    const csv = await this.availabilityService.getMatrixCsv(windowId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="availability-${windowId ?? 'current'}.csv"`,
    );
    res.send(csv);
  }
}
