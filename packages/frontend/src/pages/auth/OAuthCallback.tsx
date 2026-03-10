import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircularProgress, Box, Typography } from '@mui/material';

const TOKEN_KEY = 'redinfo_access_token';
const REFRESH_KEY = 'redinfo_refresh_token';

/**
 * Handles the OAuth redirect callback.
 * The backend redirects to /auth/callback?accessToken=...&refreshToken=...
 * We persist the tokens and redirect to the home page.
 */
export const OAuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');

    if (accessToken && refreshToken) {
      localStorage.setItem(TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_KEY, refreshToken);
      navigate('/', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 2,
      }}
    >
      <CircularProgress color="primary" />
      <Typography variant="body1" color="text.secondary">
        Signing you in…
      </Typography>
    </Box>
  );
};
