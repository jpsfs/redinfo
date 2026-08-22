import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';

/** Injection token, so a test can swap the disk for memory. */
export const ATTACHMENT_STORAGE = 'ATTACHMENT_STORAGE';

export interface AttachmentStorage {
  /**
   * Stores the bytes and returns the key they can be read back with. The key
   * is generated here, never derived from the uploader's filename — a name
   * from a phone is display text, not a path.
   */
  save(reportId: string, filename: string, data: Buffer): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  /** Idempotent: removing a key that is already gone is not an error. */
  remove(storageKey: string): Promise<void>;
}

/**
 * A storage key is `<reportId>/<uuid><ext>` and nothing else.
 *
 * Checked on the way out of the database as well as on the way in. The keys we
 * write are safe by construction, but a path assembled from a database value is
 * exactly the kind of thing that becomes unsafe three refactors later, and the
 * cost of saying so here is one regex.
 */
const SAFE_KEY = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(\.[A-Za-z0-9]{1,8})?$/;

export function assertSafeStorageKey(storageKey: string): string {
  if (!SAFE_KEY.test(storageKey) || storageKey.includes('..')) {
    throw new Error(`Refusing to touch an unsafe storage key: "${storageKey}"`);
  }
  return storageKey;
}

/**
 * Extension of the uploader's filename, lowercased, or none.
 *
 * Kept only so a downloaded file opens in the right application. It never
 * decides what the file *is* — the stored MIME type does that.
 */
export function safeExtension(filename: string): string {
  const raw = extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(raw) ? raw : '';
}

/**
 * Attachments on the local filesystem, under one root.
 *
 * Bytes stay out of Postgres so the reports table stays cheap to query, and out
 * of the application image so a redeploy does not lose a crew's photographs —
 * the root is a mounted volume in every environment that matters.
 */
@Injectable()
export class DiskAttachmentStorage implements AttachmentStorage {
  private readonly root: string;

  constructor(root = process.env.ATTACHMENTS_DIR ?? './uploads') {
    this.root = resolve(root);
  }

  async save(reportId: string, filename: string, data: Buffer): Promise<string> {
    const storageKey = assertSafeStorageKey(
      `${reportId}/${randomUUID()}${safeExtension(filename)}`,
    );
    const target = this.pathFor(storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    return storageKey;
  }

  /**
   * `async` so a bad key comes back as a rejection rather than a synchronous
   * throw from a promise-returning method — a caller reaching for `.catch()`
   * would otherwise miss it entirely.
   */
  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.pathFor(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.pathFor(storageKey), { force: true });
  }

  /** Resolved and re-checked: nothing may resolve outside the root. */
  private pathFor(storageKey: string): string {
    const target = resolve(join(this.root, assertSafeStorageKey(storageKey)));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new Error(`Refusing to touch a path outside the attachment root: "${storageKey}"`);
    }
    return target;
  }
}
