import { usePermissions } from 'react-admin';
import { Action, UserRole, hasPermission } from '@redinfo/shared';

export interface Capabilities {
  /**
   * True until the role is known. `getPermissions` is async, so the menu must
   * render nothing rather than render every entry and then drop half of them.
   */
  isPending: boolean;
  /** Any one of `actions` is enough. An empty or missing list means everyone. */
  can: (actions?: Action[]) => boolean;
}

/**
 * Turns the viewer's roles into a capability predicate.
 *
 * `authProvider.getPermissions()` returns the roles array decoded from the
 * JWT, not a list of actions, so this is where those roles get checked
 * against `@redinfo/shared`'s `hasPermission` — the same table the backend
 * guards with. Permissions are the union across every role held (#multi-role):
 * `hasPermission` takes the whole array, so a person with two roles can do
 * anything either one grants. Exists so the navigation manifest
 * (`layout/navigation.tsx`) and anything else gating on a capability share
 * one lookup rather than each re-deriving it.
 */
export function useCapabilities(): Capabilities {
  const { permissions, isPending } = usePermissions<UserRole[] | null>();

  return {
    isPending,
    can: (actions) =>
      !actions || actions.length === 0
        ? true
        : !!permissions?.length && actions.some((action) => hasPermission(permissions, action)),
  };
}
