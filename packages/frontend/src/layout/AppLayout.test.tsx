import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AdminContext,
  ResourceDefinitionContextProvider,
  ResourceDefinition,
  testDataProvider,
} from 'react-admin';
import { RedInfoMenu } from './AppLayout';

/**
 * The resources App.tsx registers, in registration order.
 *
 * Assertions are on the menu links rather than the labels: outside a full
 * `<Admin>` the labels resolve to raw i18n keys, while the set of links is
 * exactly what this menu decides.
 */
const DEFINITIONS: Record<string, ResourceDefinition> = {
  users: { name: 'users', hasList: true, options: { label: 'Users' } },
  vehicles: { name: 'vehicles', hasList: true, options: { label: 'Vehicles' } },
  maintenance: { name: 'maintenance', hasList: false, options: { label: 'Maintenance' } },
  'inventory-templates': {
    name: 'inventory-templates',
    hasList: true,
    options: { label: 'Inventory Templates' },
  },
  'availability-windows': {
    name: 'availability-windows',
    hasList: true,
    options: { label: 'Availability Windows' },
  },
  schedules: { name: 'schedules', hasList: true, options: { label: 'Schedules' } },
  'event-reports': {
    name: 'event-reports',
    hasList: true,
    options: { label: 'Reports' },
  },
  hospitals: { name: 'hospitals', hasList: true, options: { label: 'Hospitals' } },
  // Reference data the pickers read; no list screen, so no menu entry.
  municipalities: {
    name: 'municipalities',
    hasList: false,
    options: { label: 'Municipalities' },
  },
  localities: { name: 'localities', hasList: false, options: { label: 'Localities' } },
  holidays: { name: 'holidays', hasList: true, options: { label: 'Holidays' } },
};

function renderMenu(): string[] {
  render(
    <AdminContext dataProvider={testDataProvider()}>
      <ResourceDefinitionContextProvider definitions={DEFINITIONS}>
        <RedInfoMenu />
      </ResourceDefinitionContextProvider>
    </AdminContext>,
  );
  return screen
    .getAllByRole('menuitem')
    .map((item) => item.getAttribute('href') ?? '')
    .map((href) => href.replace(/^#/, ''));
}

describe('RedInfoMenu', () => {
  it('lists the resources that have a list screen', () => {
    expect(renderMenu()).toEqual(
      expect.arrayContaining([
        '/users',
        '/vehicles',
        '/inventory-templates',
        '/availability-windows',
        '/schedules',
        '/event-reports',
        '/hospitals',
      ]),
    );
  });

  it('omits resources with no list screen', () => {
    const links = renderMenu();
    expect(links).not.toContain('/maintenance');
    // Geography is reference data the pickers fetch, not somewhere to go.
    expect(links).not.toContain('/municipalities');
    expect(links).not.toContain('/localities');
  });

  it('omits Holidays — it is managed from Availability Windows', () => {
    expect(renderMenu()).not.toContain('/holidays');
  });

  it('adds the personal pages, which are custom routes rather than resources', () => {
    const links = renderMenu();
    expect(links).toContain('/my-availability');
    expect(links).toContain('/my-duties');
    expect(links).toContain('/my-reports');
  });

  it('keeps the dashboard first and the personal pages last', () => {
    const links = renderMenu();

    expect(links[0]).toBe('/');
    // What someone was asked for, then what they were given, then what they
    // wrote up afterwards: availability, duties, reports — the order the parts
    // of the cycle actually happen in. Reports is a personal page because
    // reading the whole archive needs VIEW_EVENT_REPORTS, which an operational
    // does not have.
    expect(links.slice(-3)).toEqual(['/my-availability', '/my-duties', '/my-reports']);
  });
});
