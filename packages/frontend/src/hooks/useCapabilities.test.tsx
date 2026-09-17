import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import { Action, UserRole } from '@redinfo/shared';
import { useCapabilities } from './useCapabilities';

function withRoles(roles: UserRole[] | null) {
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(roles),
  };
  return renderHook(() => useCapabilities(), {
    wrapper: ({ children }) => (
      <AdminContext dataProvider={testDataProvider()} authProvider={authProvider}>
        {children}
      </AdminContext>
    ),
  });
}

describe('useCapabilities', () => {
  it('is pending, and grants nothing gated, until the roles resolve', () => {
    const { result } = withRoles([UserRole.EMERGENCY_OPERATIONAL]);
    expect(result.current.isPending).toBe(true);
    expect(result.current.can([Action.VIEW_USERS])).toBe(false);
    // An entry with no `requires` is for everyone, even before roles load.
    expect(result.current.can()).toBe(true);
    expect(result.current.can([])).toBe(true);
  });

  it('grants an action a held role grants, once resolved', async () => {
    const { result } = withRoles([UserRole.EMERGENCY_OPERATIONAL]);
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.can([Action.EMERGENCY_OPERATION])).toBe(true);
    expect(result.current.can([Action.VIEW_USERS])).toBe(false);
  });

  it('grants a capability if any one of several actions is held', async () => {
    const { result } = withRoles([UserRole.LOGISTICS_COORDINATOR]);
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.can([Action.MANAGE_AVAILABILITY_WINDOWS, Action.MANAGE_LOGISTICS])).toBe(
      true,
    );
  });

  it('unions capabilities across every role held (#multi-role)', async () => {
    const { result } = withRoles([UserRole.EMERGENCY_OPERATIONAL, UserRole.LOGISTICS_COORDINATOR]);
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.can([Action.EMERGENCY_OPERATION])).toBe(true); // from OPERATIONAL
    expect(result.current.can([Action.MANAGE_LOGISTICS])).toBe(true); // from LOGISTICS
    expect(result.current.can([Action.MANAGE_USERS])).toBe(false); // neither grants it
  });

  it('grants nothing gated when there are no roles', async () => {
    const { result } = withRoles(null);
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.can([Action.VIEW_USERS])).toBe(false);
    expect(result.current.can()).toBe(true);
  });

  it('grants nothing gated for an empty role array', async () => {
    const { result } = withRoles([]);
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.can([Action.VIEW_USERS])).toBe(false);
    expect(result.current.can()).toBe(true);
  });
});
