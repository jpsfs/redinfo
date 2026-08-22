import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  Action,
  EventReportListFilters,
  EventReportType,
  MAX_ATTACHMENT_BYTES,
} from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { EventReportsService, RequestUser } from './event-reports.service';
import { EventReportCrewService } from './event-report-crew.service';
import {
  EventReportAttachmentsService,
  UploadedAttachment,
} from './event-report-attachments.service';
import { CreateEventReportDto, UpdateEventReportDto } from './dto/event-report.dto';

@ApiTags('Event reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('event-reports')
export class EventReportsController {
  constructor(
    private readonly reports: EventReportsService,
    private readonly crew: EventReportCrewService,
    private readonly attachments: EventReportAttachmentsService,
  ) {}

  // ── Collection routes ──────────────────────────────────────────────────────
  // Every fixed path is declared before `:id`, so "me" and "counts" are never
  // read as report ids.

  @Get()
  @Actions(Action.VIEW_EVENT_REPORTS)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, enum: EventReportType })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(25), ParseIntPipe) perPage: number,
    @Query() query: Record<string, string>,
  ) {
    return this.reports.findAll(this.toFilters(query), page, perPage);
  }

  /**
   * The reports the caller was on.
   *
   * Ungated — `RolesGuard` lets an un-annotated handler through to any
   * authenticated user — and scoped to the caller in the service, so an
   * operational sees their own activities without being able to read anyone
   * else's.
   */
  @Get('me')
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  findMine(
    @CurrentUser() user: { id: string },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(25), ParseIntPipe) perPage: number,
    @Query() query: Record<string, string>,
  ) {
    return this.reports.findMine(user.id, this.toFilters(query), page, perPage);
  }

  /** Per-type totals for the list's filter tabs, scoped to what the caller may read. */
  @Get('counts')
  counts(@CurrentUser() user: RequestUser, @Query() query: Record<string, string>) {
    return this.reports.counts(this.toFilters(query), user);
  }

  /** The roster a crew may be picked from — narrower than `GET /users`. */
  @Get('crew-candidates')
  @Actions(Action.CREATE_EVENT_REPORT)
  crewCandidates() {
    return this.crew.listCandidates();
  }

  /**
   * The shift to pre-fill the crew from, plus recent shifts to switch to.
   *
   * `at` is when the activity started; it defaults to now, which is the case
   * for a report filed during or just after the shift.
   */
  @Get('crew-suggestion')
  @Actions(Action.CREATE_EVENT_REPORT)
  @ApiQuery({ name: 'type', required: true, enum: EventReportType })
  @ApiQuery({ name: 'at', required: false, type: String })
  crewSuggestion(@Query('type') type: EventReportType, @Query('at') at?: string) {
    if (!Object.values(EventReportType).includes(type)) {
      throw new BadRequestException(`Unknown report type "${type}"`);
    }
    const moment = at ? new Date(at) : new Date();
    if (Number.isNaN(moment.getTime())) {
      throw new BadRequestException(`"${at}" is not a valid time`);
    }
    return this.crew.suggestCrew(type, moment);
  }

  // ── Single report ──────────────────────────────────────────────────────────

  /**
   * Ungated here because the answer depends on the row, not the route: the
   * crew of an activity may read their own report, everyone else needs
   * `VIEW_EVENT_REPORTS`. The service decides.
   */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.reports.findOne(id, user);
  }

  @Post()
  @Actions(Action.CREATE_EVENT_REPORT)
  create(@Body() dto: CreateEventReportDto, @CurrentUser() user: { id: string }) {
    return this.reports.create(dto, user.id);
  }

  /** Ungated for the same reason as `GET :id` — the service checks the row. */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventReportDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reports.update(id, dto, user);
  }

  @Delete(':id')
  @Actions(Action.MANAGE_EVENT_REPORTS)
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.reports.remove(id, user);
  }

  // ── Attachments ────────────────────────────────────────────────────────────

  @Get(':id/attachments')
  listAttachments(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.attachments.list(id, user);
  }

  /**
   * One file per request, held in memory.
   *
   * Memory rather than multer's disk storage because the service owns where
   * bytes land — multer would drop them somewhere with a name of its own
   * choosing, and then the row and the file could disagree. `limits` refuses an
   * oversized upload before it is fully read; `validateAttachment` refuses the
   * ones that are the right size and the wrong kind.
   */
  @Post(':id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
    }),
  )
  addAttachment(
    @Param('id') id: string,
    @UploadedFile() file: UploadedAttachment | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    return this.attachments.add(id, file, user);
  }

  @Get(':id/attachments/:attachmentId')
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: RequestUser,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.attachments.download(id, attachmentId, user);

    response.setHeader('Content-Type', file.mimeType);
    // `attachment` rather than `inline`: the browser must never be talked into
    // rendering an uploaded file as a document in our own origin.
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.filename)}"`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file.data);
  }

  @Delete(':id/attachments/:attachmentId')
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attachments.remove(id, attachmentId, user);
  }

  /**
   * Query string → filters, keeping the unknown keys out.
   *
   * Read off the raw query rather than a DTO because `page`/`perPage` are
   * already bound as separate parameters, and a second DTO covering only the
   * rest would be two places to add a filter.
   */
  private toFilters(query: Record<string, string>): EventReportListFilters {
    const type = query.type as EventReportType | undefined;
    return {
      ...(type && Object.values(EventReportType).includes(type) ? { type } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      ...(query.q ? { q: query.q } : {}),
    };
  }
}
