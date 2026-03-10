Title: Sample pilot — Add themed login screen (web-agent PR)

Work Item: redinfo/158

## Summary
This is a pilot PR demonstrating the required PR metadata and evidence for web coding agent contributions.

## Implementation Screenshots
Attach images showing the new login screen and the loading/error edge states.

- Screenshot 1: (attach image) — Login screen with emblem and primary action
- Screenshot 2: (attach image) — Empty/error state or mobile layout

## UI/UX Compliance
UI/UX standard referenced: `.github/UI-UX-GUIDELINES.md`
Compliance status: Compliant

## Tests
Unit tests:
- `packages/backend/src/auth/auth.service.spec.ts` — validates login business rules
Command: `pnpm --filter backend test`

Integration tests:
- `packages/backend/test/auth.integration.spec.ts` — login flow with test DB
Command: `pnpm --filter backend test -- -t "integration"`

End-to-end tests:
- `packages/frontend/e2e/login.spec.ts` — user can login and reach dashboard
Command: `pnpm --filter frontend test:e2e`

## README impact
README impact: Yes
Files to update: `README.md` — add note about new branding and login behavior

## Checklist
- [ ] Screenshots attached
- [ ] UI/UX compliance declared
- [ ] Tests added and evidence provided
- [ ] README impact evaluated

Notes:
This file is a demonstration. For real PRs attach image files and real test run outputs.
