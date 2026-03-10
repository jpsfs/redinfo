# AI Governance — Merge gates and policy

Scope
This document summarizes mandatory repository policies enforced for AI-assisted and manual contributions.

Mandatory rules
1. Every PR opened via the web coding agent must include at least one implementation screenshot (see `.github/PULL_REQUEST_TEMPLATE.md`).
2. All UI-affecting changes must declare compliance with `.github/UI-UX-GUIDELINES.md`.
3. Every feature must include unit, integration, and end-to-end tests that validate user story acceptance criteria.
4. Significant changes must include README updates or a documented deferred-docs justification.
5. Agents must use in-repo policy docs as the primary source of truth. Live ADO lookups are maintenance-only and require a documented refresh.

Enforcement
- PR template is the first line of defense. Reviewers must verify evidence before approving.
- CI policy checks should validate presence of required PR metadata (screenshots, UI/UX reference, tests). Initial rollout uses warnings; after two pilot sprints these checks should be upgraded to blockers.

Refresh workflow for localized ADO work items
1. A maintainer may refresh a localized Work Item (e.g., Work Item 158) by running the documented retrieval procedure and submitting a dedicated PR that updates the localized file and changelog.
2. The refresh PR must reference the ADO work item revision and include a short diff summary and reviewer sign-off.

Exceptions
- Exceptions to UI/UX standards require explicit documented approval from Product Owner and Brand Manager; include the approval artifact in the PR.
