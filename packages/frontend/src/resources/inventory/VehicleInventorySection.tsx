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
import InventoryIcon from '@mui/icons-material/Inventory';
import DownloadIcon from '@mui/icons-material/Download';

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
    } catch (e) {
      setError('Could not load inventory data.');
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
      notify('Please enter a valid integer quantity', { type: 'error' });
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

      notify('Inventory updated', { type: 'success' });
      setEditValues((prev) => {
        const next = { ...prev };
        delete next[templateItemId];
        return next;
      });
      await fetchInventory();
    } catch {
      notify('Failed to update inventory', { type: 'error' });
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
    return (
      <Alert severity="info" sx={{ my: 1 }}>
        No inventory template defined for {record?.vehicleType ?? 'this vehicle type'}.
        A coordinator can create one in Inventory Templates.
      </Alert>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6">Vehicle Inventory</Typography>
          {inventory.hasLowStock && (
            <Chip label="⚠ Low Stock" color="error" size="small" />
          )}
          <Chip
            label={`Template v${inventory.template.version}`}
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
          Export CSV
        </Button>
      </Box>

      {inventory.rows.length === 0 ? (
        <Alert severity="info">No inventory items defined in the template.</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: 'grey.100' }}>
                <TableCell><strong>Item</strong></TableCell>
                <TableCell><strong>Type</strong></TableCell>
                <TableCell align="right"><strong>Recommended</strong></TableCell>
                <TableCell align="right"><strong>Actual</strong></TableCell>
                <TableCell><strong>Unit</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Action</strong></TableCell>
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
                        <Chip size="small" label="Unlimited" color="secondary" variant="outlined" />
                      ) : (
                        <Chip size="small" label="Countable" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {row.templateItem.type === 'UNLIMITED' ? (
                        <Chip size="small" label="∞" color="secondary" variant="outlined" />
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
                          placeholder="present"
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
                        <Chip size="small" label="Low" color="error" />
                      )}
                      {row.status === 'ok' && (
                        <Chip size="small" label="OK" color="success" />
                      )}
                      {row.status === 'over' && (
                        <Chip size="small" label="Above Rec." color="success" variant="outlined" />
                      )}
                      {row.status === 'unlimited' && (
                        <Chip size="small" label="Unlimited" color="secondary" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing && (
                        <Tooltip title="Save quantity">
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
