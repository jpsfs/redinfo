#!/usr/bin/env node
const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  // Live emergency mode seals a victim's name, date of birth, SNS number and
  // the street they were found on into one AES-256-GCM column. Without a key
  // the module refuses to start, so this fails here — in CI — rather than on a
  // deploy that then cannot serve an emergency.
  'IDENTITY_ENCRYPTION_KEYS'
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Missing required env vars:', missing.join(', '));
  process.exit(1);
}

/**
 * `IDENTITY_ENCRYPTION_KEYS` is comma-separated `id:base64`; the first key
 * encrypts and all of them decrypt, which is what makes rotation a restart
 * rather than a re-encryption pass.
 *
 * Checked here as well as in `IdentityCipher`'s constructor because the failure
 * modes are different: a key that decodes to 16 bytes is a plausible-looking
 * value that only fails at the first emergency, and this is the cheapest place
 * to catch it. Kept as a hand-rolled check rather than importing the parser —
 * this script runs with no build step and no workspace resolution.
 */
const identityKeys = process.env.IDENTITY_ENCRYPTION_KEYS.split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

if (identityKeys.length === 0) {
  console.error('IDENTITY_ENCRYPTION_KEYS must list at least one "id:base64" key.');
  process.exit(1);
}

const seen = new Set();
for (const entry of identityKeys) {
  const separator = entry.indexOf(':');
  if (separator <= 0) {
    console.error(`IDENTITY_ENCRYPTION_KEYS entry "${entry}" is not "id:base64".`);
    process.exit(1);
  }
  const id = entry.slice(0, separator);
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
    console.error(`IDENTITY_ENCRYPTION_KEYS key id "${id}" has characters the blob cannot carry.`);
    process.exit(1);
  }
  if (seen.has(id)) {
    console.error(`IDENTITY_ENCRYPTION_KEYS lists key id "${id}" twice.`);
    process.exit(1);
  }
  seen.add(id);

  const bytes = Buffer.from(entry.slice(separator + 1), 'base64').length;
  if (bytes !== 32) {
    console.error(
      `IDENTITY_ENCRYPTION_KEYS key "${id}" must decode to exactly 32 bytes (got ${bytes}).`
    );
    process.exit(1);
  }
}

// A Maps key is optional: with none configured, a report simply reads
// "por calcular" until someone adds one. It must never be a VITE_* variable —
// a key in the browser bundle is scraped and billed to us within days.
if (process.env.VITE_GOOGLE_MAPS_API_KEY) {
  console.error(
    'VITE_GOOGLE_MAPS_API_KEY is set. The Maps key is backend-only; a VITE_ prefix ships it in the browser bundle.'
  );
  process.exit(1);
}

console.log('Environment validation passed.');
process.exit(0);
