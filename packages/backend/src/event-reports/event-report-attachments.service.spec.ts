import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MAX_ATTACHMENTS_PER_REPORT, UserRole } from '@redinfo/shared';
import {
  EventReportAttachmentsService,
  UploadedAttachment,
} from './event-report-attachments.service';
import { EventReportsService, RequestUser } from './event-reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentStorage } from '../storage/attachment-storage';

// ── Photographs and paperwork ──────────────────────────────────────────────────
//
// Attachments arrive one at a time, often long after the report was saved, so
// they have their own lifecycle. The rules worth pinning down: the same people
// who may change a report may attach to it, and neither half of "row plus
// bytes" is ever left behind on its own.

const CREW: RequestUser = { id: 'user-tiago', roles: [UserRole.EMERGENCY_OPERATIONAL] };
const OUTSIDER: RequestUser = { id: 'user-outsider', roles: [UserRole.EMERGENCY_OPERATIONAL] };
const COORDINATOR: RequestUser = { id: 'user-ana', roles: [UserRole.EMERGENCY_COORDINATOR] };

const file = (overrides: Partial<UploadedAttachment> = {}): UploadedAttachment => ({
  originalname: 'foto.jpg',
  mimetype: 'image/jpeg',
  size: 2048,
  buffer: Buffer.from('bytes'),
  ...overrides,
});

/** Storage in a Map, so no test writes a photograph into the repository. */
class MemoryStorage implements AttachmentStorage {
  readonly files = new Map<string, Buffer>();
  private counter = 0;
  /** Set to make the next `save` blow up, for the rollback test. */
  failNextSave = false;

  async save(reportId: string, filename: string, data: Buffer): Promise<string> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error('disk full');
    }
    const key = `${reportId}/${(this.counter += 1)}`;
    this.files.set(key, data);
    return key;
  }

  async read(storageKey: string): Promise<Buffer> {
    const found = this.files.get(storageKey);
    if (!found) throw new Error(`no such key ${storageKey}`);
    return found;
  }

  async remove(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }
}

const attachmentRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'att-1',
  reportId: 'rep-1',
  filename: 'foto.jpg',
  mimeType: 'image/jpeg',
  byteSize: 2048,
  storageKey: 'rep-1/1',
  uploadedById: CREW.id,
  uploadedBy: { id: CREW.id, firstName: 'Tiago', lastName: 'Lourenço' },
  createdAt: new Date('2026-08-22T22:20:00.000Z'),
  ...overrides,
});

function makeService(options: { existing?: number; createThrows?: boolean } = {}) {
  const storage = new MemoryStorage();

  const prisma = {
    eventReportAttachment: {
      findMany: jest.fn(() => Promise.resolve([attachmentRow()])),
      findFirst: jest.fn(() => Promise.resolve(attachmentRow())),
      count: jest.fn(() => Promise.resolve(options.existing ?? 0)),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        options.createThrows
          ? Promise.reject(new Error('constraint violated'))
          : Promise.resolve(attachmentRow(args.data)),
      ),
      delete: jest.fn(() => Promise.resolve(attachmentRow())),
    },
  } as unknown as PrismaService;

  // The report service is exercised on its own elsewhere; here it is only the
  // gatekeeper, so it is stubbed down to the two decisions it makes.
  const reports = {
    loadRow: jest.fn((id: string) => {
      if (id === 'rep-gone') return Promise.reject(new NotFoundException('gone'));
      return Promise.resolve({ id, createdById: 'user-filer', crew: [{ userId: CREW.id }] });
    }),
    assertCanRead: jest.fn((_row: unknown, user: RequestUser) => {
      if (user.id === OUTSIDER.id) throw new ForbiddenException('no');
    }),
    assertCanWrite: jest.fn((_row: unknown, user: RequestUser) => {
      if (user.id === OUTSIDER.id) throw new ForbiddenException('no');
    }),
  } as unknown as EventReportsService;

  return {
    service: new EventReportAttachmentsService(prisma, reports, storage),
    prisma,
    reports,
    storage,
  };
}

describe('listing attachments', () => {
  it('is allowed to anyone who may read the report', async () => {
    const { service } = makeService();
    await expect(service.list('rep-1', CREW)).resolves.toHaveLength(1);
  });

  it('is refused to anyone who may not', async () => {
    const { service } = makeService();
    await expect(service.list('rep-1', OUTSIDER)).rejects.toThrow(ForbiddenException);
  });

  it('is 404 for a report that does not exist', async () => {
    const { service } = makeService();
    await expect(service.list('rep-gone', COORDINATOR)).rejects.toThrow(NotFoundException);
  });
});

