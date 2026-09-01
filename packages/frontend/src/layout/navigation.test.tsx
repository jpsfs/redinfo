import { describe, expect, it } from 'vitest';
import { Action, ROLE_PERMISSIONS, UserRole, hasPermission } from '@redinfo/shared';
import { NAV_SECTIONS } from './navigation';

/**
 * Pure — no rendering. This is the test that pins the navigation model down:
 * for a given role, which routes does `NAV_SECTIONS` resolve to? `AppLayout`
 * only has to walk the same manifest correctly, which `AppLayout.test.tsx`
 * checks separately.
 */
function visibleRoutes(roles: UserRole | UserRole[]): string[] {
  return NAV_SECTIONS.flatMap((section) => section.entries)
    .filter((entry) => !entry.requires || entry.requires.some((action) => hasPermission(roles, action)))
    .map((entry) => entry.to);
}

describe('NAV_SECTIONS', () => {
  it('every requires value is a real Action, and every route is unique', () => {
    const allActions = new Set(Object.values(Action));
    const allRoutes: string[] = [];

    for (const section of NAV_SECTIONS) {
      for (const entry of section.entries) {
        entry.requires?.forEach((action) => expect(allActions.has(action)).toBe(true));
        allRoutes.push(entry.to);
      }
    }

    expect(new Set(allRoutes).size).toBe(allRoutes.length);
  });

  it('gives an Emergency Operational exactly the field-crew entries', () => {
    expect(visibleRoutes(UserRole.EMERGENCY_OPERATIONAL)).toEqual([
      '/live',
      '/',
      '/my-availability',
      '/my-duties',
      '/my-hours',
      '/my-reports',
      '/my-notices',
      // The event-reports archive and the published schedule list are both
      // org-wide reading now — `VIEW_EVENT_REPORTS` is held by every role,
      // and `/schedules` carries no `requires` at all (see navigation.tsx).
      '/event-reports',
      '/schedules',
      '/statistics',
      '/vehicles',
    ]);
  });

  it('gives a Logistics Coordinator exactly twelve entries and no live mode', () => {
    // Twelve: #165's /my-notices, /notices and /notification-config (seven
    // to ten), plus /event-reports and /schedules — both org-wide reading
    // now, same as for every other role (ten to twelve).
    const routes = visibleRoutes(UserRole.LOGISTICS_COORDINATOR);
    expect(routes).toEqual([
      '/',
      '/my-duties',
      '/my-hours',
      '/my-notices',
      '/event-reports',
      '/schedules',
      '/statistics',
      '/notices',
      '/vehicles',
      '/inventory-templates',
      '/material-items',
      '/notification-config',
    ]);
    expect(routes).not.toContain('/live');
  });

  it('gives an Emergency Coordinator every entry their ROLE_PERMISSIONS actually grant', () => {
    // Not asserted equal to the System Admin's list: `ROLE_PERMISSIONS` does
    // not give EMERGENCY_COORDINATOR `MANAGE_LOGISTICS`, so Inventory
    // Templates does not show for them even though the approved design's
    // entry count table says otherwise — see the note to the user.
    const routes = visibleRoutes(UserRole.EMERGENCY_COORDINATOR);
    const expected = NAV_SECTIONS.flatMap((s) => s.entries)
      .filter(
        (entry) =>
          !entry.requires ||
          entry.requires.some((action) =>
            ROLE_PERMISSIONS[UserRole.EMERGENCY_COORDINATOR].includes(action),
          ),
      )
      .map((entry) => entry.to);
    expect(routes).toEqual(expected);
    expect(routes).toContain('/holidays');
    expect(routes).toContain('/live-runs');
    // #165: MANAGE_NOTICES is granted to both coordinator roles.
    expect(routes).toContain('/notices');
    expect(routes).toContain('/notification-config');
    expect(routes).not.toContain('/inventory-templates');
    // Unlike Inventory Templates, the materials catalogue is gated on
    // MANAGE_VEHICLES (#206), which this role does hold.
    expect(routes).toContain('/material-items');
  });

  it('gives a System Admin every entry in the manifest', () => {
    const all = NAV_SECTIONS.flatMap((section) => section.entries).map((entry) => entry.to);
    expect(visibleRoutes(UserRole.SYSTEM_ADMIN)).toEqual(all);
  });

  it('a dual-role person sees the union of both roles’ entries (#multi-role)', () => {
    const dual = visibleRoutes([UserRole.EMERGENCY_OPERATIONAL, UserRole.LOGISTICS_COORDINATOR]);
    const operational = visibleRoutes(UserRole.EMERGENCY_OPERATIONAL);
    const logistics = visibleRoutes(UserRole.LOGISTICS_COORDINATOR);
    const union = [...new Set([...operational, ...logistics])];

    expect(new Set(dual)).toEqual(new Set(union));
    // Routes from each half are individually present, not just the union set.
    expect(dual).toContain('/live'); // operational-only
    expect(dual).toContain('/inventory-templates'); // logistics-only
  });
});
