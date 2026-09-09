import { useCallback, useEffect, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import {
  Alert,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { apiFetch } from '../api';
import { useT } from '../i18n/useT';
import { formatDate } from '../utils/dates';

interface OAuthGrantSummary {
  id: string;
  clientName: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

/** Same host the SPA itself is served from — the backend proxies `/mcp` and the OAuth surface alongside it. See `nginx/nginx.conf`. */
const mcpUrl = () => `${window.location.origin}/mcp`;

/**
 * "How to connect an AI assistant" + the self-service list of active
 * connections — the page the plan calls for so a user isn't left guessing
 * how OAuth even starts. No `requires` in the drawer manifest: every
 * authenticated person may connect an assistant to their own account, the
 * same way everyone can see their own profile — what it can then *do* is
 * still bounded by their role, same as everywhere else in redinfo.
 */
export const AiConnectionsPage = () => {
  const t = useT();
  const notify = useNotify();
  const [grants, setGrants] = useState<OAuthGrantSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGrants(await apiFetch<OAuthGrantSummary[]>('/oauth/grants'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('aiConnections.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/oauth/grants/${id}`, { method: 'DELETE' });
        setGrants((current) => current?.filter((grant) => grant.id !== id) ?? null);
        notify(t('aiConnections.revoked'), { type: 'info' });
      } catch (e) {
        notify(e instanceof Error ? e.message : t('aiConnections.revokeFailed'), { type: 'warning' });
      }
    },
    [notify, t],
  );

  const copyUrl = useCallback(() => {
    void navigator.clipboard.writeText(mcpUrl());
    notify(t('aiConnections.urlCopied'), { type: 'info' });
  }, [notify, t]);

  return (
    <Card sx={{ mt: 2 }}>
      <Title title={t('aiConnections.pageTitle')} />
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <SmartToyIcon color="action" />
          <Typography variant="h6">{t('aiConnections.heading')}</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('aiConnections.explanation')}
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3, maxWidth: 520 }}>
          <TextField
            fullWidth
            size="small"
            label={t('aiConnections.urlLabel')}
            value={mcpUrl()}
            InputProps={{ readOnly: true }}
          />
          <Tooltip title={t('aiConnections.copyUrl')}>
            <IconButton onClick={copyUrl} aria-label={t('aiConnections.copyUrl')}>
              <ContentCopyIcon />
            </IconButton>
          </Tooltip>
        </Stack>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          {t('aiConnections.howToTitle')}
        </Typography>
        <Stack spacing={0.5} sx={{ mb: 3 }}>
          <Typography variant="body2">{t('aiConnections.howToClaude')}</Typography>
          <Typography variant="body2">{t('aiConnections.howToChatGpt')}</Typography>
          <Typography variant="body2">{t('aiConnections.howToCopilotStudio')}</Typography>
        </Stack>
        <Alert severity="info" sx={{ mb: 3 }}>
          {t('aiConnections.scopeNote')}
        </Alert>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          {t('aiConnections.activeHeading')}
        </Typography>

        {!grants && !error && <CircularProgress size={24} />}
        {error && <Alert severity="warning">{error}</Alert>}
        {grants && grants.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('aiConnections.none')}
          </Typography>
        )}
        {grants && grants.length > 0 && (
          <Stack spacing={1}>
            {grants.map((grant) => (
              <Paper key={grant.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                  <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }}>
                    {grant.clientName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {grant.lastUsedAt
                      ? t('aiConnections.lastUsed', { date: formatDate(t, grant.lastUsedAt.slice(0, 10)) })
                      : t('aiConnections.neverUsed')}
                  </Typography>
                  <Tooltip title={t('aiConnections.revokeButton')}>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => revoke(grant.id)}
                      aria-label={t('aiConnections.revokeButton')}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {grant.scopes.join(', ')}
                </Typography>
              </Paper>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};
