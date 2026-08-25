import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import {
  MAX_ROLE_PEOPLE,
  MAX_ROLES_PER_WINDOW,
  WindowRoleSpec,
} from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { WindowRoleEditor } from './WindowRoleEditor';

// This screen has not gone through #180 phase 3 yet — English by convention.
const i18nProvider = polyglotI18nProvider(messages, 'en');

/** Renders the editor and reports what it asked to change it to. */
function renderEditor(roles: WindowRoleSpec[], props: { disabled?: boolean } = {}) {
  const onChange = vi.fn();
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <WindowRoleEditor roles={roles} onChange={onChange} {...props} />
    </AdminContext>,
  );
  return { onChange };
}

const CREW: WindowRoleSpec[] = [
  { name: 'Driver', maxPeople: 1 },
  { name: 'Team Leader', maxPeople: 1 },
];

describe('WindowRoleEditor', () => {
  it('says plainly when a window has no roles', () => {
    renderEditor([]);
    expect(
      screen.getByText(/people will be scheduled onto this window without one/),
    ).toBeInTheDocument();
  });

  it('describes what each role may hold', () => {
    renderEditor([
      { name: 'Driver', maxPeople: 1 },
      { name: 'Stretcher bearer', maxPeople: 3 },
      { name: 'Volunteer', maxPeople: 0 },
    ]);

    expect(screen.getByText('1 person')).toBeInTheDocument();
    expect(screen.getByText('up to 3 people')).toBeInTheDocument();
    expect(screen.getByText('unlimited')).toBeInTheDocument();
  });

  it('suggests DRIVER for the driver post, and only that one', () => {
    renderEditor(CREW);
    expect(screen.getAllByText(/Suggested from the name: Driver/)).toHaveLength(1);
    expect(screen.getByText('No suggestion')).toBeInTheDocument();
  });

  it('suggests DRIVER for a driver role however it was typed', () => {
    renderEditor([{ name: '  DRIVER', maxPeople: 1 }]);
    expect(screen.getByText(/Suggested from the name: Driver/)).toBeInTheDocument();
  });

  it('renames a role without touching the others', async () => {
    const { onChange } = renderEditor(CREW);

    await userEvent.type(screen.getByLabelText('Role 2 name'), '!');

    expect(onChange).toHaveBeenLastCalledWith([
      { name: 'Driver', maxPeople: 1 },
      { name: 'Team Leader!', maxPeople: 1 },
    ]);
  });

  it('clamps the headcount to the allowed range', () => {
    const { onChange } = renderEditor(CREW);
    const field = screen.getByLabelText('Role 1 people');

    fireEvent.change(field, { target: { value: '99' } });
    expect(onChange).toHaveBeenLastCalledWith([
      { name: 'Driver', maxPeople: MAX_ROLE_PEOPLE },
      CREW[1],
    ]);

    fireEvent.change(field, { target: { value: '-4' } });
    expect(onChange).toHaveBeenLastCalledWith([
      { name: 'Driver', maxPeople: 0 },
      CREW[1],
    ]);
  });

  it('adds a role, ready to be named', async () => {
    const { onChange } = renderEditor(CREW);

    await userEvent.click(screen.getByRole('button', { name: 'Add role' }));

    expect(onChange).toHaveBeenCalledWith([
      ...CREW,
      { name: '', maxPeople: 1, requiredCertification: undefined },
    ]);
  });

  it('removes the role asked for', async () => {
    const { onChange } = renderEditor(CREW);

    await userEvent.click(screen.getByLabelText('Remove role 1'));

    expect(onChange).toHaveBeenCalledWith([CREW[1]]);
  });

  it('stops at the maximum number of roles', () => {
    const roles = Array.from({ length: MAX_ROLES_PER_WINDOW }, (_, index) => ({
      name: `Role ${index}`,
      maxPeople: 1,
    }));
    renderEditor(roles);

    expect(screen.getByRole('button', { name: 'Add role' })).toBeDisabled();
  });

  it('shows the rule the API would refuse the payload with', () => {
    renderEditor([{ name: 'Driver', maxPeople: 1 }, { name: 'driver', maxPeople: 1 }]);
    expect(screen.getByText('Two roles are both called "driver".')).toBeInTheDocument();
  });

  it("keeps a coordinator's explicit choice of required certification", async () => {
    const { onChange } = renderEditor(CREW);

    await userEvent.click(screen.getByLabelText('Role 2 required certification'));
    await userEvent.click(await screen.findByRole('option', { name: 'TAS' }));

    expect(onChange).toHaveBeenLastCalledWith([
      CREW[0],
      { name: 'Team Leader', maxPeople: 1, requiredCertification: 'TAS' },
    ]);
  });

  it('lets a coordinator explicitly remove the driver suggestion', async () => {
    const { onChange } = renderEditor(CREW);

    await userEvent.click(screen.getByLabelText('Role 1 required certification'));
    await userEvent.click(await screen.findByRole('option', { name: 'No requirement' }));

    expect(onChange).toHaveBeenLastCalledWith([
      { name: 'Driver', maxPeople: 1, requiredCertification: null },
      CREW[1],
    ]);
  });

  it('edits nothing while disabled', () => {
    renderEditor(CREW, { disabled: true });

    expect(screen.getByLabelText('Role 1 name')).toBeDisabled();
    expect(screen.getByLabelText('Role 1 people')).toBeDisabled();
    expect(screen.getByLabelText('Remove role 1')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add role' })).toBeDisabled();
  });
});
