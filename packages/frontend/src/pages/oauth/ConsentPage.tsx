import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthenticated } from 'react-admin';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { ApiError, apiFetch } from '../../api';
import { useT } from '../../i18n/useT';
import { DelegacaoCampoLogo } from '../../components/DelegacaoCampoLogo';

interface ConsentDescription {
  clientName: string;
  scopes: string[];
}

const SCOPE_LABEL_KEY: Record<string, 'oauthConsent.scopeRead' | 'oauthConsent.scopeWrite'> = {
  'redinfo:read': 'oauthConsent.scopeRead',
  'redinfo:write': 'oauthConsent.scopeWrite',
};

/**
 * The human half of the MCP OAuth flow (`OAuthProviderService.authorize()`
 * on the backend) — reached only via the redirect that method sends,
 * `?ticket=<signed JWT>`. `useAuthenticated()` is the whole point of this
 * being its own page rather than something `authorize()` renders itself:
 * reaching this component at all already proves the caller is signed in as
 * a real redinfo user, which is the identity the resulting connection acts
 * as.
 *
 * `noLayout` in `App.tsx` — a focused prompt, not the app shell, the same
 * choice `SchedulePrintPage`/`LiveRunGate` make for their own standalone
 * screens.
 */
export const ConsentPage = () => {
  useAuthenticated();
  const t = useT();
  const [searchParams] = useSearchParams();
  const ticket = searchParams.get('ticket') ?? '';

  const [description, setDescription] = useState<ConsentDescription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    if (!ticket) {
      setError(t('oauthConsent.missingTicket'));
      return;
    }
    apiFetch<ConsentDescription>(`/oauth/consent/${encodeURIComponent(ticket)}`)
      .then(setDescription)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : String(err)));
  }, [ticket, t]);

  const decide = async (decision: 'allow' | 'deny') => {
    setDeciding(true);
    try {
      const { redirectUrl } = await apiFetch<{ redirectUrl: string }>('/oauth/consent/decision', {
        method: 'POST',
        body: { ticket, decision },
      });
      window.location.href = redirectUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setDeciding(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'grey.100',
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 440, width: '100%' }}>
        <CardContent>
          <Stack spacing={2} alignItems="center" textAlign="center">
            <DelegacaoCampoLogo sx={{ height: 48 }} />
            {error && <Alert severity="error">{error}</Alert>}
            {!error && !description && <CircularProgress />}
            {!error && description && (
              <>
                <SmartToyIcon color="action" sx={{ fontSize: 40 }} />
                <Typography variant="h6">
                  {t('oauthConsent.title', { client: description.clientName })}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('oauthConsent.explanation')}
                </Typography>
                <Stack spacing={0.5} alignItems="flex-start" sx={{ width: '100%', pl: 1 }}>
                  {description.scopes.map((scope) => (
                    <Typography key={scope} variant="body2">
                      • {SCOPE_LABEL_KEY[scope] ? t(SCOPE_LABEL_KEY[scope]) : scope}
                    </Typography>
                  ))}
                </Stack>
                <Stack direction="row" spacing={2} sx={{ width: '100%', pt: 1 }}>
                  <Button fullWidth variant="outlined" disabled={deciding} onClick={() => decide('deny')}>
                    {t('oauthConsent.deny')}
                  </Button>
                  <Button fullWidth variant="contained" disabled={deciding} onClick={() => decide('allow')}>
                    {t('oauthConsent.allow')}
                  </Button>
                </Stack>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};
