import { useState, useEffect } from 'react';
import { useRecordContext, useNotify } from 'react-admin';
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Chip,
  TextField,
  IconButton,
  Tooltip,
  CircularProgress,
  Button,
  Alert,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import { useT } from '../../i18n/useT';

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface TemplateItem {
  id: string;
  name: string;
  type: 'COUNTABLE' | 'UNLIMITED';
  recommendedQuantity: number | null;
  unit: string;
  notes: string | null;
  order: number;
}

interface VehicleInventoryItem {
  id: string;
  vehicleId: string;
  templateItemId: string;
  actualQuantity: number | null;
  templateVersion: number;
}

interface InventoryRow {
  templateItem: TemplateItem;
  vehicleInventoryItem: VehicleInventoryItem | null;
  status: 'low' | 'ok' | 'over' | 'unlimited';
}

interface VehicleInventoryData {
  vehicleId: string;
  vehicleType: string;
  template: { id: string; version: number } | null;
  rows: InventoryRow[];
  hasLowStock: boolean;
}

function statusColor(status: string): string {
  if (status === 'low') return '#ffebee';
  if (status === 'over') return '#e8f5e9';
  return 'inherit';
}

function statusBorderColor(status: string): string {
  if (status === 'low') return '#ef9a9a';
  if (status === 'over') return '#a5d6a7';
  return 'transparent';
}

