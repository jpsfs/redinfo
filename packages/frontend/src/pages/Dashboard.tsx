import { Card, CardContent, Typography, Box } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';

export const Dashboard = () => (
  <Box sx={{ mt: 2 }}>
    <Card>
      <CardContent sx={{ textAlign: 'center', py: 6 }}>
        <FavoriteIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
        <Typography variant="h4" gutterBottom fontWeight={700}>
          Welcome to RedInfo
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Information system for Cruz Vermelha Portuguesa – local branch.
        </Typography>
      </CardContent>
    </Card>
  </Box>
);
