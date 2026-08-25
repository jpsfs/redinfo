import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Action, CertificationType, MAX_ATTACHMENT_BYTES, UserRole } from '@redinfo/shared';
import { UsersService } from './users.service';
import { UserProfileService } from './user-profile.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { UploadedFile as UploadedFileShape } from './user-certifications.service';

export interface RequestUser {
  id: string;
  role: UserRole;
}

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly profile: UserProfileService,
  ) {}

  @Get()
  @Actions(Action.VIEW_USERS)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'readiness', required: false, enum: ['OPERATIONAL', 'NOT_OPERATIONAL'] })
  @ApiQuery({ name: 'certification', required: false, enum: CertificationType })
  @ApiQuery({ name: 'certificationStatus', required: false, enum: ['EXPIRING', 'EXPIRED'] })
  @ApiQuery({ name: 'ids', required: false, type: String, description: 'Comma-separated ids' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(25), ParseIntPipe) perPage: number,
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('isActive') isActiveRaw?: string,
    @Query('readiness') readiness?: string,
    @Query('certification') certification?: string,
    @Query('certificationStatus') certificationStatus?: string,
    @Query('ids') ids?: string,
  ) {
    return this.usersService.findAll(page, perPage, {
      ...(q ? { q } : {}),
      ...(this.isUserRole(role) ? { role } : {}),
      ...(isActiveRaw !== undefined ? { isActive: isActiveRaw === 'true' } : {}),
      ...(readiness === 'OPERATIONAL' || readiness === 'NOT_OPERATIONAL' ? { readiness } : {}),
      ...(this.isCertificationType(certification) ? { certification } : {}),
      ...(certificationStatus === 'EXPIRING' || certificationStatus === 'EXPIRED'
        ? { certificationStatus }
        : {}),
      ...(ids ? { ids: ids.split(',').map((id) => id.trim()).filter(Boolean) } : {}),
    });
  }

  // Declared before `:id` so "certification-alerts" is never read as an id.
  @Get('certification-alerts')
  @Actions(Action.VIEW_USERS)
  certificationAlerts() {
    return this.usersService.certificationAlerts();
  }

  // Ungated on purpose (RolesGuard lets an un-annotated handler through to any
  // authenticated user): everyone may read and edit their own profile
  // subset. Declared before `:id` for the same reason as above.
  @Get('me/profile')
  getOwnProfile(@CurrentUser() user: RequestUser) {
    return this.profile.getOwn(user.id);
  }

  @Patch('me/profile')
  updateOwnProfile(@CurrentUser() user: RequestUser, @Body() dto: UpdateProfileDto) {
    return this.profile.updateOwn(user.id, dto);
  }

  @Post('me/photo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }))
  setOwnPhoto(@CurrentUser() user: RequestUser, @UploadedFile() file?: UploadedFileShape) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    return this.profile.setPhoto(user.id, file);
  }

  @Delete('me/photo')
  removeOwnPhoto(@CurrentUser() user: RequestUser) {
    return this.profile.removePhoto(user.id);
  }

  @Get(':id')
  @Actions(Action.VIEW_USERS)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Actions(Action.MANAGE_USERS)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  /**
   * Ungated on purpose: account fields (email, role, password) need
   * `MANAGE_USERS`, personnel fields (name, active flag, contact details, …)
   * need `MANAGE_PERSONNEL` — `UsersService.update` enforces the split so one
   * endpoint can serve both an admin and a coordinator.
   */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: RequestUser) {
    return this.usersService.update(id, dto, user);
  }

  @Delete(':id')
  @Actions(Action.MANAGE_USERS)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  // ── Coordinator managing someone else's photo ──────────────────────────────

  @Post(':id/photo')
  @Actions(Action.MANAGE_PERSONNEL)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }))
  setPhoto(@Param('id') id: string, @UploadedFile() file?: UploadedFileShape) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    return this.profile.setPhoto(id, file);
  }

  @Delete(':id/photo')
  @Actions(Action.MANAGE_PERSONNEL)
  removePhoto(@Param('id') id: string) {
    return this.profile.removePhoto(id);
  }

  // Ungated: a photo is not sensitive the way identity numbers are, and every
  // authenticated screen that shows a person (schedules, crew lists) needs it.
  @Get(':id/photo')
  async downloadPhoto(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const file = await this.profile.downloadPhoto(id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file.data);
  }

  private isUserRole(value: string | undefined): value is UserRole {
    return value !== undefined && Object.values(UserRole).includes(value as UserRole);
  }

  private isCertificationType(value: string | undefined): value is CertificationType {
    return value !== undefined && Object.values(CertificationType).includes(value as CertificationType);
  }
}
