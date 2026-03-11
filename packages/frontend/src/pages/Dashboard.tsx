import { Card, CardContent, Typography, Box } from '@mui/material';
import { DelegacaoCampoLogo } from '../components/DelegacaoCampoLogo';

export const Dashboard = () => (
  <Box sx={{ mt: 2 }}>
    <Card>
      <CardContent sx={{ textAlign: 'center', py: 6 }}>
        <DelegacaoCampoLogo
          sx={{
            maxWidth: { xs: 160, sm: 220 },
            height: 'auto',
            mb: 3,
            borderRadius: 1,
          }}
        />
        <Typography variant="h4" gutterBottom fontWeight={700}>
          Bem-vindo ao RedInfo
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Sistema de informação da Cruz Vermelha Portuguesa – Delegação de Campo.
        </Typography>
      </CardContent>
    </Card>
  </Box>
);
