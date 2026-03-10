import { Login, LoginForm } from 'react-admin';
import { Box, Divider, Button, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import MicrosoftIcon from '@mui/icons-material/Window';

const API_URL = import.meta.env.VITE_API_URL ?? '';

const OAuthButtons = () => (
  <Box sx={{ px: 2, pb: 2 }}>
    <Divider sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary">
        or sign in with
      </Typography>
    </Divider>
    <Button
      fullWidth
      variant="outlined"
      startIcon={<GoogleIcon />}
      href={`${API_URL}/auth/google`}
      sx={{ mb: 1, textTransform: 'none' }}
    >
      Google
    </Button>
    <Button
      fullWidth
      variant="outlined"
      startIcon={<MicrosoftIcon />}
      href={`${API_URL}/auth/microsoft`}
      sx={{ textTransform: 'none' }}
    >
      Microsoft
    </Button>
  </Box>
);

export const LoginPage = () => (
  <Login>
    <LoginForm />
    <OAuthButtons />
  </Login>
);
