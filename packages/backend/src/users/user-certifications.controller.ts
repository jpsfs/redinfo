import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Action, MAX_ATTACHMENT_BYTES, hasPermission } from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { UserCertificationsService, UploadedFile as UploadedFileShape } from './user-certifications.service';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { UpdateCertificationDto } from './dto/update-certification.dto';
import { RequestUser } from './users.controller';

/**
 * A person's certifications, nested under them rather than exposed as their
 * own top-level resource: they only ever make sense in the context of one
 * person, and every route here needs that person's id regardless.
 *
 * Deliberately ungated at the guard level — reading is open to the person
 * themselves as well as a coordinator, which `@Actions` cannot express as an
 * OR with "is the subject". Writing is coordinator/admin only, checked here.
 */
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('users/:userId/certifications')
export class UserCertificationsController {
  constructor(private readonly certifications: UserCertificationsService) {}

  @Get()
  list(@Param('userId') userId: string, @CurrentUser() user: RequestUser) {
    this.assertCanRead(userId, user);
    return this.certifications.list(userId);
  }

  @Post()
  add(
    @Param('userId') userId: string,
    @Body() dto: CreateCertificationDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.assertCanWrite(user);
    return this.certifications.add(userId, dto, user.id);
  }

  @Patch(':certificationId')
  update(
    @Param('userId') userId: string,
    @Param('certificationId') certificationId: string,
    @Body() dto: UpdateCertificationDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.assertCanWrite(user);
    return this.certifications.update(userId, certificationId, dto);
  }

  @Delete(':certificationId')
  remove(
    @Param('userId') userId: string,
    @Param('certificationId') certificationId: string,
    @CurrentUser() user: RequestUser,
  ) {
    this.assertCanWrite(user);
    return this.certifications.remove(userId, certificationId);
  }

  @Post(':certificationId/document')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }))
  uploadDocument(
    @Param('userId') userId: string,
    @Param('certificationId') certificationId: string,
    @UploadedFile() file: UploadedFileShape | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    this.assertCanWrite(user);
    if (!file) throw new BadRequestException('No file was uploaded.');
    return this.certifications.uploadDocument(userId, certificationId, file);
  }

  @Delete(':certificationId/document')
  removeDocument(
    @Param('userId') userId: string,
    @Param('certificationId') certificationId: string,
    @CurrentUser() user: RequestUser,
  ) {
    this.assertCanWrite(user);
    return this.certifications.removeDocument(userId, certificationId);
  }

  @Get(':certificationId/document')
  async downloadDocument(
    @Param('userId') userId: string,
    @Param('certificationId') certificationId: string,
    @CurrentUser() user: RequestUser,
    @Res() response: Response,
  ): Promise<void> {
    this.assertCanRead(userId, user);
    const file = await this.certifications.downloadDocument(userId, certificationId);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.filename)}"`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file.data);
  }

  private assertCanRead(userId: string, user: RequestUser): void {
    if (user.id === userId) return;
    if (hasPermission(user.roles, Action.VIEW_USERS)) return;
    if (hasPermission(user.roles, Action.MANAGE_PERSONNEL)) return;
    throw new ForbiddenException("You may not read this person's certifications.");
  }

  private assertCanWrite(user: RequestUser): void {
    if (hasPermission(user.roles, Action.MANAGE_PERSONNEL)) return;
    throw new ForbiddenException('Only a coordinator or admin may maintain certifications.');
  }
}
