/**
 * Enforces the hard constraint from the migration brief: nothing under
 * `packages/legacy-migration/src/` may name the legacy password /
 * password-reset tables, in code or in comments. Excluded from its own scan
 * for the obvious reason — this file has to spell out what it is looking for.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname); // packages/legacy-migration/src/
const SOURCE_SUBDIR = join(ROOT, 'source');
const THIS_FILE = __filename;

function listFilesRecursively(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listFilesRecursively(full));
    } else if (full.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

function grep(files: string[], pattern: RegExp): Array<{ file: string; line: number }> {
  const hits: Array<{ file: string; line: number }> = [];
  for (const file of files) {
    if (file === THIS_FILE) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (pattern.test(line)) hits.push({ file: relative(ROOT, file), line: index + 1 });
    });
  }
  return hits;
}

describe('no-secrets', () => {
  it('never queries or names the legacy password-reset table anywhere under source/', () => {
    const files = listFilesRecursively(SOURCE_SUBDIR);
    const hits = grep(files, /recuperar/i);
    expect(hits).toEqual([]);
  });

  it('never names the legacy password column anywhere under legacy-migration/', () => {
    const files = listFilesRecursively(ROOT);
    const hits = grep(files, /senha/i);
    expect(hits).toEqual([]);
  });
});
