import { useEffect, useState } from 'react';
import {
  Alert,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { NoticeRecipientStatus, NotificationDeliveryStatus } from '@redinfo/shared';
import { apiFetch } from '../api';
import { useT } from '../i18n/useT';

const DELIVERY_COLOR: Record<NotificationDeliveryStatus, 'default' | 'success' | 'error'> = {
  [NotificationDeliveryStatus.PENDING]: 'default',
  [NotificationDeliveryStatus.SENT]: 'success',
  [NotificationDeliveryStatus.FAILED]: 'error',
};

/** Per-recipient read/acknowledge/delivery status (#165) — a coordinator checking a notice landed. */
export const NoticeRecipientsDialog = ({
  noticeId,
  onClose,
}: {
  noticeId: string | null;
  onClose: () => void;
}) => {
  const t = useT();
  const [recipients, setRecipients] = useState<NoticeRecipientStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!noticeId) return;
    setRecipients(null);
    setError(null);
    apiFetch<NoticeRecipientStatus[]>(`/notices/${noticeId}/recipients`)
      .then(setRecipients)
      .catch((e) => setError(e instanceof Error ? e.message : t('noticeManage.recipientsLoadFailed')));
  }, [noticeId, t]);

  return (
    <Dialog open={Boolean(noticeId)} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('noticeManage.recipientsTitle')}</DialogTitle>
      <DialogContent>
        {!recipients && !error && <CircularProgress size={24} />}
        {error && <Alert severity="warning">{error}</Alert>}
        {recipients && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('noticeManage.recipientName')}</TableCell>
                <TableCell>{t('notices.acknowledged')}</TableCell>
                <TableCell>{t('noticeManage.channels')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recipients.map((recipient) => (
                <TableRow key={recipient.userId}>
                  <TableCell>{recipient.userName}</TableCell>
                  <TableCell>
                    {recipient.acknowledgedAt ? (
                      <Chip size="small" color="success" label={t('notices.acknowledged')} />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        {t('notices.unread')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {recipient.deliveries.map((delivery) => (
                        <Chip
                          key={delivery.channel}
                          size="small"
                          variant="outlined"
                          color={DELIVERY_COLOR[delivery.status]}
                          label={`${t(`notificationChannel.${delivery.channel}`)} · ${t(`noticeManage.deliveryStatus.${delivery.status}`)}`}
                        />
                      ))}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
};
