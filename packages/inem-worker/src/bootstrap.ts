#!/usr/bin/env ts-node
/**
 * The bootstrap script (#215's brief, step 3): **run by a human, once, from
 * a local machine — never in the deployed container.** Cannot be automated
 * or tested unattended, so this file has no `.spec.ts` counterpart; it
 * launches Playwright *headed*, waits for a person to sign in to OWA as
 * `campo.coor@cruzvermelha.org.pt`, complete MFA, and tick "Stay signed in",
 * then posts the resulting `storageState` to the backend
 * (`POST /internal/inem/owa-session`), which seals and stores it.
 *
 * After this runs, the poll-loop worker never sees an MFA prompt — until
 * OWA's session eventually needs re-authentication (a password change, a
 * revoked session, a long enough gap that the sliding window lapses), at
 * which point `readOtpFromOwa` returns `owa_session_expired` and this script
 * needs running again.
 *
 * Run with `pnpm --filter @redinfo/inem-worker bootstrap`. Needs a real
 * display (X server / Wayland, or a remote desktop) — it will not work
 * inside a headless CI runner or this package's own Docker image.
 */
import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright';
import { HttpBackendClient } from './backend-client';
import { loadConfig } from './config';
import { consoleLogger } from './logger';

const OWA_URL = 'https://outlook.office.com/mail/';

async function main(): Promise<void> {
  const config = loadConfig();
  const backend = new HttpBackendClient(config.backendUrl, config.workerToken);
  const log = consoleLogger;

  log.info('launching a headed browser');
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(OWA_URL);

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question(
      'Sign in as campo.coor@cruzvermelha.org.pt, complete MFA, tick "Stay signed in", and wait for the inbox to load.\n' +
        'Press Enter here once done... ',
    );
    rl.close();

    const storageState = await context.storageState();
    log.info('captured storageState — posting it to the backend (never logging its contents)');
    await backend.bootstrapOwaSession(storageState);
    log.info('done — the poll-loop worker can now read OTP mail without a human present');
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
