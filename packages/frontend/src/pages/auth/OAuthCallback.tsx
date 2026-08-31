import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircularProgress, Box, Typography } from '@mui/material';
import { setTokens } from '../../authStorage';

/**
 * Handles the OAuth redirect callback.
 * The backend redirects to /auth/callback?accessToken=...&refreshToken=...&remember=...
 * We persist the tokens (per the "keep me signed in" choice carried through
 * the OAuth round-trip via `remember` — see `GoogleAuthGuard`'s doc comment)
 * and redirect to the home page.
 */
export const OAuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const remember = params.get('remember') !== 'false';

    if (accessToken && refreshToken) {
      setTokens(accessToken, refreshToken, remember);
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
