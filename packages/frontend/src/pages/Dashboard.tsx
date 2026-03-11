import {
  Card,
  CardContent,
  Typography,
  Box,
  Alert,
  Chip,
  Stack,
  Divider,
} from '@mui/material';
import { DelegacaoCampoLogo } from '../components/DelegacaoCampoLogo';
import { useGetList, Link } from 'react-admin';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';

const DAYS_WARN = 30;

function isExpiringSoon(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const target = new Date(dateStr);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= DAYS_WARN * 24 * 60 * 60 * 1000;
}

function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

interface VehicleRecord {
  id: string;
  licensePlate: string;
  numeroCauda: string;
  vehicleType: 'EMERGENCY' | 'TRANSPORT';
  insuranceRenewalDate: string;
  nextImtInspectionDate: string;
}

const UpcomingAlertsPanel = () => {
  const { data: vehicles, isLoading } = useGetList<VehicleRecord>('vehicles', {
    pagination: { page: 1, perPage: 100 },
    sort: { field: 'insuranceRenewalDate', order: 'ASC' },
  });

  if (isLoading || !vehicles) return null;

  const flagged = vehicles.filter(
    (v) =>
      isOverdue(v.insuranceRenewalDate) ||
      isExpiringSoon(v.insuranceRenewalDate) ||
      isOverdue(v.nextImtInspectionDate) ||
      isExpiringSoon(v.nextImtInspectionDate),
  );

  if (flagged.length === 0) return null;

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <WarningAmberIcon color="warning" />
          <Typography variant="h6" fontWeight={700}>
            Upcoming Renewals & Inspections ({flagged.length})
          </Typography>
        </Box>
        <Stack spacing={1.5} divider={<Divider flexItem />}>
          {flagged.map((v) => (
            <Box
              key={v.id}
              component={Link}
              to={`/vehicles/${v.id}/show`}
              sx={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                {v.vehicleType === 'EMERGENCY' ? (
                  <DirectionsCarIcon fontSize="small" color="error" />
                ) : (
                  <LocalShippingIcon fontSize="small" color="primary" />
                )}
                <Typography variant="body2" fontWeight={600}>
                  {v.licensePlate} – {v.numeroCauda}
                </Typography>
                {(isOverdue(v.insuranceRenewalDate) ||
                  isExpiringSoon(v.insuranceRenewalDate)) && (
                  <Chip
                    size="small"
                    color={isOverdue(v.insuranceRenewalDate) ? 'error' : 'warning'}
                    label={`Insurance: ${new Date(v.insuranceRenewalDate).toLocaleDateString('pt-PT')}${isOverdue(v.insuranceRenewalDate) ? ' ⚠ OVERDUE' : ''}`}
                    variant="outlined"
                  />
                )}
                {(isOverdue(v.nextImtInspectionDate) ||
                  isExpiringSoon(v.nextImtInspectionDate)) && (
                  <Chip
                    size="small"
                    color={isOverdue(v.nextImtInspectionDate) ? 'error' : 'warning'}
                    label={`IMT: ${new Date(v.nextImtInspectionDate).toLocaleDateString('pt-PT')}${isOverdue(v.nextImtInspectionDate) ? ' ⚠ OVERDUE' : ''}`}
                    variant="outlined"
                  />
                )}
              </Box>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
};

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
    <UpcomingAlertsPanel />
    <Alert severity="info" sx={{ mt: 2 }}>
      Vehicles with insurance or IMT inspection dates within{' '}
      <strong>{DAYS_WARN} days</strong> are flagged above.
    </Alert>
  </Box>
);
