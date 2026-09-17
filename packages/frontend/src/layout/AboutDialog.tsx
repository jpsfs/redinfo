import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { AppVersionInfo } from '@redinfo/shared';
import { apiFetch } from '../api';
import { useT } from '../i18n/useT';
import { useIsMobile } from '../hooks/useIsMobile';
import { formatDate } from '../utils/dates';

export interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * "About", before Logout in the user menu — a tech-support request: "which
 * commit is actually running" is the first question in any support
 * conversation, and this is the one place a non-technical user can answer it
 * without asking a developer. Fetches `GET /health/version` on open rather
 * than baking it into the frontend bundle, so it always reflects the
 * *backend* actually being talked to.
 */
export const AboutDialog = ({ open, onClose }: AboutDialogProps) => {
  const t = useT();
  const fullScreen = useIsMobile();
  const [info, setInfo] = useState<AppVersionInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setInfo(null);
    apiFetch<AppVersionInfo>('/health/version')
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => {
        if (!cancelled) setInfo({ commit: 'dev', commitDate: null });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={fullScreen}>
      <DialogTitle>{t('about.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 1 }}>
          {info ? (
            <>
              <Typography variant="body2">
                {t('about.version')}: {info.commit}
              </Typography>
              {info.commitDate && (
                <Typography variant="body2">
                  {t('about.builtOn')}: {formatDate(t, info.commitDate.slice(0, 10))}
                </Typography>
              )}
            </>
          ) : (
            <CircularProgress size={20} sx={{ alignSelf: 'flex-start' }} />
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            {t('about.builtBy')}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('about.close')}</Button>
      </DialogActions>
    </Dialog>
  );
};
