import { useCallback, useEffect, useState } from 'react';
import { useNotify } from 'react-admin';
import { CircularProgress, FormControlLabel, Paper, Stack, Switch, Typography, Button } from '@mui/material';
import { NotificationChannel, UserNotificationPreference } from '@redinfo/shared';
import { apiFetch } from '../api';
import { useT } from '../i18n/useT';

/** Base64url (the shape browsers hand back for VAPID keys) → the raw bytes `applicationServerKey` wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

const OPTIONAL_CHANNELS = [NotificationChannel.EMAIL, NotificationChannel.WEB_PUSH];

/**
 * A member's own notification preferences: per-channel opt-out, plus
 * subscribing this specific device to Web Push. `IN_APP` is never shown here
 * — it's always on, the same way seeing your own duties needs no toggle.
 */
export const NotificationSettingsCard = () => {
  const t = useT();
  const notify = useNotify();
  const [preferences, setPreferences] = useState<UserNotificationPreference[] | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prefs = await apiFetch<UserNotificationPreference[]>('/notifications/preferences');
        if (!cancelled) setPreferences(prefs);
      } catch {
        if (!cancelled) notify(t('notificationSettings.loadFailed'), { type: 'warning' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify, t]);

  useEffect(() => {
    let cancelled = false;
    async function checkSubscription() {
      // Support is a capability of the browser, not of whatever has happened
      // to register so far — `getRegistration()` can legitimately still be
      // in flight (registerSW.ts waits for `load`) the first time this runs,
      // and treating that race as "unsupported" stuck the message permanently
      // even on browsers that fully support push.
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (!cancelled) setPushSupported(true);
      // Unlike `getRegistration()`, `ready` waits for registration to finish
      // rather than snapshotting whatever's registered right now.
      const registration = await navigator.serviceWorker.ready.catch(() => undefined);
      if (!registration || cancelled) return;
      const subscription = await registration.pushManager.getSubscription().catch(() => null);
      if (!cancelled) setPushSubscribed(Boolean(subscription));
    }
    void checkSubscription();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleChannel = useCallback(
    async (channel: NotificationChannel, enabled: boolean) => {
      const next = OPTIONAL_CHANNELS.map((c) => ({
        channel: c,
        enabled: c === channel ? enabled : (preferences?.find((p) => p.channel === c)?.enabled ?? true),
      }));
      setPreferences(next);
      try {
        await apiFetch('/notifications/preferences', { method: 'PUT', body: { preferences: next } });
      } catch {
        notify(t('notificationSettings.saveFailed'), { type: 'warning' });
      }
    },
    [notify, preferences, t],
  );

  const subscribeToPush = useCallback(async () => {
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      const { publicKey } = await apiFetch<{ publicKey: string | null }>('/notifications/push/public-key');
      if (!publicKey) return;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      await apiFetch('/notifications/push/subscriptions', {
        method: 'POST',
        body: { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      });
      setPushSubscribed(true);
    } catch {
      notify(t('notificationSettings.pushFailed'), { type: 'warning' });
    } finally {
      setPushBusy(false);
    }
  }, [notify, t]);

  const unsubscribeFromPush = useCallback(async () => {
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await apiFetch('/notifications/push/subscriptions', {
          method: 'DELETE',
          body: { endpoint: subscription.endpoint },
        });
        await subscription.unsubscribe();
      }
      setPushSubscribed(false);
    } catch {
      notify(t('notificationSettings.pushFailed'), { type: 'warning' });
    } finally {
      setPushBusy(false);
    }
  }, [notify, t]);

  const enabled = (channel: NotificationChannel) =>
    preferences?.find((p) => p.channel === channel)?.enabled ?? true;

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {t('notificationSettings.heading')}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {t('notificationSettings.subheading')}
      </Typography>

      {!preferences ? (
        <CircularProgress size={20} />
      ) : (
        <Stack spacing={1}>
          <FormControlLabel
            control={
              <Switch
                checked={enabled(NotificationChannel.EMAIL)}
                onChange={(event) => void toggleChannel(NotificationChannel.EMAIL, event.target.checked)}
              />
            }
            label={t('notificationChannel.EMAIL')}
          />

          <Stack direction="row" spacing={1} alignItems="center">
            <FormControlLabel
              control={
                <Switch
                  checked={enabled(NotificationChannel.WEB_PUSH)}
                  onChange={(event) => void toggleChannel(NotificationChannel.WEB_PUSH, event.target.checked)}
                />
              }
              label={t('notificationChannel.WEB_PUSH')}
            />
          </Stack>

          {pushSupported ? (
            <Button
              size="small"
              variant="outlined"
              disabled={pushBusy}
              onClick={() => void (pushSubscribed ? unsubscribeFromPush() : subscribeToPush())}
              sx={{ alignSelf: 'flex-start' }}
            >
              {pushBusy ? (
                <CircularProgress size={16} />
              ) : pushSubscribed ? (
                t('notificationSettings.pushUnsubscribe')
              ) : (
                t('notificationSettings.pushSubscribe')
              )}
            </Button>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {t('notificationSettings.pushUnsupported')}
            </Typography>
          )}
        </Stack>
      )}
    </Paper>
  );
};
