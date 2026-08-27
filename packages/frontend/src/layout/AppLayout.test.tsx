import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { UserRole } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { RedInfoMenu } from './AppLayout';

/**
 * Pinned to English: this file's assertions predate #180 and check the
 * pre-translation strings, which are what `messagesFor('en')` still holds —
 * see `i18n/labels.ts`. What is under test here is which routes a role sees,
 * not which language they see them in.
 */
const i18nProvider = polyglotI18nProvider(messages, 'en');

/**
 * `usePermissions` is async, so a synchronous `getAllByRole` would see the
 * `isPending` `null` render and fail — every case here awaits
 * `findAllByRole` for that reason.
 *
 * Cleans up before rendering, not only after: a case that renders more than
 * once (`never puts My Profile...` below) would otherwise query across every
 * menu it has mounted so far, not just the latest one.
 */
async function renderMenuAs(role: UserRole | null): Promise<string[]> {
  cleanup();
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(role),
  };

  render(
    <AdminContext
      dataProvider={testDataProvider()}
      authProvider={authProvider}
      i18nProvider={i18nProvider}
    >
      <RedInfoMenu />
    </AdminContext>,
  );

  const items = await screen.findAllByRole('menuitem');
  return items.map((item) => (item.getAttribute('href') ?? '').replace(/^#/, ''));
}

describe('RedInfoMenu', () => {
  it('gives an Emergency Operational exactly the field-crew entries, live mode first', async () => {
    const links = await renderMenuAs(UserRole.EMERGENCY_OPERATIONAL);
    expect(links).toEqual([
      '/live',
      '/',
      '/my-availability',
      '/my-duties',
      '/my-hours',
      '/my-reports',
      '/vehicles',
    ]);
  });

  it('gives a Logistics Coordinator exactly five entries and no live mode', async () => {
    const links = await renderMenuAs(UserRole.LOGISTICS_COORDINATOR);
    expect(links).toEqual(['/', '/my-duties', '/my-hours', '/vehicles', '/inventory-templates']);
  });

  it('gives an Emergency Coordinator every operational and configuration entry, including Holidays', async () => {
    const links = await renderMenuAs(UserRole.EMERGENCY_COORDINATOR);
    expect(links).toEqual([
      '/live',
      '/',
      '/my-availability',
      '/my-duties',
      '/my-hours',
      '/my-reports',
      '/live-runs',
      '/event-reports',
      '/schedules',
      '/availability-windows',
      '/volunteer-hours/review',
      '/users',
      '/vehicles',
      // Not '/inventory-templates': ROLE_PERMISSIONS does not give this role
      // MANAGE_LOGISTICS. See navigation.test.tsx for the note on this gap
      // against the approved design's entry-count table.
      '/hospitals',
      '/holidays',
    ]);
  });

  it('gives a System Admin every entry in the manifest', async () => {
    const links = await renderMenuAs(UserRole.SYSTEM_ADMIN);
    expect(links).toEqual([
      '/live',
      '/',
      '/my-availability',
      '/my-duties',
      '/my-hours',
      '/my-reports',
      '/live-runs',
      '/event-reports',
      '/schedules',
      '/availability-windows',
      '/volunteer-hours/review',
      '/users',
      '/vehicles',
      '/inventory-templates',
      '/hospitals',
      '/holidays',
    ]);
  });

  it('never puts My Profile in the drawer, for any role', async () => {
    const linksByRole = [];
    for (const role of Object.values(UserRole)) {
      linksByRole.push(await renderMenuAs(role));
    }
    linksByRole.forEach((links) => expect(links).not.toContain('/my-profile'));
  });

  it('draws no subheader for a section left with zero visible entries', async () => {
    await renderMenuAs(UserRole.EMERGENCY_OPERATIONAL);
    expect(screen.queryByText('Operations')).not.toBeInTheDocument();
    expect(screen.queryByText('People')).not.toBeInTheDocument();
    expect(screen.queryByText('Configuration')).not.toBeInTheDocument();
    // Sections the role does have entries in still get their subheader.
    expect(screen.getByText('My work')).toBeInTheDocument();
  });
});
