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
 * Turns the viewer's role into a capability predicate.
 *
 * `authProvider.getPermissions()` returns the bare role string, not a list of
 * actions, so this is where that role gets checked against `@redinfo/shared`'s
 * `hasPermission` — the same table the backend guards with. It exists so the
 * navigation manifest (`layout/navigation.tsx`) and anything else gating on a
 * capability share one lookup rather than each re-deriving it.
 */
export function useCapabilities(): Capabilities {
  const { permissions, isPending } = usePermissions<UserRole | null>();

  return {
    isPending,
    can: (actions) =>
      !actions || actions.length === 0
        ? true
        : !!permissions && actions.some((action) => hasPermission(permissions, action)),
  };
}
