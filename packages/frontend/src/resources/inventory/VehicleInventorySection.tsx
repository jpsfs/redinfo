import { useCallback, useEffect, useState } from 'react';
import { useRecordContext, useNotify, useLocaleState } from 'react-admin';
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
  Link,
  Pagination,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import DownloadIcon from '@mui/icons-material/Download';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Locale, MaterialItem, materialItemDisplayName, StockMovementReason } from '@redinfo/shared';
import { apiFetch } from '../../api';
import { useT } from '../../i18n/useT';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const MOVEMENTS_PER_PAGE = 10;

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
  /// Set when a `StockMovement` deduction floored this row at zero — see
  /// `vehicleInventory.needsRecountTooltip`.
  needsRecount: boolean;
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

interface MovementActor {
  id: string;
  firstName: string;
  lastName: string;
}

interface MovementRow {
  id: string;
  materialItemId: string;
  materialItem: Pick<MaterialItem, 'namePt' | 'nameEn'> | null;
  delta: number;
  reason: StockMovementReason;
  reportId: string | null;
  actor: MovementActor | null;
  occurredAt: string;
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

function reasonLabelKey(reason: StockMovementReason) {
  switch (reason) {
    case StockMovementReason.CONSUMPTION:
      return 'vehicleInventory.reasonConsumption' as const;
    case StockMovementReason.MANUAL_ADJUSTMENT:
      return 'vehicleInventory.reasonManualAdjustment' as const;
    case StockMovementReason.IMPORT:
      return 'vehicleInventory.reasonImport' as const;
    case StockMovementReason.CORRECTION:
      return 'vehicleInventory.reasonCorrection' as const;
  }
}

export const VehicleInventorySection = () => {
  const t = useT();
  const [locale] = useLocaleState();
  const record = useRecordContext<{ id: string; vehicleType: string }>();
  const notify = useNotify();

  const [inventory, setInventory] = useState<VehicleInventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [movementsPage, setMovementsPage] = useState(1);
  const [movementsLoading, setMovementsLoading] = useState(true);
  const [movementsError, setMovementsError] = useState<string | null>(null);

  const fetchInventory = useCallback(async () => {
    if (!record?.id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<VehicleInventoryData>(`/vehicle-inventory/by-vehicle/${record.id}`);
      setInventory(data);
    } catch {
      setError(t('vehicleInventory.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [record?.id, t]);

  const fetchMovements = useCallback(
    async (page: number) => {
      if (!record?.id) return;
      try {
        setMovementsLoading(true);
        setMovementsError(null);
        const result = await apiFetch<{ data: MovementRow[]; total: number }>(
          `/vehicle-inventory/by-vehicle/${record.id}/movements?page=${page}&perPage=${MOVEMENTS_PER_PAGE}`,
        );
        setMovements(result.data);
        setMovementsTotal(result.total);
        setMovementsPage(page);
      } catch {
        setMovementsError(t('vehicleInventory.movementsLoadFailed'));
      } finally {
        setMovementsLoading(false);
      }
    },
    [record?.id, t],
  );

  useEffect(() => {
    fetchInventory();
    fetchMovements(1);
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
      if (vehicleInventoryItemId) {
        await apiFetch(`/vehicle-inventory/${vehicleInventoryItemId}`, {
          method: 'PATCH',
          body: { actualQuantity },
        });
      } else {
        await apiFetch('/vehicle-inventory', {
          method: 'POST',
          body: { vehicleId: record.id, templateItemId, actualQuantity },
        });
      }

      notify(t('vehicleInventory.updated'), { type: 'success' });
      setEditValues((prev) => {
        const next = { ...prev };
        delete next[templateItemId];
        return next;
      });
      await fetchInventory();
      // A manual quantity edit also writes a `MANUAL_ADJUSTMENT` movement
      // (see `StockMovementsService.recordManualAdjustment`) — refresh so
      // the panel below reflects it without a full page reload.
      await fetchMovements(1);
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
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
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
                        {row.vehicleInventoryItem?.needsRecount && (
                          <Tooltip title={t('vehicleInventory.needsRecountTooltip')}>
                            <Chip
                              size="small"
                              icon={<WarningAmberIcon fontSize="small" />}
                              label={t('vehicleInventory.needsRecount')}
                              color="warning"
                            />
                          </Tooltip>
                        )}
                      </Box>
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

      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          {t('vehicleInventory.movementsHeading')}
        </Typography>
        {movementsLoading && movements.length === 0 ? (
          <CircularProgress size={20} sx={{ my: 1 }} />
        ) : movementsError ? (
          <Alert severity="warning" sx={{ my: 1 }}>{movementsError}</Alert>
        ) : movements.length === 0 ? (
          <Alert severity="info">{t('vehicleInventory.movementsEmpty')}</Alert>
        ) : (
          <>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'grey.100' }}>
                    <TableCell><strong>{t('vehicleInventory.colDate')}</strong></TableCell>
                    <TableCell><strong>{t('vehicleInventory.colItem')}</strong></TableCell>
                    <TableCell align="right"><strong>{t('vehicleInventory.colDelta')}</strong></TableCell>
                    <TableCell><strong>{t('vehicleInventory.colReason')}</strong></TableCell>
                    <TableCell><strong>{t('vehicleInventory.colActor')}</strong></TableCell>
                    <TableCell><strong>{t('vehicleInventory.colReport')}</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {movements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(movement.occurredAt).toLocaleString(locale)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {movement.materialItem
                            ? materialItemDisplayName(movement.materialItem, locale as Locale)
                            : movement.materialItemId}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          color={movement.delta < 0 ? 'error.main' : 'success.main'}
                        >
                          {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{t(reasonLabelKey(movement.reason))}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {movement.actor
                            ? `${movement.actor.firstName} ${movement.actor.lastName}`
                            : t('vehicleInventory.unknownActor')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {movement.reportId && (
                          <Link href={`/#/event-reports/${movement.reportId}`} variant="body2">
                            {t('vehicleInventory.viewReport')}
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {movementsTotal > MOVEMENTS_PER_PAGE && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
                <Pagination
                  size="small"
                  count={Math.ceil(movementsTotal / MOVEMENTS_PER_PAGE)}
                  page={movementsPage}
                  onChange={(_, page) => fetchMovements(page)}
                />
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};
