# UI / Branding — Overall Look & Feel (Delegação de Campo)

Source: Work Item 158 (redinfo) — extracted and localized into repository.

Metadata
- Source Work Item: 158
- Extracted: 2026-03-10
- Extracted by: automation / repo maintainer

Goal
Provide a single, consistent, official visual identity for the web app used by Cruz Vermelha — Delegação de Campo — ensuring clarity, accessibility and fast recognition under stress (mobile and desktop).

Scope
- Global site theme
- Login screen
- Header / logo placement
- Primary color palette (official Red Cross red + supporting neutrals)
- Typography, spacing, buttons / inputs
- Mobile touch targets and accessibility baseline

Design Principles
- Modern, clean, flat (no gradients)
- High contrast and large readable typography
- Consistent use of red / white and neutral greys
- Prioritize legibility and touch targets (≥ 44×44 px)

Mandatory Acceptance Criteria (implementers must satisfy these before requesting sign-off)
1. Brand Colors: exact palette values (hex / Pantone) documented in `design-tokens` (or attached assets). Include CSS variables or a token file.
2. Login Screen: red-and-white layout; Red Cross emblem prominently visible; full-size Delegação de Campo logo used where applicable; controls readable and touch-friendly (min 44×44 px).
3. Header / Logo: compact Red Cross emblem in header; full Delegação de Campo logo on landing/dashboard when space allows.
4. Typography: font stack selected; base font-size ≥ 16px on mobile; headings scale for legibility under stress.
5. Contrast & Accessibility: UI meets WCAG AA contrast for primary content; keyboard focus states and ARIA semantics present for primary interactive components.
6. Visual Style: no gradients; flat colors; clear iconography; consistent spacing and corner radii; primary buttons use red, secondary use white/outlined styles.
7. Responsive: theme adapts across breakpoints; mobile prioritizes primary actions and reduces clutter.
8. Design Tokens: provide palette, spacing scale, typography scale, and component color tokens (CSS variables or JSON token file).
9. Assets: approved vector logos and color references must be attached to the implementation work item or included in the repo before release.
10. Sign-off: Product Owner and Brand Manager approval required for final palette, logo usage, and accessibility checks.

Implementation notes
- Prefer MUI theming and design tokens to keep styles consistent across React-Admin components.
- Avoid one-off inline styles; use token-driven variables and shared `shared` package exports for tokens/constants.
- Accessibility checks: include automated contrast checks in CI and manual keyboard focus verification in PR review.

Refresh / Sync policy
- This file is the canonical in-repo snapshot of Work Item 158. To refresh from ADO, follow the documented refresh workflow in `.github/AI-GOVERNANCE.md` and add a changelog entry.
