import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import { Action, UserRole } from '@redinfo/shared';
import { useCapabilities } from './useCapabilities';

function withRole(role: UserRole | null) {
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(role),
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
  it('is pending, and grants nothing gated, until the role resolves', () => {
    const { result } = withRole(UserRole.EMERGENCY_OPERATIONAL);
    expect(result.current.isPending).toBe(true);
    expect(result.current.can([Action.VIEW_USERS])).toBe(false);
    // An entry with no `requires` is for everyone, even before the role loads.
    expect(result.current.can()).toBe(true);
    expect(result.current.can([])).toBe(true);
  });

  it('grants an action the role holds, once resolved', async () => {
    const { result } = withRole(UserRole.EMERGENCY_OPERATIONAL);
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.can([Action.EMERGENCY_OPERATION])).toBe(true);
    expect(result.current.can([Action.VIEW_USERS])).toBe(false);
  });

  it('grants a capability if any one of several actions is held', async () => {
    const { result } = withRole(UserRole.LOGISTICS_COORDINATOR);
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.can([Action.MANAGE_AVAILABILITY_WINDOWS, Action.MANAGE_LOGISTICS])).toBe(
      true,
    );
  });

  it('grants nothing gated when there is no role', async () => {
    const { result } = withRole(null);
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.can([Action.VIEW_USERS])).toBe(false);
    expect(result.current.can()).toBe(true);
  });
});
