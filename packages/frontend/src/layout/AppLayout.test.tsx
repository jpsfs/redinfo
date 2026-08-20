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
      ]),
    );
  });

  it('omits resources with no list screen', () => {
    expect(renderMenu()).not.toContain('/maintenance');
  });

  it('omits Holidays — it is managed from Availability Windows', () => {
    expect(renderMenu()).not.toContain('/holidays');
  });

  it('adds My Availability, which is a custom route rather than a resource', () => {
    expect(renderMenu()).toContain('/my-availability');
  });

  it('keeps the dashboard first and My Availability last', () => {
    const links = renderMenu();

    expect(links[0]).toBe('/');
    expect(links[links.length - 1]).toBe('/my-availability');
  });
});
