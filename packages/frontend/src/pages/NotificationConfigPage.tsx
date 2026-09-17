import { useCallback, useEffect, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { NotificationChannel, NotificationType } from '@redinfo/shared';
import { apiFetch } from '../api';
import { useT } from '../i18n/useT';

type TypeSetting = { channel: NotificationChannel; enabled: boolean };

const CONFIGURABLE_CHANNELS = [NotificationChannel.EMAIL, NotificationChannel.WEB_PUSH];

/**
 * Org-wide default channels per notification type (#165). Today there is one
 * type, `NOTICE` — a coordinator picking channels per-notice can only ever
 * reach as far as what's enabled here; a member's own preference narrows it
 * further still (`NotificationSettingsCard`).
 */
export const NotificationConfigPage = () => {
  const t = useT();
  const notify = useNotify();
  const [settings, setSettings] = useState<TypeSetting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSettings(await apiFetch<TypeSetting[]>(`/notifications/config/${NotificationType.NOTICE}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('notificationConfig.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (channel: NotificationChannel, enabled: boolean) => {
    const next = CONFIGURABLE_CHANNELS.map((c) => ({
      channel: c,
      enabled: c === channel ? enabled : (settings?.find((s) => s.channel === c)?.enabled ?? false),
    }));
    setSettings(next);
    setSaving(true);
    try {
      await apiFetch(`/notifications/config/${NotificationType.NOTICE}`, {
        method: 'PUT',
        body: { channels: next.filter((s) => s.enabled).map((s) => s.channel) },
      });
      notify(t('notificationConfig.saved'), { type: 'success' });
    } catch (e) {
      notify(e instanceof Error ? e.message : t('notificationConfig.saveFailed'), { type: 'warning' });
    } finally {
      setSaving(false);
    }
  };

  const enabled = (channel: NotificationChannel) => settings?.find((s) => s.channel === channel)?.enabled ?? false;

  return (
    <Card sx={{ mt: 2 }}>
      <Title title={t('notificationConfig.pageTitle')} />
      <CardContent>
        <Typography variant="h6">{t('notificationConfig.heading')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('notificationConfig.subheading')}
        </Typography>

        {!settings && !error && <CircularProgress size={24} />}
        {error && <Alert severity="warning">{error}</Alert>}

        {settings && (
          <Stack spacing={1}>
            <Typography variant="subtitle2">{t('notificationConfig.noticeType')}</Typography>
            {CONFIGURABLE_CHANNELS.map((channel) => (
              <FormControlLabel
                key={channel}
                control={
                  <Switch
                    checked={enabled(channel)}
                    disabled={saving}
                    onChange={(event) => void toggle(channel, event.target.checked)}
                  />
                }
                label={t(`notificationChannel.${channel}`)}
              />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};
