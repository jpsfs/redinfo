import { useState, ChangeEvent } from 'react';
import { Login, LoginForm, TextInput, PasswordInput, BooleanInput, required } from 'react-admin';
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
        pt: { xs: 2, sm: 3 },
        pb: 1,
        px: 2,
      }}
    >
      <DelegacaoCampoLogo
        sx={{
          maxWidth: 200,
          height: 'auto',
          mb: { xs: 1, sm: 2 },
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

export const LoginPage = () => {
  const t = useT();
  const [remember, setRemember] = useState(true);

  return (
    <Login>
      <LoginHeader />
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
      <OAuthButtons remember={remember} />
    </Login>
  );
};