describe('adding an attachment', () => {
  it('stores the bytes and records the row', async () => {
    const { service, storage, prisma } = makeService();

    const result = await service.add('rep-1', file(), CREW);

    expect(storage.files.size).toBe(1);
    expect(prisma.eventReportAttachment.create).toHaveBeenCalled();
    expect(result).toMatchObject({ filename: 'foto.jpg', mimeType: 'image/jpeg' });
  });

  it('records who uploaded it, not who the report belongs to', async () => {
    const { service, prisma } = makeService();

    await service.add('rep-1', file(), COORDINATOR);

    expect(prisma.eventReportAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ uploadedById: COORDINATOR.id }),
      }),
    );
  });

  it('needs write access, not merely read access', async () => {
    const { service, storage } = makeService();

    await expect(service.add('rep-1', file(), OUTSIDER)).rejects.toThrow(ForbiddenException);
    expect(storage.files.size).toBe(0);
  });

  it('refuses a kind of file that has no business on a report', async () => {
    const { service, storage } = makeService();

    await expect(
      service.add('rep-1', file({ mimetype: 'text/html', originalname: 'x.html' }), CREW),
    ).rejects.toThrow(BadRequestException);
    expect(storage.files.size).toBe(0);
  });

  it('refuses one past the per-report cap', async () => {
    const { service, storage } = makeService({ existing: MAX_ATTACHMENTS_PER_REPORT });

    await expect(service.add('rep-1', file(), CREW)).rejects.toThrow(
      new RegExp(`${MAX_ATTACHMENTS_PER_REPORT}`),
    );
    expect(storage.files.size).toBe(0);
  });

  it('leaves no orphaned bytes when the row cannot be written', async () => {
    const { service, storage } = makeService({ createThrows: true });

    await expect(service.add('rep-1', file(), CREW)).rejects.toThrow('constraint violated');
    expect(storage.files.size).toBe(0);
  });

  it('does not record a row when the bytes could not be stored', async () => {
    const { service, storage, prisma } = makeService();
    storage.failNextSave = true;

    await expect(service.add('rep-1', file(), CREW)).rejects.toThrow('disk full');
    expect(prisma.eventReportAttachment.create).not.toHaveBeenCalled();
  });
});

describe('downloading an attachment', () => {
  it('hands back the stored bytes with the original name', async () => {
    const { service, storage } = makeService();
    storage.files.set('rep-1/1', Buffer.from('a photograph'));

    await expect(service.download('rep-1', 'att-1', CREW)).resolves.toEqual({
      filename: 'foto.jpg',
      mimeType: 'image/jpeg',
      data: Buffer.from('a photograph'),
    });
  });

  it('is refused to someone who may not read the report', async () => {
    const { service } = makeService();
    await expect(service.download('rep-1', 'att-1', OUTSIDER)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('will not serve an attachment belonging to another report', async () => {
    const { service, prisma } = makeService();
    // The row lookup is scoped by both ids, so a mismatch is simply not found.
    (prisma.eventReportAttachment.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await expect(service.download('rep-1', 'att-elsewhere', CREW)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('removing an attachment', () => {
  it('removes the row and the bytes', async () => {
    const { service, storage, prisma } = makeService();
    storage.files.set('rep-1/1', Buffer.from('x'));

    await expect(service.remove('rep-1', 'att-1', CREW)).resolves.toEqual({ id: 'att-1' });
    expect(prisma.eventReportAttachment.delete).toHaveBeenCalledWith({
      where: { id: 'att-1' },
    });
    expect(storage.files.size).toBe(0);
  });

  it('still removes the row when the bytes are already gone', async () => {
    // A file lost to a botched restore must not make the row un-deletable.
    const { service, prisma } = makeService();

    await expect(service.remove('rep-1', 'att-1', CREW)).resolves.toEqual({ id: 'att-1' });
    expect(prisma.eventReportAttachment.delete).toHaveBeenCalled();
  });

  it('needs write access', async () => {
    const { service, prisma } = makeService();

    await expect(service.remove('rep-1', 'att-1', OUTSIDER)).rejects.toThrow(ForbiddenException);
    expect(prisma.eventReportAttachment.delete).not.toHaveBeenCalled();
  });
});