export const VehicleInventorySection = () => {
  const t = useT();
  const record = useRecordContext<{ id: string; vehicleType: string }>();
  const notify = useNotify();

  const [inventory, setInventory] = useState<VehicleInventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const fetchInventory = async () => {
    if (!record?.id) return;
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('auth')
        ? JSON.parse(localStorage.getItem('auth') ?? '{}').accessToken
        : null;
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/vehicle-inventory/by-vehicle/${record.id}`, { headers });
      if (!res.ok) throw new Error('Failed to load inventory');
      const data = await res.json();
      setInventory(data);
    } catch {
      setError(t('vehicleInventory.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  const handleSave = async (templateItemId: string, vehicleInventoryItemId: string | null) => {
    if (!record?.id) return;
    const rawValue = editValues[templateItemId];
    if (rawValue === undefined) return;

    const actualQuantity = rawValue === '' ? null : parseInt(rawValue, 10);
    if (rawValue !== '' && isNaN(actualQuantity as number)) {
      notify(t('vehicleInventory.invalidQuantity'), { type: 'error' });
      return;
    }

    setSavingIds((prev) => new Set(prev).add(templateItemId));
    try {
      const token = localStorage.getItem('auth')
        ? JSON.parse(localStorage.getItem('auth') ?? '{}').accessToken
        : null;
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      if (vehicleInventoryItemId) {
        await fetch(`${API_URL}/vehicle-inventory/${vehicleInventoryItemId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ actualQuantity }),
        });
      } else {
        await fetch(`${API_URL}/vehicle-inventory`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ vehicleId: record.id, templateItemId, actualQuantity }),
        });
      }

      notify(t('vehicleInventory.updated'), { type: 'success' });
      setEditValues((prev) => {
        const next = { ...prev };
        delete next[templateItemId];
        return next;
      });
      await fetchInventory();
    } catch {
      notify(t('vehicleInventory.updateFailed'), { type: 'error' });
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(templateItemId);
        return next;
      });
    }
  };

  if (loading) return <CircularProgress size={24} sx={{ my: 2 }} />;
  if (error) return <Alert severity="warning" sx={{ my: 1 }}>{error}</Alert>;
  if (!inventory?.template) {
    const vehicleTypeText = record?.vehicleType
      ? t(`vehicleType.${record.vehicleType}` as 'vehicleType.EMERGENCY' | 'vehicleType.TRANSPORT')
      : t('vehicleInventory.thisVehicleType');
    return (
      <Alert severity="info" sx={{ my: 1 }}>
        {t('vehicleInventory.noTemplate', { type: vehicleTypeText })}
      </Alert>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6">{t('vehicleInventory.heading')}</Typography>
          {inventory.hasLowStock && (
            <Chip label={t('vehicleInventory.lowStock')} color="error" size="small" />
          )}
          <Chip
            label={t('vehicleInventory.templateVersion', { version: inventory.template.version })}
            size="small"
            variant="outlined"
          />
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadIcon />}
          href={`${API_URL}/vehicle-inventory/by-vehicle/${record?.id}/csv`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('inventoryTemplateShow.exportCsv')}
        </Button>
      </Box>

      {inventory.rows.length === 0 ? (
        <Alert severity="info">{t('vehicleInventory.noItems')}</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: 'grey.100' }}>
                <TableCell><strong>{t('vehicleInventory.colItem')}</strong></TableCell>
                <TableCell><strong>{t('vehicleInventory.colType')}</strong></TableCell>
                <TableCell align="right"><strong>{t('vehicleInventory.colRecommended')}</strong></TableCell>
                <TableCell align="right"><strong>{t('vehicleInventory.colActual')}</strong></TableCell>
                <TableCell><strong>{t('vehicleInventory.colUnit')}</strong></TableCell>
                <TableCell><strong>{t('vehicleInventory.colStatus')}</strong></TableCell>
                <TableCell><strong>{t('vehicleInventory.colAction')}</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {inventory.rows.map((row) => {
                const isEditing = editValues[row.templateItem.id] !== undefined;
                const isSaving = savingIds.has(row.templateItem.id);
                const currentActual = row.vehicleInventoryItem?.actualQuantity;
                const editValue =
                  editValues[row.templateItem.id] ??
                  (currentActual !== null && currentActual !== undefined
                    ? String(currentActual)
                    : '');

                return (
                  <TableRow
                    key={row.templateItem.id}
                    sx={{
                      backgroundColor: statusColor(row.status),
                      borderLeft: `3px solid ${statusBorderColor(row.status)}`,
                    }}
                  >
                    <TableCell>
                      <Box>
                        <Typography variant="body2">{row.templateItem.name}</Typography>
                        {row.templateItem.notes && (
                          <Typography variant="caption" color="text.secondary">
                            {row.templateItem.notes}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {row.templateItem.type === 'UNLIMITED' ? (
                        <Chip
                          size="small"
                          label={t('inventoryTemplateShow.unlimited')}
                          color="secondary"
                          variant="outlined"
                        />
                      ) : (
                        <Chip size="small" label={t('inventoryTemplateShow.countable')} variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {row.templateItem.type === 'UNLIMITED' ? (
                        <Chip
                          size="small"
                          label={t('vehicleInventory.infinity')}
                          color="secondary"
                          variant="outlined"
                        />
                      ) : (
                        <Typography variant="body2">
                          {row.templateItem.recommendedQuantity ?? 0}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {row.templateItem.type === 'UNLIMITED' ? (
                        <TextField
                          size="small"
                          type="text"
                          placeholder={t('vehicleInventory.presentPlaceholder')}
                          value={editValue}
                          onChange={(e) =>
                            setEditValues((prev) => ({
                              ...prev,
                              [row.templateItem.id]: e.target.value,
                            }))
                          }
                          sx={{ width: 100 }}
                          inputProps={{ style: { textAlign: 'center' } }}
                        />
                      ) : (
                        <TextField
                          size="small"
                          type="number"
                          inputProps={{ min: 0, style: { textAlign: 'right', width: 60 } }}
                          value={editValue}
                          onChange={(e) =>
                            setEditValues((prev) => ({
                              ...prev,
                              [row.templateItem.id]: e.target.value,
                            }))
                          }
                          sx={{ width: 80 }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.templateItem.unit}</Typography>
                    </TableCell>
                    <TableCell>
                      {row.status === 'low' && (
                        <Chip size="small" label={t('vehicleInventory.statusLow')} color="error" />
                      )}
                      {row.status === 'ok' && (
                        <Chip size="small" label={t('vehicleInventory.statusOk')} color="success" />
                      )}
                      {row.status === 'over' && (
                        <Chip
                          size="small"
                          label={t('vehicleInventory.statusAboveRec')}
                          color="success"
                          variant="outlined"
                        />
                      )}
                      {row.status === 'unlimited' && (
                        <Chip
                          size="small"
                          label={t('inventoryTemplateShow.unlimited')}
                          color="secondary"
                          variant="outlined"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing && (
                        <Tooltip title={t('vehicleInventory.saveQuantityTooltip')}>
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() =>
                              handleSave(
                                row.templateItem.id,
                                row.vehicleInventoryItem?.id ?? null,
                              )
                            }
                            disabled={isSaving}
                          >
                            {isSaving ? (
                              <CircularProgress size={16} />
                            ) : (
                              <SaveIcon fontSize="small" />
                            )}
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};
