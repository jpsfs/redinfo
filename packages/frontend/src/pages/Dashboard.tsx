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
import { useGetList, Link, usePermissions } from 'react-admin';
import { useEffect, useState } from 'react';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import AssignmentLateIcon from '@mui/icons-material/AssignmentLate';
import { Action, hasPermission, UserRole } from '@redinfo/shared';
import { apiFetch } from '../api';
import { useIntlLocale } from '../i18n/useIntlLocale';
import { useT } from '../i18n/useT';
import { LiveRunBoard } from '../resources/liveRuns';

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

interface LowStockResponse {
  grouped: Record<string, LowStockVehicle[]>;
  total: number;
}

const LowStockPanel = () => {
  const t = useT();
  const [data, setData] = useState<LowStockResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Was reading the bearer token out of a `localStorage['auth']` key that
    // has never existed in this app (the token lives under the key
    // `authProvider.ts` uses) — every request 401'd, and the panel then threw
    // trying to read `.grouped` off the error body, taking the whole
    // Dashboard down. `apiFetch` is the one place that knows where the token
    // actually is, and rejects on a non-2xx instead of resolving to it.
    apiFetch<LowStockResponse>('/vehicles/low-stock')
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
            {t('dashboard.lowStockTitle', { count: data.total })}
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
                    <Chip
                      size="small"
                      label={t('dashboard.moreItems', { count: item.lowStockItems.length - 3 })}
                      variant="outlined"
                    />
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

interface CertificationAlerts {
  expiring: number;
  expired: number;
}

const certificationFilterLink = (status: 'EXPIRING' | 'EXPIRED') =>
  `/users?filter=${encodeURIComponent(JSON.stringify({ certificationStatus: status }))}`;

/**
 * Coordinators/admins only — a plain operational already sees their own
 * lapsed certifications on `MyProfilePage`. Backed by
 * `GET /users/certification-alerts`, which counts *people*, not
 * certifications, the same way the personnel registry's own
 * `certificationStatus` filter does — so the numbers here always match what
 * clicking through actually lists.
 */
export const CertificationAlertsTile = () => {
  const t = useT();
  const { permissions, isLoading } = usePermissions<UserRole[]>();
  const [alerts, setAlerts] = useState<CertificationAlerts | null>(null);
  const canView = Boolean(permissions && hasPermission(permissions, Action.MANAGE_PERSONNEL));

  useEffect(() => {
    if (!canView) return;
    apiFetch<CertificationAlerts>('/users/certification-alerts')
      .then(setAlerts)
      .catch(() => setAlerts(null));
  }, [canView]);

  if (isLoading || !canView || !alerts || (alerts.expired === 0 && alerts.expiring === 0)) return null;

  return (
    <Card sx={{ mt: 2 }} data-testid="certification-alerts-tile">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AssignmentLateIcon color="warning" />
          <Typography variant="h6" fontWeight={700}>
            {t('dashboard.certificationsTitle')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          {alerts.expired > 0 && (
            <Box component={Link} to={certificationFilterLink('EXPIRED')} sx={{ textDecoration: 'none' }}>
              <Chip
                color="error"
                label={t('dashboard.certExpiredCount', { smart_count: alerts.expired })}
                clickable
              />
            </Box>
          )}
          {alerts.expiring > 0 && (
            <Box component={Link} to={certificationFilterLink('EXPIRING')} sx={{ textDecoration: 'none' }}>
              <Chip
                color="warning"
                label={t('dashboard.certExpiringCount', { smart_count: alerts.expiring })}
                clickable
              />
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

const UpcomingAlertsPanel = () => {
  const t = useT();
  const intlLocale = useIntlLocale();
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
            {t('dashboard.renewalsTitle', { count: flagged.length })}
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
                    label={`${t('dashboard.insuranceLabel')}: ${new Date(v.insuranceRenewalDate).toLocaleDateString(intlLocale)}${isOverdue(v.insuranceRenewalDate) ? t('vehicleShow.overdueSuffix') : ''}`}
                    variant="outlined"
                  />
                )}
                {(isOverdue(v.nextImtInspectionDate) ||
                  isExpiringSoon(v.nextImtInspectionDate)) && (
                  <Chip
                    size="small"
                    color={isOverdue(v.nextImtInspectionDate) ? 'error' : 'warning'}
                    label={`IMT: ${new Date(v.nextImtInspectionDate).toLocaleDateString(intlLocale)}${isOverdue(v.nextImtInspectionDate) ? t('vehicleShow.overdueSuffix') : ''}`}
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

export const Dashboard = () => {
  const t = useT();
  return (
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
          {t('dashboard.welcomeTitle')}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {t('dashboard.welcomeSubtitle')}
        </Typography>
      </CardContent>
    </Card>
    {/* First, and above the maintenance panels: an emergency being run right now
        outranks an insurance renewal in three weeks. Renders nothing at all when
        there are no open runs, or when the reader has no oversight permission. */}
    <Box sx={{ mt: 2 }}>
      <LiveRunBoard />
    </Box>
    <CertificationAlertsTile />
    <UpcomingAlertsPanel />
    <LowStockPanel />
    <Alert severity="info" sx={{ mt: 2 }}>
      {t('dashboard.warningPrefix')}{' '}
      <strong>
        {DAYS_WARN} {t('dashboard.daysUnit')}
      </strong>{' '}
      {t('dashboard.warningSuffix')}
    </Alert>
  </Box>
  );
};
