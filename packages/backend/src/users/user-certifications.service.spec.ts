import { NotFoundException } from '@nestjs/common';
import { CertificationType } from '@redinfo/shared';
import { UserCertificationsService } from './user-certifications.service';
import { AttachmentStorage } from '../storage/attachment-storage';

// ── Removing a certification's document, keeping the record ───────────────────
//
// #182: `CertificationDialog` never offered a file picker — a document is
// attached from the certification's own row instead — and that row also needs
// a way to take one *off* without deleting the whole certification. Deleting
// the record already best-effort removes its file (see `remove`); this is the
// narrower "just the document" half of that.

class MemoryStorage implements AttachmentStorage {
  readonly files = new Map<string, Buffer>();
  removed: string[] = [];

  async save(prefix: string, filename: string, data: Buffer): Promise<string> {
    const key = `${prefix}/${filename}`;
    this.files.set(key, data);
    return key;
  }

  async read(storageKey: string): Promise<Buffer> {
    const found = this.files.get(storageKey);
    if (!found) throw new Error(`no such key ${storageKey}`);
    return found;
  }

  async remove(storageKey: string): Promise<void> {
    this.removed.push(storageKey);
    this.files.delete(storageKey);
  }
}

const certRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'cert-1',
  userId: 'u-1',
  type: CertificationType.TAT,
  validUntil: new Date('2029-01-01T00:00:00.000Z'),
  issuedOn: null,
  notes: null,
  filename: 'certificado.pdf',
  mimeType: 'application/pdf',
  byteSize: 2048,
  storageKey: 'certifications-u-1/certificado.pdf',
  createdById: 'u-coord',
  createdBy: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

function makeService(row = certRow()) {
  const storage = new MemoryStorage();
  storage.files.set(row.storageKey as string, Buffer.from('pdf bytes'));

  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: row.userId }) },
    userCertification: {
      findFirst: jest.fn().mockResolvedValue(row),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...row, ...args.data }),
      ),
    },
  };

  return { service: new UserCertificationsService(prisma as never, storage), prisma, storage };
}

describe('UserCertificationsService.removeDocument', () => {
  it('clears the document fields but keeps the certification record', async () => {
    const { service, prisma } = makeService();

    const result = await service.removeDocument('u-1', 'cert-1');

    expect(result.hasDocument).toBe(false);
    expect(result.filename).toBeNull();
    expect(prisma.userCertification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cert-1' },
        data: { filename: null, mimeType: null, byteSize: null, storageKey: null },
      }),
    );
  });

  it('removes the stored file, not just the row reference to it', async () => {
    const { service, storage } = makeService();

    await service.removeDocument('u-1', 'cert-1');

    expect(storage.removed).toEqual(['certifications-u-1/certificado.pdf']);
  });

  it('404s a certification that has no document to remove', async () => {
    const { service } = makeService(certRow({ storageKey: null, filename: null, mimeType: null, byteSize: null }));

    await expect(service.removeDocument('u-1', 'cert-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it("404s a certification that isn't this person's", async () => {
    const { service, prisma } = makeService();
    prisma.userCertification.findFirst.mockResolvedValue(null);

    await expect(service.removeDocument('someone-else', 'cert-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
