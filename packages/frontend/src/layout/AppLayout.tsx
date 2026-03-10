import { Layout, LayoutProps, AppBar, TitlePortal } from 'react-admin';
import { Box, Typography } from '@mui/material';

const RedInfoAppBar = () => (
  <AppBar>
    <TitlePortal />
    <Box sx={{ flex: 1 }} />
    <Typography variant="body2" sx={{ opacity: 0.85, mr: 1 }}>
      Cruz Vermelha Portuguesa
    </Typography>
  </AppBar>
);

export const AppLayout = (props: LayoutProps) => (
  <Layout {...props} appBar={RedInfoAppBar} />
);
