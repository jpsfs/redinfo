import { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { CreateNoticeRequest, Notice, NoticeTargetType, NotificationChannel, UserRole } from '@redinfo/shared';
import { apiFetch } from '../api';
import { accountRoleLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';

const SELECTABLE_ROLES = Object.values(UserRole);
const SELECTABLE_CHANNELS = [NotificationChannel.EMAIL, NotificationChannel.WEB_PUSH];

/** Coordinator's "New notice" form (#165) — title, body, audience, channels, optional expiry. */
export const NoticeCreateDialog = ({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) => {
  const t = useT();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState<NoticeTargetType>(NoticeTargetType.ALL);
  const [targetRoles, setTargetRoles] = useState<UserRole[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setBody('');
    setTargetType(NoticeTargetType.ALL);
    setTargetRoles([]);
    setChannels([]);
    setExpiresAt('');
    setError(null);
  };

  const toggleRole = (role: UserRole) =>
    setTargetRoles((current) => (current.includes(role) ? current.filter((r) => r !== role) : [...current, role]));

  const toggleChannel = (channel: NotificationChannel) =>
    setChannels((current) => (current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel]));

  const canSave = title.trim().length > 0 && body.trim().length > 0 && (targetType === NoticeTargetType.ALL || targetRoles.length > 0);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const request: CreateNoticeRequest = {
        title: title.trim(),
        body: body.trim(),
        targetType,
        targetRoles: targetType === NoticeTargetType.ROLES ? targetRoles : undefined,
        channels,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      };
      await apiFetch<Notice>('/notices', { method: 'POST', body: request });
      reset();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('noticeManage.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('noticeManage.newButton')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label={t('noticeManage.titleField')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            label={t('noticeManage.bodyField')}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            fullWidth
            multiline
            minRows={3}
            size="small"
          />
          <TextField
            select
            label={t('noticeManage.targetType')}
            value={targetType}
            onChange={(event) => setTargetType(event.target.value as NoticeTargetType)}
            size="small"
          >
            <MenuItem value={NoticeTargetType.ALL}>{t('noticeManage.targetAll')}</MenuItem>
            <MenuItem value={NoticeTargetType.ROLES}>{t('noticeManage.targetRoles')}</MenuItem>
          </TextField>

          {targetType === NoticeTargetType.ROLES && (
            <Stack direction="row" flexWrap="wrap" useFlexGap>
              {SELECTABLE_ROLES.map((role) => (
                <FormControlLabel
                  key={role}
                  control={<Checkbox checked={targetRoles.includes(role)} onChange={() => toggleRole(role)} />}
                  label={accountRoleLabel(t, role)}
                />
              ))}
            </Stack>
          )}

          <Stack>
            <Stack direction="row" flexWrap="wrap" useFlexGap>
              {SELECTABLE_CHANNELS.map((channel) => (
                <FormControlLabel
                  key={channel}
                  control={<Checkbox checked={channels.includes(channel)} onChange={() => toggleChannel(channel)} />}
                  label={t(`notificationChannel.${channel}`)}
                />
              ))}
            </Stack>
          </Stack>

          <TextField
            label={t('noticeManage.expiresAt')}
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t('action.cancel')}
        </Button>
        <Button variant="contained" onClick={() => void handleCreate()} disabled={saving || !canSave}>
          {saving ? <CircularProgress size={18} /> : t('noticeManage.createButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
