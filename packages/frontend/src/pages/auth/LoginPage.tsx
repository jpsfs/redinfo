import { useEffect, useState, ChangeEvent } from 'react';
import { Login, LoginForm, TextInput, PasswordInput, BooleanInput, required, useNotify } from 'react-admin';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Divider, Button, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import MicrosoftIcon from '@mui/icons-material/Window';
import { DelegacaoCampoLogo } from '../../components/DelegacaoCampoLogo';
import { useT } from '../../i18n/useT';

const API_URL = import.meta.env.VITE_API_URL ?? '';

const LoginHeader = () => {
  const t = useT();
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pt: { xs: 1.5, sm: 3 },
        pb: 1,
        px: 2,
      }}
    >
      <DelegacaoCampoLogo
        sx={{
          // Smaller on every size, not just mobile — 200px read as oversized
          // next to the rest of the card even on desktop.
          maxWidth: { xs: 96, sm: 120 },
          height: 'auto',
          mb: { xs: 1, sm: 1.5 },
          borderRadius: 1,
        }}
      />
      <Typography
        variant="h6"
        component="h1"
        fontWeight={700}
        textAlign="center"
        color="text.primary"
        gutterBottom
      >
        RedInfo
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        textAlign="center"
        sx={{ mb: 1 }}
      >
        {t('login.orgName')}
      </Typography>
    </Box>
  );
};

/**
 * "Keep me signed in" applies to both the password form below and the OAuth
 * buttons — `remember` is lifted here rather than owned by either so one
 * checkbox governs both. `BooleanInput` keeps it registered on the form (so
 * a password sign-in submits it as part of `values`, see
 * `authProvider.login`), and `onChange` mirrors the same value out to
 * `OAuthButtons`, which can't have it as a form field since it never
 * submits — it just links straight to the backend.
 */
const RememberMeInput = ({ onRememberChange }: { onRememberChange: (remember: boolean) => void }) => {
  const t = useT();
  return (
    <BooleanInput
      source="remember"
      label={t('login.keepMeSignedIn')}
      helperText={t('login.keepMeSignedInHint')}
      defaultValue={true}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onRememberChange(event.target.checked)}
      sx={{ mt: -1 }}
    />
  );
};

const OAuthButtons = ({ remember }: { remember: boolean }) => {
  const t = useT();
  const rememberParam = `remember=${remember}`;
  return (
    <Box sx={{ px: 2, pb: { xs: 2, sm: 3 } }}>
      <Divider sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary">
          {t('login.orSignInWith')}
        </Typography>
      </Divider>
      <Button
        fullWidth
        variant="outlined"
        startIcon={<GoogleIcon />}
        href={`${API_URL}/auth/google?${rememberParam}`}
        sx={{ mb: 1, textTransform: 'none' }}
        aria-label={t('login.signInWithGoogle')}
      >
        Google
      </Button>
      <Button
        fullWidth
        variant="outlined"
        startIcon={<MicrosoftIcon />}
        href={`${API_URL}/auth/microsoft?${rememberParam}`}
        sx={{ textTransform: 'none' }}
        aria-label={t('login.signInWithMicrosoft')}
      >
        Microsoft
      </Button>
    </Box>
  );
};

/**
 * Whether the password form should show at all — `DISABLE_LOCAL_LOGIN` is a
 * server-side kill switch (no MFA on that path), so the frontend has to ask
 * rather than assume. A single global boolean, not tied to any account, so
 * unlike a per-email lookup it carries no enumeration risk. Defaults to
 * `true` while loading so the form doesn't flash in and back out on the
 * common case (enabled).
 */
function useLocalLoginEnabled(): boolean {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/auth/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.localLoginEnabled === 'boolean') {
          setEnabled(data.localLoginEnabled);
        }
      })
      .catch(() => {
        // Backend unreachable — leave the form up rather than locking
        // someone out of the only sign-in method that might still work.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}

export const LoginPage = () => {
  const t = useT();
  const notify = useNotify();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [remember, setRemember] = useState(true);
  const localLoginEnabled = useLocalLoginEnabled();

  useEffect(() => {
    // The backend sends this flash param inside the fragment
    // (`/#/login?error=...`, see `AuthController.frontendRoute`), so the
    // router's search is where it normally shows up. `window.location.search`
    // is the fallback for a backend still redirecting to the bare path.
    const hasError = [search, window.location.search].some(
      (qs) => new URLSearchParams(qs).get('error') === 'oauth_account_not_found',
    );
    if (!hasError) return;

    notify(t('login.oauthAccountNotFound'), { type: 'error' });
    // One-shot flash param — strip it from both places so a manual refresh
    // doesn't re-show it. Never touch the hash here: it *is* the route.
    navigate('/login', { replace: true });
    if (window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    }
  }, [notify, t, navigate, search]);

  return (
    <Login>
      <LoginHeader />
      {localLoginEnabled ? (
        <LoginForm>
          <TextInput
            autoFocus
            source="username"
            label={t('ra.auth.username')}
            autoComplete="username"
            validate={required()}
          />
          <PasswordInput
            source="password"
            label={t('ra.auth.password')}
            autoComplete="current-password"
            validate={required()}
          />
          <RememberMeInput onRememberChange={setRemember} />
        </LoginForm>
      ) : (
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ px: 2, mb: 1 }}>
          {t('login.localLoginDisabled')}
        </Typography>
      )}
      <OAuthButtons remember={remember} />
    </Login>
  );
};
