import { useState } from 'react';
import { Box, SxProps, Theme } from '@mui/material';
import {
  logoDelegacaoCampoUrl,
  logoFallbackSize,
  logoRedCrossEmblemPath,
} from '../layout/design-tokens';

interface DelegacaoCampoLogoProps {
  /** MUI sx overrides for the img element */
  sx?: SxProps<Theme>;
}

/**
 * Full-size Delegação de Campo logotype.
 * Falls back to the local Red Cross emblem SVG when the remote source is unavailable.
 */
export const DelegacaoCampoLogo = ({ sx }: DelegacaoCampoLogoProps) => {
  const [useFallback, setUseFallback] = useState(false);

  return (
    <Box
      component="img"
      src={useFallback ? logoRedCrossEmblemPath : logoDelegacaoCampoUrl}
      alt="Cruz Vermelha Portuguesa – Delegação de Campo"
      onError={() => setUseFallback(true)}
      sx={useFallback ? [{ width: logoFallbackSize }, sx] : sx}
    />
  );
};
