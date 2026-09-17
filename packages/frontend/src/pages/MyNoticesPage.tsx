import { useCallback, useEffect, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { NoticeWithReceipt } from '@redinfo/shared';
import { apiFetch } from '../api';
import { useT } from '../i18n/useT';
import { formatDate } from '../utils/dates';

const NoticeCard = ({
  notice,
  onAcknowledge,
}: {
  notice: NoticeWithReceipt;
  onAcknowledge: (id: string) => void;
}) => {
  const t = useT();
  const unread = !notice.receipt.readAt;
  const acknowledged = Boolean(notice.receipt.acknowledgedAt);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderColor: unread ? 'primary.main' : undefined, borderWidth: unread ? 2 : 1 }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>
          {notice.title}
        </Typography>
        {unread && <Chip size="small" color="primary" label={t('notices.unread')} />}
        {acknowledged && <Chip size="small" color="success" variant="outlined" label={t('notices.acknowledged')} />}
      </Stack>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>
        {notice.body}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
        <Typography variant="caption" color="text.secondary">
          {t('notices.from', { name: notice.createdByName })} · {formatDate(t, notice.createdAt.slice(0, 10))}
        </Typography>
        {!acknowledged && (
          <Button size="small" variant="outlined" onClick={() => onAcknowledge(notice.id)}>
            {t('notices.acknowledgeButton')}
          </Button>
        )}
      </Stack>
    </Paper>
  );
};

/**
 * The member's own alerts area (#165) — operational notices targeted at
 * them, newest first. Read state is stamped as soon as the list loads (that
 * is what "seeing it here" means); acknowledgement stays an explicit click.
 */
export const MyNoticesPage = () => {
  const t = useT();
  const notify = useNotify();
  const [notices, setNotices] = useState<NoticeWithReceipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetch<NoticeWithReceipt[]>('/notices/me');
      setNotices(result);
      const unread = result.filter((notice) => !notice.receipt.readAt);
      await Promise.all(unread.map((notice) => apiFetch(`/notices/${notice.id}/read`, { method: 'POST' })));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('notices.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const acknowledge = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/notices/${id}/acknowledge`, { method: 'POST' });
        setNotices(
          (current) =>
            current?.map((notice) =>
              notice.id === id
                ? { ...notice, receipt: { readAt: new Date().toISOString(), acknowledgedAt: new Date().toISOString() } }
                : notice,
            ) ?? null,
        );
      } catch (e) {
        notify(e instanceof Error ? e.message : t('notices.acknowledgeFailed'), { type: 'warning' });
      }
    },
    [notify, t],
  );

  return (
    <Card sx={{ mt: 2 }}>
      <Title title={t('notices.pageTitle')} />
      <CardContent>
        <Typography variant="h6">{t('notices.heading')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('notices.subheading')}
        </Typography>

        {!notices && !error && <CircularProgress size={24} />}

        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {notices && notices.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('notices.none')}
          </Typography>
        )}

        {notices && notices.length > 0 && (
          <Stack spacing={1.5}>
            {notices.map((notice) => (
              <NoticeCard key={notice.id} notice={notice} onAcknowledge={(id) => void acknowledge(id)} />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};
