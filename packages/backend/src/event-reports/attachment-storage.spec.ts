import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DiskAttachmentStorage,
  assertSafeStorageKey,
  safeExtension,
} from './attachment-storage';

// ── Where a crew's photographs land ────────────────────────────────────────────
//
// The storage key is the only place a user-supplied string gets near a
// filesystem path, so it is the only place worth being paranoid about.

describe('assertSafeStorageKey', () => {
  it('accepts the shape the storage itself generates', () => {
    expect(assertSafeStorageKey('rep-123/8f14e45f.jpg')).toBe('rep-123/8f14e45f.jpg');
    expect(assertSafeStorageKey('rep-123/8f14e45f')).toBe('rep-123/8f14e45f');
  });

  it('refuses traversal, absolute paths and extra segments', () => {
    for (const key of [
      '../etc/passwd',
      'rep-123/../../etc/passwd',
      '/etc/passwd',
      'rep-123/sub/dir.jpg',
      'rep-123',
      '',
      'rep-123/file name.jpg',
      'rep-123/file;rm -rf.jpg',
    ]) {
      expect(() => assertSafeStorageKey(key)).toThrow(/unsafe storage key/i);
    }
  });
});

describe('safeExtension', () => {
  it('keeps a plain extension, lowercased', () => {
    expect(safeExtension('FOTO.JPG')).toBe('.jpg');
    expect(safeExtension('guia-inem.pdf')).toBe('.pdf');
    expect(safeExtension('IMG_0042.HEIC')).toBe('.heic');
  });

  it('is empty when there is nothing usable', () => {
    expect(safeExtension('noextension')).toBe('');
    expect(safeExtension('trailing.')).toBe('');
    expect(safeExtension('.hidden')).toBe('');
    expect(safeExtension('weird.this-is-not-an-extension')).toBe('');
  });
});

describe('DiskAttachmentStorage', () => {
  let root: string;
  let storage: DiskAttachmentStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'redinfo-attachments-'));
    storage = new DiskAttachmentStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('round-trips bytes through a key it generated', async () => {
    const data = Buffer.from('a photograph, more or less');
    const key = await storage.save('rep-1', 'foto.jpg', data);

    expect(key).toMatch(/^rep-1\/[0-9a-f-]+\.jpg$/);
    await expect(storage.read(key)).resolves.toEqual(data);
  });

  it('never derives the path from the uploader’s filename', async () => {
    const key = await storage.save('rep-1', '../../escape.jpg', Buffer.from('x'));

    expect(key.startsWith('rep-1/')).toBe(true);
    expect(key).not.toContain('escape');
    expect(key).not.toContain('..');
  });

  it('gives two uploads of the same name two keys', async () => {
    const first = await storage.save('rep-1', 'foto.jpg', Buffer.from('one'));
    const second = await storage.save('rep-1', 'foto.jpg', Buffer.from('two'));

    expect(first).not.toBe(second);
    await expect(storage.read(first)).resolves.toEqual(Buffer.from('one'));
    await expect(storage.read(second)).resolves.toEqual(Buffer.from('two'));
  });

  it('removes a file, and does not mind removing it twice', async () => {
    const key = await storage.save('rep-1', 'foto.jpg', Buffer.from('x'));

    await storage.remove(key);
    await expect(storage.read(key)).rejects.toThrow();
    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it('refuses to read or remove anything outside its root', async () => {
    // The file exists, and is still off limits: the guard is about the shape of
    // the key, not about what happens to be on disk.
    await writeFile(join(root, 'secret.txt'), 'nope');

    await expect(storage.read('../secret.txt')).rejects.toThrow(/unsafe storage key/i);
    await expect(storage.remove('rep-1/../../secret.txt')).rejects.toThrow(
      /unsafe storage key/i,
    );
    await expect(readFile(join(root, 'secret.txt'), 'utf8')).resolves.toBe('nope');
  });
});
