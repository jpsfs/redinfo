import { ReactNode } from 'react';
import { useAuthenticated, usePermissions } from 'react-admin';
import { Alert, Box, Container, LinearProgress } from '@mui/material';
import { Action, hasPermission } from '@redinfo/shared';
import { t } from '../../i18n/labels';

/**
 * The auth gate live mode has to bring with it.
 *
 * `noLayout` custom routes render **outside** react-admin's auth gate — that is
 * precisely why `/auth/callback` works — so a `noLayout` route that needs a
 * signed-in user has to say so itself. Live mode is `noLayout` because it owns
 * the whole viewport: its bottom bar must be the only thing in thumb reach, and
 * react-admin's `Layout` would put a hamburger menu exactly there.
 *
 * `CREATE_EVENT_REPORT` and not a new action: field crew already carry it, and a
 * live run is the report before it is finished.
 */
export const LiveRunGate = ({ children }: { children: ReactNode }) => {
  useAuthenticated();
  const { permissions, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <Box sx={{ p: 4 }}>
        <LinearProgress />
      </Box>
    );
  }

  if (!permissions || !hasPermission(permissions, Action.CREATE_EVENT_REPORT)) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Alert severity="warning">{t('live.notPermitted')}</Alert>
      </Container>
    );
  }

  return <>{children}</>;
};
