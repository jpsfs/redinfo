#!/usr/bin/env node
const fs = require('fs');
const path = process.env.GITHUB_EVENT_PATH || process.argv[2];
if (!path) {
  console.error('GITHUB_EVENT_PATH not provided. This script expects to run in GitHub Actions on pull_request.');
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(path, 'utf8'));
} catch (e) {
  console.error('Failed to read or parse event payload:', e.message);
  process.exit(1);
}

const body = (payload.pull_request && payload.pull_request.body) || '';
const required = [
  '## Implementation Screenshots',
  '.github/UI-UX-GUIDELINES.md',
  'Unit tests:',
  'Integration tests:',
  'End-to-end tests:',
  'README impact'
];

const missing = required.filter((r) => !body.includes(r));
if (missing.length) {
  console.error('Policy check failed. Missing required PR sections:');
  missing.forEach((m) => console.error('- ' + m));
  console.error('\nPlease update the PR description to include required sections per .github/PULL_REQUEST_TEMPLATE.md');
  process.exit(1);
}

console.log('Policy check passed.');
process.exit(0);
