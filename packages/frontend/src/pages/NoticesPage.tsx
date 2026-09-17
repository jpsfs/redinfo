import { useCallback, useEffect, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { NoticeTargetType, NoticeWithStats } from '@redinfo/shared';
import { apiFetch } from '../api';
import { useT } from '../i18n/useT';
import { formatDate } from '../utils/dates';
import { NoticeCreateDialog } from './NoticeCreateDialog';
import { NoticeRecipientsDialog } from './NoticeRecipientsDialog';

/** The coordinator's notice history and creation screen (#165). */
export const NoticesPage = () => {
  const t = useT();
  const notify = useNotify();
  const [notices, setNotices] = useState<NoticeWithStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [recipientsFor, setRecipientsFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setNotices(await apiFetch<NoticeWithStats[]>('/notices'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('noticeManage.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const deactivate = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/notices/${id}/deactivate`, { method: 'POST' });
        void load();
      } catch (e) {
        notify(e instanceof Error ? e.message : t('noticeManage.deactivateFailed'), { type: 'warning' });
      }
    },
    [load, notify, t],
  );

  const isActive = (notice: NoticeWithStats) => !notice.expiresAt || new Date(notice.expiresAt) > new Date();

  return (
    <Card sx={{ mt: 2 }}>
      <Title title={t('noticeManage.pageTitle')} />
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
          <div>
            <Typography variant="h6">{t('noticeManage.heading')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('noticeManage.subheading')}
            </Typography>
          </div>
          <Button variant="contained" onClick={() => setCreateOpen(true)}>
            {t('noticeManage.newButton')}
          </Button>
        </Stack>

        {!notices && !error && <CircularProgress size={24} />}

        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {notices && notices.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('noticeManage.none')}
          </Typography>
        )}

        {notices && notices.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('noticeManage.titleField')}</TableCell>
                <TableCell>{t('noticeManage.targetType')}</TableCell>
                <TableCell>{t('noticeManage.acknowledgedHeader')}</TableCell>
                <TableCell>{t('noticeManage.active')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {notices.map((notice) => {
                const active = isActive(notice);
                return (
                  <TableRow key={notice.id}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {notice.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(t, notice.createdAt.slice(0, 10))}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {notice.targetType === NoticeTargetType.ALL
                        ? t('noticeManage.targetAll')
                        : t('noticeManage.targetRoles')}
                    </TableCell>
                    <TableCell>
                      {t('noticeManage.acknowledgedCount', {
                        acknowledged: notice.acknowledgedCount,
                        total: notice.recipientCount,
                      })}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={active ? 'success' : 'default'}
                        variant={active ? 'filled' : 'outlined'}
                        label={active ? t('noticeManage.active') : t('noticeManage.ended')}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="small" onClick={() => setRecipientsFor(notice.id)}>
                          {t('noticeManage.recipientsButton')}
                        </Button>
                        {active && (
                          <Button size="small" color="warning" onClick={() => void deactivate(notice.id)}>
                            {t('noticeManage.deactivateButton')}
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <NoticeCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          notify(t('noticeManage.createSuccess'), { type: 'success' });
          void load();
        }}
      />
      <NoticeRecipientsDialog noticeId={recipientsFor} onClose={() => setRecipientsFor(null)} />
    </Card>
  );
};
