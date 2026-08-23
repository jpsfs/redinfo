import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { LiveRunIdentity } from '@redinfo/shared';

/**
 * Column encryption for the identity fields of a live run.
 *
 * A live run holds a victim's name, date of birth, SNS number and the street
 * they were found on — for at most 48 hours, and only so the crew can navigate
 * to them and fill in the paper form. Those fields exist nowhere else in this
 * system and must not become readable by anyone who gets a look at a database
 * dump, a backup or a replica.
 *
 * `node:crypto` rather than a dependency: it is already how `attachment-storage`
 * builds its keys, and AES-256-GCM is fifteen lines here.
 *
 * ## Wire format
 *
 * ```
 * byte 0        version (0x01)
 * byte 1        key-id length, in bytes
 * bytes 2..2+n  key id (ASCII)
 * next 12       IV, random per seal
 * next 16       GCM authentication tag
 * rest          ciphertext of JSON.stringify(payload)
 * AAD           `live-run:${runId}`
 * ```
 *
 * The key id travels with the blob so a key can be rotated without an
 * re-encryption pass: prepend a new key, restart, and old blobs still open.
 * Because every blob is destroyed within 48h of its run closing, the old key can
 * be dropped after one retention window — short retention and column encryption
 * pay for each other.
 *
 * **The AAD binds the blob to its row.** That matters more here than in an
 * ordinary encrypted column: `LiveRun` rows are keyed by *client-supplied* ids,
 * so "copy row A's blob into row B" is a reachable attack rather than a
 * theoretical one. Sealing against the run id makes it fail to open.
 */

const VERSION = 0x01;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Where the keys come from. Comma-separated `id:base64`; the first encrypts. */
export const IDENTITY_KEYS_ENV = 'IDENTITY_ENCRYPTION_KEYS';

export interface IdentityKey {
  id: string;
  key: Buffer;
}

/** Thrown for a blob this process cannot open, as distinct from a bad blob. */
export class UnknownIdentityKeyError extends Error {
  constructor(readonly keyId: string) {
    super(`No identity encryption key with id "${keyId}" is configured.`);
    this.name = 'UnknownIdentityKeyError';
  }
}

/**
 * Parses `IDENTITY_ENCRYPTION_KEYS`.
 *
 * Every failure here is a configuration mistake, and every one of them throws:
 * this runs at module init, so a bad key stops the process on deploy rather than
 * at the first emergency. `scripts/validate-env.js` checks the same format
 * earlier still, in CI.
 */
export function parseIdentityKeys(raw: string | undefined): IdentityKey[] {
  const entries = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new Error(
      `${IDENTITY_KEYS_ENV} must list at least one key as "id:base64" (32 bytes).`,
    );
  }

  const keys: IdentityKey[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    // Split on the *first* colon only: base64 never contains one, but a key id
    // conceivably could, and getting this wrong silently truncates a key.
    const separator = entry.indexOf(':');
    if (separator <= 0) {
      throw new Error(`${IDENTITY_KEYS_ENV} entry "${entry}" is not "id:base64".`);
    }
    const id = entry.slice(0, separator);
    const material = entry.slice(separator + 1);

    if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
      throw new Error(
        `${IDENTITY_KEYS_ENV} key id "${id}" may only contain letters, digits, "-", "_" and ".".`,
      );
    }
    if (seen.has(id)) {
      throw new Error(`${IDENTITY_KEYS_ENV} lists key id "${id}" twice.`);
    }
    seen.add(id);

    const key = Buffer.from(material, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `${IDENTITY_KEYS_ENV} key "${id}" must decode to exactly ${KEY_BYTES} bytes (got ${key.length}).`,
      );
    }
    keys.push({ id, key });
  }

  return keys;
}

/** Generates a key in the format the environment variable wants. */
export function generateIdentityKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}

@Injectable()
export class IdentityCipher {
  private readonly keys: IdentityKey[];

  constructor(raw: string | undefined = process.env[IDENTITY_KEYS_ENV]) {
    this.keys = parseIdentityKeys(raw);
  }

  /** The key new blobs are sealed with — the first one configured. */
  get activeKeyId(): string {
    return this.keys[0].id;
  }

  seal(runId: string, payload: LiveRunIdentity): Buffer {
    const { id, key } = this.keys[0];
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(runId));

    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);

    const keyId = Buffer.from(id, 'ascii');
    return Buffer.concat([
      Buffer.from([VERSION, keyId.length]),
      keyId,
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]);
  }

  /**
   * Opens a blob, or throws.
   *
   * Two failures are deliberately different types. A blob sealed with a key this
   * process does not have is `UnknownIdentityKeyError`, which the service turns
   * into `identityUnavailable: true` — a key retired an hour early must not take
   * the coordinator's board down. Anything else is tampering or corruption and
   * stays an error.
   */
  open(runId: string, blob: Buffer): LiveRunIdentity {
    if (blob.length < 2) throw new Error('Identity blob is truncated.');
    const version = blob[0];
    if (version !== VERSION) {
      throw new Error(`Unsupported identity blob version ${version}.`);
    }

    const keyIdLength = blob[1];
    const header = 2 + keyIdLength;
    if (blob.length < header + IV_BYTES + TAG_BYTES) {
      throw new Error('Identity blob is truncated.');
    }

    const keyId = blob.subarray(2, header).toString('ascii');
    const found = this.keys.find((candidate) => candidate.id === keyId);
    if (!found) throw new UnknownIdentityKeyError(keyId);

    const iv = blob.subarray(header, header + IV_BYTES);
    const tag = blob.subarray(header + IV_BYTES, header + IV_BYTES + TAG_BYTES);
    const ciphertext = blob.subarray(header + IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv('aes-256-gcm', found.key, iv);
    decipher.setAAD(aad(runId));
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as LiveRunIdentity;
  }
}

/**
 * The additional authenticated data one blob is bound to.
 *
 * Prefixed rather than being the bare id, so the same construction can bind a
 * future encrypted column to a different kind of row without two blobs ever
 * being interchangeable.
 */
function aad(runId: string): Buffer {
  return Buffer.from(`live-run:${runId}`, 'utf8');
}
