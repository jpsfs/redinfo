#!/usr/bin/env node
const required = [
  'DATABASE_URL',
  'JWT_SECRET'
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Missing required env vars:', missing.join(', '));
  process.exit(1);
}

console.log('Environment validation passed.');
process.exit(0);
