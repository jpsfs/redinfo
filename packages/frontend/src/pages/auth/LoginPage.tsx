import { Login, LoginForm } from 'react-admin';
import { Box, Divider, Button, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import MicrosoftIcon from '@mui/icons-material/Window';
import { DelegacaoCampoLogo } from '../../components/DelegacaoCampoLogo';

const API_URL = import.meta.env.VITE_API_URL ?? '';

const LoginHeader = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      pt: 3,
      pb: 1,
      px: 2,
    }}
  >
    <DelegacaoCampoLogo
      sx={{
        maxWidth: 200,
        height: 'auto',
        mb: 2,
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
      Cruz Vermelha Portuguesa — Delegação de Campo
    </Typography>
  </Box>
);

const OAuthButtons = () => (
  <Box sx={{ px: 2, pb: 3 }}>
    <Divider sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary">
        ou entrar com
      </Typography>
    </Divider>
    <Button
      fullWidth
      variant="outlined"
      startIcon={<GoogleIcon />}
      href={`${API_URL}/auth/google`}
      sx={{ mb: 1, textTransform: 'none' }}
      aria-label="Entrar com Google"
    >
      Google
    </Button>
    <Button
      fullWidth
      variant="outlined"
      startIcon={<MicrosoftIcon />}
      href={`${API_URL}/auth/microsoft`}
      sx={{ textTransform: 'none' }}
      aria-label="Entrar com Microsoft"
    >
      Microsoft
    </Button>
  </Box>
);

export const LoginPage = () => (
  <Login>
    <LoginHeader />
    <LoginForm />
    <OAuthButtons />
  </Login>
);
