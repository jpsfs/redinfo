# `@redinfo/inem-worker`

Stateless Playwright session-minter for the INEM `portalpem.inem.pt` integration
(ADO Feature #211, this package is #215). Polls `packages/backend`'s
`/internal/inem/login-jobs` for cold-login work, drives the FortiAuthenticator +
OTP + SAML flow described in `docs/inem-portal-contract.md`, and reads the OTP
from an already-bootstrapped Outlook Web Access (OWA) session.

**Stateless by design.** No Prisma client, no `DATABASE_URL`, no
`IDENTITY_ENCRYPTION_KEYS`. The backend (`packages/backend/src/inem/`) owns all
persistence, encryption, reconciliation and audit — this package's whole job is
to receive an OWA `storageState` in a job payload, do the login, and hand back
`{ cookies, expiresAt, refreshedStorageState }` or a typed failure. That
statelessness is also what keeps OWA's sliding-window cookie safe: "write the
state back after every use" is the *only* thing this package's contract lets a
future change do, not something that can quietly get dropped.

It also keeps Chromium (~400MB) out of the backend's image — see `Dockerfile`.

## When this actually runs

Narrower than it first looks. `packages/backend/src/inem/inem-session.service.ts`
handles the cheap case itself — a plain HTTP SAML replay, no browser, no
password, no OTP — whenever the IdP session (`samlsessionid`) is still alive.
This worker is the fallback for the one case that needs a real password + OTP
login: `samlsessionid` itself has died. Expect it to run a few times a day at
most; it is not designed to be hot.

## Local development

```bash
pnpm --filter @redinfo/inem-worker typecheck
pnpm --filter @redinfo/inem-worker test
```

To actually run the poll loop locally, set `BACKEND_URL`, `INEM_WORKER_TOKEN`,
`INEM_USERNAME`, `INEM_PASSWORD` (and optionally `INEM_BASE_URL`,
`INEM_WORKER_POLL_INTERVAL_MS`) and run `pnpm --filter @redinfo/inem-worker
start` — or `docker compose --profile inem-worker up inem-worker` from the repo
root. It will sit idle until the backend actually hands out a `LOGGING_IN` job
(i.e. until `samlsessionid` has actually died), and it can do nothing useful
until the OWA session has been bootstrapped once (see below).

## The bootstrap script — run by a human, once

**This step cannot be automated or tested unattended.** `src/bootstrap.ts`
launches Playwright *headed* (a real, visible browser window — it needs a
display, so it will not run inside this package's own Docker image or a CI
runner):

```bash
pnpm --filter @redinfo/inem-worker bootstrap
```

A person then:

1. Signs in to the OWA window that opens, as `campo.coor@cruzvermelha.org.pt`.
2. Completes MFA.
3. Ticks **"Stay signed in"**.
4. Waits for the inbox to load, then presses Enter in the terminal.

The script calls `context.storageState()` and posts the JSON to the backend
(`POST /internal/inem/owa-session`), which seals it with `IdentityCipher` and
stores it as `OWASession`. After that, the poll-loop worker never sees an MFA
prompt.

**Re-run this whenever `readOtpFromOwa` starts returning `owa_session_expired`**
— visible as `OWASessionStatus.EXPIRED` on the backend, or in
`InemSessionService`'s `lastError` ("OWA session is not active — run the #215
bootstrap script"). Recovery is re-running the script, not retrying; nothing
in this package or the backend attempts to refresh a dead OWA session on its
own.

## What's confirmed vs. best-effort

`src/inem-forms.ts` and `src/otp-mail.ts` implement rules confirmed against a
real traffic capture (see `docs/inem-portal-contract.md` and #215's ADO
description) and are unit-tested against literal HTML/data fixtures.

`src/owa-reader.ts`'s DOM selectors for OWA's own message list are **not**
confirmed against a real OWA capture — no equivalent of `docs/inem-portal-contract.md`
exists for OWA yet. Re-verify (and tighten) that file's selectors against a
real session before leaning on it in production; see the file's own doc
comment for what's assumed.

## No live traffic in tests or CI

Every `.spec.ts` in this package runs against literal fixtures — no network
call, no real browser, no live INEM or OWA traffic. `src/login-flow.ts` and
`src/owa-reader.ts` are Playwright-driving glue around the unit-tested pure
functions in `inem-forms.ts`/`otp-mail.ts`, not something this package attempts
to exercise end-to-end outside a real environment.

## Logging

Never log a cookie value, a `SAMLResponse`, the shared credential, the OTP, or
a `storageState` — log step names and status/error shapes only, matching
`docs/inem-portal-contract.md`'s "Logging" section. `src/no-secrets.spec.ts`
guards the obvious version of this mistake (a log call that interpolates one
of those identifiers).

## Deployment

`Dockerfile` builds the poll-loop image; `deploy/redinfo/templates/deployment-worker.yaml`
runs it at a fixed `replicas: 1` (the shared INEM/OWA credential and the
backend's single-flight advisory lock assume exactly one worker polling),
gated on `inemWorker.enabled` — off everywhere except production. A Compose
service (`inem-worker`, profile-gated) exists for local end-to-end rehearsal;
see `docker-compose.yml`.
