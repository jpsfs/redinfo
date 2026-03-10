#!/usr/bin/env node
const { spawnSync } = require('child_process');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  if (r.status !== 0) process.exit(r.status);
}

console.log('Running pnpm install...');
run('pnpm', ['install']);

console.log('Generating Prisma client for backend...');
run('pnpm', ['--filter', 'backend', 'prisma:generate']);

console.log('Running non-interactive migrations (prisma migrate deploy)...');
run('pnpm', ['--filter', 'backend', 'prisma:migrate:deploy']);

if (process.env.SEED_ON_SETUP === 'true') {
  console.log('Seeding database (SEED_ON_SETUP=true)...');
  run('pnpm', ['--filter', 'backend', 'prisma:seed']);
}

console.log('Building workspace...');
run('pnpm', ['build']);

console.log('Setup complete.');
