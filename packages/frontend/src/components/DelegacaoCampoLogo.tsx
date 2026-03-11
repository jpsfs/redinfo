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
export const DelegacaoCampoLogo = ({ sx }: DelegacaoCampoLogoProps) => (
  <Box
    component="img"
    src={logoDelegacaoCampoUrl}
    alt="Cruz Vermelha Portuguesa – Delegação de Campo"
    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget as HTMLImageElement;
      img.src = logoRedCrossEmblemPath;
      img.style.width = `${logoFallbackSize}px`;
    }}
    sx={sx}
  />
);
