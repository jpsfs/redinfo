import { describe, expect, it } from 'vitest';
import { Action, ROLE_PERMISSIONS, UserRole, hasPermission } from '@redinfo/shared';
import { NAV_SECTIONS } from './navigation';

/**
 * Pure — no rendering. This is the test that pins the navigation model down:
 * for a given role, which routes does `NAV_SECTIONS` resolve to? `AppLayout`
 * only has to walk the same manifest correctly, which `AppLayout.test.tsx`
 * checks separately.
 */
function visibleRoutes(role: UserRole): string[] {
  return NAV_SECTIONS.flatMap((section) => section.entries)
    .filter((entry) => !entry.requires || entry.requires.some((action) => hasPermission(role, action)))
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
      '/statistics',
      '/vehicles',
    ]);
  });

  it('gives a Logistics Coordinator exactly six entries and no live mode', () => {
    const routes = visibleRoutes(UserRole.LOGISTICS_COORDINATOR);
    expect(routes).toEqual([
      '/',
      '/my-duties',
      '/my-hours',
      '/statistics',
      '/vehicles',
      '/inventory-templates',
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
    expect(routes).not.toContain('/inventory-templates');
  });

  it('gives a System Admin every entry in the manifest', () => {
    const all = NAV_SECTIONS.flatMap((section) => section.entries).map((entry) => entry.to);
    expect(visibleRoutes(UserRole.SYSTEM_ADMIN)).toEqual(all);
  });
});
