import { randomBytes } from 'node:crypto';
import { LiveRunIdentity } from '@redinfo/shared';
import {
  IdentityCipher,
  UnknownIdentityKeyError,
  generateIdentityKey,
  parseIdentityKeys,
} from './identity-cipher';

/**
 * The identity blob is the one place in this system where a victim's name is
 * written down, so these tests are about the properties that make that
 * acceptable rather than about round-tripping a value.
 */

const KEY_A = randomBytes(32).toString('base64');
const KEY_B = randomBytes(32).toString('base64');

const identity: LiveRunIdentity = {
  victimName: 'Maria de Jesus Ferreira',
  victimDateOfBirth: '1948-03-17',
  victimSnsNumber: '123456789',
  occurrenceAddress: 'R. Dr. Manuel Rodrigues nº 12, 3º Esq.',
  referencePoints: 'porta azul ao lado do café',
  victimHomeAddress: null,
};

describe('parseIdentityKeys', () => {
  it('reads a list of id:base64 pairs, first one first', () => {
    const keys = parseIdentityKeys(`new:${KEY_B}, old:${KEY_A}`);
    expect(keys.map((entry) => entry.id)).toEqual(['new', 'old']);
    expect(keys[0].key).toHaveLength(32);
  });

  it('refuses a key that is not 32 bytes', () => {
    const short = randomBytes(16).toString('base64');
    expect(() => parseIdentityKeys(`k1:${short}`)).toThrow(/32 bytes/);
  });

  it('refuses an empty configuration rather than running without encryption', () => {
    expect(() => parseIdentityKeys(undefined)).toThrow(/at least one key/);
    expect(() => parseIdentityKeys('   ')).toThrow(/at least one key/);
  });

  it('refuses an entry with no key id', () => {
    expect(() => parseIdentityKeys(KEY_A)).toThrow(/not "id:base64"/);
    expect(() => parseIdentityKeys(`:${KEY_A}`)).toThrow(/not "id:base64"/);
  });

  it('refuses two keys sharing an id, which would make rotation ambiguous', () => {
    expect(() => parseIdentityKeys(`k1:${KEY_A},k1:${KEY_B}`)).toThrow(/twice/);
  });

  it('refuses a key id that could not survive a round trip through the blob', () => {
    expect(() => parseIdentityKeys(`chave nº1:${KEY_A}`)).toThrow(/may only contain/);
  });

  it('generates keys in the format it accepts', () => {
    expect(parseIdentityKeys(`k1:${generateIdentityKey()}`)).toHaveLength(1);
  });
});

describe('IdentityCipher', () => {
  const cipher = new IdentityCipher(`k1:${KEY_A}`);

  it('seals and opens a payload', () => {
    const blob = cipher.seal('run-1', identity);
    expect(cipher.open('run-1', blob)).toEqual(identity);
  });

  it('never writes the plaintext into the blob', () => {
    const blob = cipher.seal('run-1', identity);
    expect(blob.toString('latin1')).not.toContain('Maria');
    expect(blob.toString('latin1')).not.toContain('123456789');
    expect(blob.toString('latin1')).not.toContain('Manuel Rodrigues');
  });

  it('produces a different blob every time, because the IV is random', () => {
    const first = cipher.seal('run-1', identity);
    const second = cipher.seal('run-1', identity);
    expect(first.equals(second)).toBe(false);
    expect(cipher.open('run-1', second)).toEqual(identity);
  });

  it('refuses a blob whose tag has been altered', () => {
    const blob = cipher.seal('run-1', identity);
    // The tag sits after the version, the key-id length, the key id and the IV.
    const tagStart = 2 + blob[1] + 12;
    blob[tagStart] ^= 0xff;
    expect(() => cipher.open('run-1', blob)).toThrow();
  });

  it('refuses a blob whose ciphertext has been altered', () => {
    const blob = cipher.seal('run-1', identity);
    blob[blob.length - 1] ^= 0xff;
    expect(() => cipher.open('run-1', blob)).toThrow();
  });

  // The AAD test. Rows are keyed by client-supplied ids, so moving one row's
  // blob onto another row is something a caller can attempt.
  it('refuses a blob sealed for a different run', () => {
    const blob = cipher.seal('run-A', identity);
    expect(() => cipher.open('run-B', blob)).toThrow();
  });

  it('refuses a truncated blob rather than reading past the end', () => {
    const blob = cipher.seal('run-1', identity);
    expect(() => cipher.open('run-1', blob.subarray(0, 10))).toThrow(/truncated/);
    expect(() => cipher.open('run-1', Buffer.alloc(0))).toThrow(/truncated/);
  });

  it('refuses a blob from a future format version', () => {
    const blob = cipher.seal('run-1', identity);
    blob[0] = 0x02;
    expect(() => cipher.open('run-1', blob)).toThrow(/version 2/);
  });

  describe('rotation', () => {
    it('opens old blobs with the old key while sealing with the new one', () => {
      const before = new IdentityCipher(`k1:${KEY_A}`);
      const sealed = before.seal('run-1', identity);

      const after = new IdentityCipher(`k2:${KEY_B},k1:${KEY_A}`);
      expect(after.activeKeyId).toBe('k2');
      expect(after.open('run-1', sealed)).toEqual(identity);

      // And what it seals now cannot be opened by the process it replaced.
      const resealed = after.seal('run-1', identity);
      expect(() => before.open('run-1', resealed)).toThrow(UnknownIdentityKeyError);
    });

    it('names the missing key, so a retired one is recognisable in a log', () => {
      const sealed = new IdentityCipher(`k1:${KEY_A}`).seal('run-1', identity);
      const other = new IdentityCipher(`k2:${KEY_B}`);
      expect(() => other.open('run-1', sealed)).toThrow(/"k1"/);
    });
  });
});
