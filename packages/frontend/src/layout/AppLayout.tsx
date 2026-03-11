import { Layout, LayoutProps, AppBar, TitlePortal } from 'react-admin';
import { Box } from '@mui/material';
import { logoRedCrossEmblemPath } from './design-tokens';

const RedInfoAppBar = () => (
  <AppBar>
    <Box
      component="img"
      src={logoRedCrossEmblemPath}
      alt="Cruz Vermelha Portuguesa"
      aria-label="Cruz Vermelha Portuguesa emblem"
      sx={{ height: 32, width: 32, mr: 1.5, flexShrink: 0 }}
    />
    <TitlePortal />
    <Box sx={{ flex: 1 }} />
  </AppBar>
);

export const AppLayout = (props: LayoutProps) => (
  <Layout {...props} appBar={RedInfoAppBar} />
);
