import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { validateAttachment } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { parseIsoDate } from '../utils/date.util';
import { ATTACHMENT_STORAGE, AttachmentStorage } from '../storage/attachment-storage';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PERSON_SELECT, serializePerson } from './users.service';
import { recordProfileChanges } from './profile-audit.util';
import { UploadedFile } from './user-certifications.service';

/** What a person may change about their own profile — see `UpdateProfileDto`. */
const SELF_AUDITED_FIELDS = [
  'phone',
  'birthDate',
  'addressLine',
  'postalCode',
  'localityId',
  'emergencyContactName',
  'emergencyContactPhone',
];

export interface PhotoDownload {
  filename: string;
  mimeType: string;
  data: Buffer;
}

/**
 * The self-service half of personnel data: a person's own contact details and
 * photo. Everything else on `User` — identity numbers, role, the active flag,
 * certifications — goes through `UsersService`/`UserCertificationsService`,
 * coordinator/admin only.
 */
@Injectable()
export class UserProfileService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage,
  ) {}

  async getOwn(userId: string) {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: PERSON_SELECT });
    if (!row) throw new NotFoundException(`User ${userId} not found`);
    return serializePerson(row);
  }

  async updateOwn(userId: string, dto: UpdateProfileDto) {
    const before = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new NotFoundException(`User ${userId} not found`);

    const row = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.birthDate !== undefined && {
          birthDate: dto.birthDate ? parseIsoDate(dto.birthDate) : null,
        }),
        ...(dto.addressLine !== undefined && { addressLine: dto.addressLine }),
        ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
        ...(dto.localityId !== undefined && { localityId: dto.localityId }),
        ...(dto.emergencyContactName !== undefined && {
          emergencyContactName: dto.emergencyContactName,
        }),
        ...(dto.emergencyContactPhone !== undefined && {
          emergencyContactPhone: dto.emergencyContactPhone,
        }),
      },
      select: PERSON_SELECT,
    });

    await recordProfileChanges(this.prisma, {
      userId,
      changedById: userId,
      fields: SELF_AUDITED_FIELDS,
      before,
      after: row,
    });

    return serializePerson(row);
  }

  /** Sets or replaces the profile photo — `userId` may be self or, for a
   * coordinator, anyone else; the controller decides who may call this. */
  async setPhoto(userId: string, file: UploadedFile) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { photoStorageKey: true },
    });
    if (!existing) throw new NotFoundException(`User ${userId} not found`);

    const error = validateAttachment({
      filename: file.originalname,
      mimeType: file.mimetype,
      byteSize: file.size,
    });
    if (error) throw new BadRequestException(error);

    const storageKey = await this.storage.save(`people-${userId}`, file.originalname, file.buffer);

    try {
      const row = await this.prisma.user.update({
        where: { id: userId },
        data: {
          photoFilename: file.originalname,
          photoMimeType: file.mimetype,
          photoByteSize: file.size,
          photoStorageKey: storageKey,
        },
        select: PERSON_SELECT,
      });
      if (existing.photoStorageKey) {
        await this.storage.remove(existing.photoStorageKey).catch(() => undefined);
      }
      return serializePerson(row);
    } catch (cause) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw cause;
    }
  }

  async removePhoto(userId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { photoStorageKey: true },
    });
    if (!existing) throw new NotFoundException(`User ${userId} not found`);

    const row = await this.prisma.user.update({
      where: { id: userId },
      data: { photoFilename: null, photoMimeType: null, photoByteSize: null, photoStorageKey: null },
      select: PERSON_SELECT,
    });
    if (existing.photoStorageKey) {
      await this.storage.remove(existing.photoStorageKey).catch(() => undefined);
    }
    return serializePerson(row);
  }

  async downloadPhoto(userId: string): Promise<PhotoDownload> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { photoFilename: true, photoMimeType: true, photoStorageKey: true },
    });
    if (!row?.photoStorageKey || !row.photoFilename || !row.photoMimeType) {
      throw new NotFoundException('This person has no photo.');
    }
    return {
      filename: row.photoFilename,
      mimeType: row.photoMimeType,
      data: await this.storage.read(row.photoStorageKey),
    };
  }
}
