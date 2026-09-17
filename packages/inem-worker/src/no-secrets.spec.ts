/**
 * Enforces docs/inem-portal-contract.md's "Logging" rule at the code level:
 * never log a cookie value, a `SAMLResponse`, the shared credential, the
 * OTP, or a `storageState`. A log call that interpolates one of those
 * identifiers is exactly the mistake this guards against — every real call
 * site in this package passes a literal string. Excluded from its own scan
 * for the obvious reason: this file has to name what it's looking for.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname);
const THIS_FILE = __filename;

const LOG_CALL = /\b(log\.(info|warn|error)|console\.(log|warn|error))\(/;
const FORBIDDEN_INTERPOLATION = /\$\{[^}]*\b(password|storageState|cookies|token_code|samlResponse|SAMLResponse|alAuth|otp)\b[^}]*\}/i;

function listFilesRecursively(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listFilesRecursively(full));
    } else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('no-secrets', () => {
  it('never interpolates a credential/cookie/OTP/storageState value into a log call', () => {
    const files = listFilesRecursively(ROOT).filter((f) => f !== THIS_FILE);
    const hits: Array<{ file: string; line: number; text: string }> = [];

    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (LOG_CALL.test(line) && FORBIDDEN_INTERPOLATION.test(line)) {
            hits.push({ file: relative(ROOT, file), line: index + 1, text: line.trim() });
          }
        });
    }

    expect(hits).toEqual([]);
  });
});
