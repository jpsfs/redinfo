import {
  Card,
  CardContent,
  Typography,
  Box,
  Alert,
  Chip,
  Stack,
  Divider,
  CircularProgress,
} from '@mui/material';
import { DelegacaoCampoLogo } from '../components/DelegacaoCampoLogo';
import { useGetList, Link } from 'react-admin';
import { useEffect, useState } from 'react';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';

const API_URL = import.meta.env.VITE_API_URL ?? '';

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

interface LowStockVehicle {
  vehicle: {
    id: string;
    licensePlate: string;
    numeroCauda: string;
    vehicleType: 'EMERGENCY' | 'TRANSPORT';
  };
  hasLowStock: boolean;
  lowStockItems: Array<{
    templateItem: { name: string; recommendedQuantity: number | null; unit: string };
    vehicleInventoryItem: { actualQuantity: number | null } | null;
  }>;
}

const LowStockPanel = () => {
  const [data, setData] = useState<{ grouped: Record<string, LowStockVehicle[]>; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth')
      ? JSON.parse(localStorage.getItem('auth') ?? '{}').accessToken
      : null;
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${API_URL}/vehicles/low-stock`, { headers })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <CircularProgress size={20} sx={{ mt: 2 }} />;
  if (!data || data.total === 0) return null;

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <InventoryIcon color="error" />
          <Typography variant="h6" fontWeight={700} color="error">
            Low Stock Vehicles ({data.total})
          </Typography>
        </Box>
        <Stack spacing={1.5} divider={<Divider flexItem />}>
          {Object.entries(data.grouped).flatMap(([, vehicles]) =>
            vehicles.map((item) => (
              <Box
                key={item.vehicle.id}
                component={Link}
                to={`/vehicles/${item.vehicle.id}/show`}
                sx={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  {item.vehicle.vehicleType === 'EMERGENCY' ? (
                    <DirectionsCarIcon fontSize="small" color="error" />
                  ) : (
                    <LocalShippingIcon fontSize="small" color="primary" />
                  )}
                  <Typography variant="body2" fontWeight={600}>
                    {item.vehicle.licensePlate} – {item.vehicle.numeroCauda}
                  </Typography>
                  {item.lowStockItems.slice(0, 3).map((li, idx) => (
                    <Chip
                      key={idx}
                      size="small"
                      color="error"
                      variant="outlined"
                      label={`${li.templateItem.name}: ${li.vehicleInventoryItem?.actualQuantity ?? 0}/${li.templateItem.recommendedQuantity} ${li.templateItem.unit}`}
                    />
                  ))}
                  {item.lowStockItems.length > 3 && (
                    <Chip size="small" label={`+${item.lowStockItems.length - 3} more`} variant="outlined" />
                  )}
                </Box>
              </Box>
            )),
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

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
    <LowStockPanel />
    <Alert severity="info" sx={{ mt: 2 }}>
      Vehicles with insurance or IMT inspection dates within{' '}
      <strong>{DAYS_WARN} days</strong> are flagged above.
    </Alert>
  </Box>
);
