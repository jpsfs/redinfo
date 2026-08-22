import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventReportAttachment,
  MAX_ATTACHMENTS_PER_REPORT,
  validateAttachment,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventReportsService, RequestUser } from './event-reports.service';
import { ATTACHMENT_STORAGE, AttachmentStorage } from './attachment-storage';

/** What a controller hands over, independent of how the file arrived. */
export interface UploadedAttachment {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface AttachmentDownload {
  filename: string;
  mimeType: string;
  data: Buffer;
}

const PERSON_SELECT = { select: { id: true, firstName: true, lastName: true } } as const;

function serialize(row: {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  uploadedById: string;
  uploadedBy?: { id: string; firstName: string; lastName: string } | null;
  createdAt: Date;
}): EventReportAttachment {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    uploadedById: row.uploadedById,
    ...(row.uploadedBy ? { uploadedBy: row.uploadedBy } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Photographs and paperwork hung off a report.
 *
 * Separate from `EventReportsService` because the lifecycle is different: a
 * report is saved once as a whole, while attachments arrive one at a time, from
 * a phone, often minutes or hours later when the signal comes back. Making them
 * part of the report payload would mean a crew could not save until every photo
 * had uploaded.
 */
@Injectable()
export class EventReportAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: EventReportsService,
    @Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage,
  ) {}

  async list(reportId: string, user: RequestUser): Promise<EventReportAttachment[]> {
    const report = await this.reports.loadRow(reportId);
    this.reports.assertCanRead(report, user);

    const rows = await this.prisma.eventReportAttachment.findMany({
      where: { reportId },
      include: { uploadedBy: PERSON_SELECT },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(serialize);
  }

  /**
   * Stores the file, then records it.
   *
   * That order leaves an orphaned blob if the insert fails, which is the
   * cheaper failure: a stray file costs disk, whereas a row pointing at bytes
   * that were never written is a broken attachment in the UI. The insert is
   * also what enforces the per-report cap, so a burst of uploads cannot slip
   * past it — the count is re-read inside the same request.
   */
  async add(
    reportId: string,
    file: UploadedAttachment,
    user: RequestUser,
  ): Promise<EventReportAttachment> {
    const report = await this.reports.loadRow(reportId);
    this.reports.assertCanWrite(report, user);

    const error = validateAttachment({
      filename: file.originalname,
      mimeType: file.mimetype,
      byteSize: file.size,
    });
    if (error) throw new BadRequestException(error);

    const existing = await this.prisma.eventReportAttachment.count({ where: { reportId } });
    if (existing >= MAX_ATTACHMENTS_PER_REPORT) {
      throw new BadRequestException(
        `A report may carry at most ${MAX_ATTACHMENTS_PER_REPORT} attachments.`,
      );
    }

    const storageKey = await this.storage.save(reportId, file.originalname, file.buffer);

    try {
      const created = await this.prisma.eventReportAttachment.create({
        data: {
          reportId,
          filename: file.originalname,
          mimeType: file.mimetype,
          byteSize: file.size,
          storageKey,
          uploadedById: user.id,
        },
        include: { uploadedBy: PERSON_SELECT },
      });
      return serialize(created);
    } catch (cause) {
      // Nothing references the bytes now, so do not leave them behind.
      await this.storage.remove(storageKey).catch(() => undefined);
      throw cause;
    }
  }

  async download(
    reportId: string,
    attachmentId: string,
    user: RequestUser,
  ): Promise<AttachmentDownload> {
    const report = await this.reports.loadRow(reportId);
    this.reports.assertCanRead(report, user);

    const row = await this.prisma.eventReportAttachment.findFirst({
      where: { id: attachmentId, reportId },
    });
    if (!row) throw new NotFoundException(`Attachment ${attachmentId} not found`);

    return {
      filename: row.filename,
      mimeType: row.mimeType,
      data: await this.storage.read(row.storageKey),
    };
  }

  /**
   * Removes the row, then the bytes.
   *
   * The opposite order to `add`, and for the same reason: whichever half
   * survives a failure should be the harmless one. A file with no row is
   * invisible; a row with no file is a broken thumbnail.
   */
  async remove(
    reportId: string,
    attachmentId: string,
    user: RequestUser,
  ): Promise<{ id: string }> {
    const report = await this.reports.loadRow(reportId);
    this.reports.assertCanWrite(report, user);

    const row = await this.prisma.eventReportAttachment.findFirst({
      where: { id: attachmentId, reportId },
    });
    if (!row) throw new NotFoundException(`Attachment ${attachmentId} not found`);

    await this.prisma.eventReportAttachment.delete({ where: { id: attachmentId } });
    await this.storage.remove(row.storageKey).catch(() => undefined);

    return { id: attachmentId };
  }
}
