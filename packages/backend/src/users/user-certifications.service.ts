import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CERTIFICATION_LABEL,
  CertificationType,
  UserCertification,
  validateAttachment,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { parseIsoDate, toIsoDate } from '../utils/date.util';
import { ATTACHMENT_STORAGE, AttachmentStorage } from '../storage/attachment-storage';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { UpdateCertificationDto } from './dto/update-certification.dto';

export const CERT_SELECT = {
  id: true,
  userId: true,
  type: true,
  validUntil: true,
  issuedOn: true,
  notes: true,
  filename: true,
  mimeType: true,
  byteSize: true,
  storageKey: true,
  createdById: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserCertificationSelect;

// Hand-rolled rather than `Prisma.UserCertificationGetPayload<>`: Prisma's
// generated payload type renders `type` as its own nominal `$Enums.CertificationType`,
// which does not structurally satisfy the shared enum. The template-literal
// form here is what accepts both without a cast at every call site (see
// `WindowRow.category` in `availability-windows.service.ts` for the same trick).
export interface CertRow {
  id: string;
  userId: string;
  type: `${CertificationType}`;
  validUntil: Date | null;
  issuedOn: Date | null;
  notes: string | null;
  filename: string | null;
  mimeType: string | null;
  byteSize: number | null;
  storageKey: string | null;
  createdById: string;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeCertification(row: CertRow): UserCertification {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as CertificationType,
    validUntil: row.validUntil ? toIsoDate(row.validUntil) : null,
    issuedOn: row.issuedOn ? toIsoDate(row.issuedOn) : null,
    notes: row.notes,
    hasDocument: row.storageKey !== null,
    filename: row.filename,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    createdById: row.createdById,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface CertificationDocumentDownload {
  filename: string;
  mimeType: string;
  data: Buffer;
}

/**
 * The certifications a coordinator maintains for one person — driver, SBV,
 * TAT, TAS. Kept separate from `UsersService`: this is coordinator-only
 * write access to a record everyone else only ever reads.
 */
@Injectable()
export class UserCertificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage,
  ) {}

  async list(userId: string): Promise<UserCertification[]> {
    await this.assertUserExists(userId);
    const rows = await this.prisma.userCertification.findMany({
      where: { userId },
      select: CERT_SELECT,
      orderBy: { type: 'asc' },
    });
    return rows.map(serializeCertification);
  }

  async add(
    userId: string,
    dto: CreateCertificationDto,
    actorId: string,
  ): Promise<UserCertification> {
    await this.assertUserExists(userId);

    const existing = await this.prisma.userCertification.findUnique({
      where: { userId_type: { userId, type: dto.type } },
    });
    if (existing) {
      throw new ConflictException(
        `This person already has a ${CERTIFICATION_LABEL[dto.type]} certification — edit it instead of adding another.`,
      );
    }

    const row = await this.prisma.userCertification.create({
      data: {
        userId,
        type: dto.type,
        validUntil: dto.validUntil ? parseIsoDate(dto.validUntil) : null,
        issuedOn: dto.issuedOn ? parseIsoDate(dto.issuedOn) : null,
        notes: dto.notes,
        createdById: actorId,
      },
      select: CERT_SELECT,
    });
    return serializeCertification(row);
  }

  async update(
    userId: string,
    certificationId: string,
    dto: UpdateCertificationDto,
  ): Promise<UserCertification> {
    await this.loadOwn(userId, certificationId);

    const row = await this.prisma.userCertification.update({
      where: { id: certificationId },
      data: {
        ...(dto.validUntil !== undefined && {
          validUntil: dto.validUntil ? parseIsoDate(dto.validUntil) : null,
        }),
        ...(dto.issuedOn !== undefined && {
          issuedOn: dto.issuedOn ? parseIsoDate(dto.issuedOn) : null,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      select: CERT_SELECT,
    });
    return serializeCertification(row);
  }

  /** Removes the record, then its document, if any — never fabricated back. */
  async remove(userId: string, certificationId: string): Promise<{ id: string }> {
    const row = await this.loadOwn(userId, certificationId);
    await this.prisma.userCertification.delete({ where: { id: certificationId } });
    if (row.storageKey) {
      await this.storage.remove(row.storageKey).catch(() => undefined);
    }
    return { id: certificationId };
  }

  /** Stores the file, then updates the row — replacing any earlier document. */
  async uploadDocument(
    userId: string,
    certificationId: string,
    file: UploadedFile,
  ): Promise<UserCertification> {
    const existing = await this.loadOwn(userId, certificationId);

    const error = validateAttachment({
      filename: file.originalname,
      mimeType: file.mimetype,
      byteSize: file.size,
    });
    if (error) throw new BadRequestException(error);

    const storageKey = await this.storage.save(
      `certifications-${userId}`,
      file.originalname,
      file.buffer,
    );

    try {
      const row = await this.prisma.userCertification.update({
        where: { id: certificationId },
        data: {
          filename: file.originalname,
          mimeType: file.mimetype,
          byteSize: file.size,
          storageKey,
        },
        select: CERT_SELECT,
      });
      // Replaced, not appended — the old file is now unreferenced.
      if (existing.storageKey) {
        await this.storage.remove(existing.storageKey).catch(() => undefined);
      }
      return serializeCertification(row);
    } catch (cause) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw cause;
    }
  }

  /** Clears the attached document, keeping the certification record itself. */
  async removeDocument(userId: string, certificationId: string): Promise<UserCertification> {
    const existing = await this.loadOwn(userId, certificationId);
    if (!existing.storageKey) {
      throw new NotFoundException('This certification has no document attached.');
    }

    const row = await this.prisma.userCertification.update({
      where: { id: certificationId },
      data: { filename: null, mimeType: null, byteSize: null, storageKey: null },
      select: CERT_SELECT,
    });
    await this.storage.remove(existing.storageKey).catch(() => undefined);
    return serializeCertification(row);
  }

  async downloadDocument(
    userId: string,
    certificationId: string,
  ): Promise<CertificationDocumentDownload> {
    const row = await this.loadOwn(userId, certificationId);
    if (!row.storageKey || !row.filename || !row.mimeType) {
      throw new NotFoundException('This certification has no document attached.');
    }
    return {
      filename: row.filename,
      mimeType: row.mimeType,
      data: await this.storage.read(row.storageKey),
    };
  }

  private async assertUserExists(userId: string): Promise<void> {
    const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) throw new NotFoundException(`User ${userId} not found`);
  }

  private async loadOwn(userId: string, certificationId: string) {
    const row = await this.prisma.userCertification.findFirst({
      where: { id: certificationId, userId },
    });
    if (!row) throw new NotFoundException(`Certification ${certificationId} not found`);
    return row;
  }
}
