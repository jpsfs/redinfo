import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { RankedPlacement } from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { UnplannedGroup } from './unplannedGroups';

/** Same default a group-assign gets — see `AssignGroupDialog`'s own doc
 * comment for why 30 minutes is a guess, not a measurement. */
const DEFAULT_GROUP_DURATION_MINUTES = 30;

/** A capacity shortfall has no override anywhere in this app — offering
 * "Apply" on one would just reproduce the same refusal `assignLegToTrip`
 * already throws. Vehicle-availability and an unroutable candidate are both
 * still worth trying: the first is overridable server-side with a reason
 * (not yet wired here, same gap `AssignGroupDialog` has), the second is
 * advisory only. */
const UNAPPLICABLE_REASONS = ['CAPACITY_SEATS', 'CAPACITY_WHEELCHAIR', 'CAPACITY_STRETCHER'];

/**
 * Ranked candidate journeys for a group of unplanned legs
 * (`POST /trips/suggest-placements`) — the "one suggestion" interaction
 * `AssignGroupDialog`'s own doc comment already names alongside drag and the
 * one dialog (`docs/plans/planeamento-transportes-redesign.md` §3, §8).
 * A `Dialog` + `List`, not a popover, per that doc's §7. Ranking only:
 * nothing is applied until the planner picks a candidate, and a blocked one
 * is still listed — see `RankedPlacement`'s own doc comment in shared.
 */
export const SuggestPlacementsDialog = ({
  group,
  date,
  onClose,
  onSaved,
}: {
  group: UnplannedGroup | null;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const t = useT();
  const [placements, setPlacements] = useState<RankedPlacement[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!group) {
      setPlacements(null);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<RankedPlacement[]>('/trips/suggest-placements', { method: 'POST', body: { legIds: group.legIds } })
      .then(setPlacements)
      .catch((cause) => setError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.suggestPlacementsFailed')))
      .finally(() => setLoading(false));
  }, [group, t]);

  if (!group) return null;

  const handleClose = () => {
    setApplyingKey(null);
    onClose();
  };

  const handleApply = async (placement: RankedPlacement, key: string) => {
    setApplyingKey(key);
    setError(null);
    try {
      const tripId =
        placement.tripId ??
        (await apiFetch<{ id: string }>('/trips', { method: 'POST', body: { date, vehicleId: placement.vehicle.id } })).id;
      const pickupPlannedAt = group.arrivalInstant;
      const dropoffPlannedAt = new Date(new Date(pickupPlannedAt).getTime() + DEFAULT_GROUP_DURATION_MINUTES * 60_000).toISOString();
      for (const legId of group.legIds) {
        await apiFetch(`/trips/${tripId}/legs`, {
          method: 'POST',
          body: { transportLegId: legId, pickupPlannedAt, dropoffPlannedAt },
        });
      }
      onSaved();
      handleClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.assignFailed'));
    } finally {
      setApplyingKey(null);
    }
  };

  return (
    <Dialog open onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('transportPlanning.suggestPlacementsDialogTitle', { count: group.legIds.length })}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('transportPlanning.suggestPlacementsHint')}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {!loading && placements && placements.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {t('transportPlanning.suggestPlacementsEmpty')}
            </Typography>
          )}
          {!loading && placements && placements.length > 0 && (
            <List disablePadding>
              {placements.map((placement) => {
                const key = `${placement.vehicle.id}-${placement.tripId ?? 'new'}`;
                const blocked = placement.blockedBy.some((reason) => UNAPPLICABLE_REASONS.includes(reason));
                return (
                  <ListItem
                    key={key}
                    divider
                    disableGutters
                    secondaryAction={
                      <Button
                        size="small"
                        variant="contained"
                        disabled={blocked || applyingKey !== null}
                        onClick={() => handleApply(placement, key)}
                      >
                        {applyingKey === key ? <CircularProgress size={16} /> : t('transportPlanning.suggestPlacementsApply')}
                      </Button>
                    }
                  >
                    <ListItemText
                      primary={`${placement.vehicle.numeroCauda} · ${placement.vehicle.licensePlate}`}
                      secondary={
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={
                              placement.tripId
                                ? t('transportPlanning.suggestPlacementsExistingJourney', { number: placement.journeyNumber })
                                : t('transportPlanning.suggestPlacementsNewJourney')
                            }
                          />
                          {placement.deltaKm != null && placement.deltaMinutes != null ? (
                            <>
                              <Chip size="small" variant="outlined" label={t('transportPlanning.suggestPlacementsDeltaKm', { km: placement.deltaKm })} />
                              <Chip
                                size="small"
                                variant="outlined"
                                label={t('transportPlanning.suggestPlacementsDeltaMinutes', { minutes: placement.deltaMinutes })}
                              />
                            </>
                          ) : (
                            <Chip size="small" variant="outlined" label={t('transportPlanning.suggestPlacementsUnrouted')} />
                          )}
                          {placement.arrivalMarginMinutes != null && (
                            <Chip
                              size="small"
                              color={placement.arrivalMarginMinutes >= 0 ? 'success' : 'error'}
                              label={
                                placement.arrivalMarginMinutes >= 0
                                  ? t('transportPlanning.suggestPlacementsMarginAhead', { minutes: placement.arrivalMarginMinutes })
                                  : t('transportPlanning.suggestPlacementsMarginLate', { minutes: Math.abs(placement.arrivalMarginMinutes) })
                              }
                            />
                          )}
                          {placement.blockedBy.map((reason) => (
                            <Chip key={reason} size="small" color="error" label={t(`transportPlanning.placementBlockReason.${reason}`)} />
                          ))}
                        </Stack>
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3 }}>
        <Button onClick={handleClose}>{t('transportPlanning.assignDialogCancel')}</Button>
      </DialogActions>
    </Dialog>
  );
};
