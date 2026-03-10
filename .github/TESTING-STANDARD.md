# Testing Standard — Story-driven test triad

Purpose
This document defines the mandatory testing approach for features: unit, integration, and end-to-end tests that validate user story acceptance criteria (behavior/outcome focused).

Principles
- Tests must validate user-facing outcomes or domain/business rules described in the user story acceptance criteria.
- Avoid tests that only assert private implementation details.
- Each feature must provide at least one test in each layer: Unit, Integration, and End-to-End (E2E).

Layer definitions
- Unit tests: fast, isolated tests for functions and small classes validating business logic. Run in CI as fast checks.
- Integration tests: validate interactions between modules (e.g., API routes + database, service + repository). Use a test database or mocks configured for deterministic results.
- End-to-end tests: simulate real user journeys. Use Playwright or Cypress (team decision). E2E should run against a reproducible staging environment or local compose setup.

Evidence in PRs
- For each test layer include:
  - Test files changed/added
  - Command to run the tests
  - Which acceptance criteria the tests validate (mapping)

Sample commands
Run unit tests (backend):

```
pnpm --filter backend test
```

Run integration tests (example pattern):

```
pnpm --filter backend test -- -t "integration"
```

Run e2e tests (example using Playwright):

```
pnpm --filter frontend test:e2e
```

Anti-patterns
- Writing only snapshot or structural tests that do not map back to acceptance criteria.
- Marking implementation TODOs as tests.

Enforcement
- PR template requires test triad mapping to acceptance criteria. Reviewers must block merges when mappings are missing or insufficient.
