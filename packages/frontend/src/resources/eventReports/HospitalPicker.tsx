import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import {
  HospitalWithDistance,
  Locality,
  NO_TRANSPORT_DESTINATIONS,
  VictimDestinationKind,
  foldForSearch,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { destinationLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';

export interface DestinationChoice {
  destinationKind: VictimDestinationKind;
  destinationHospitalId: string | null;
  /** For display only — the caller already has the id it needs to send. */
  hospitalName?: string;
}

/**
 * Where a victim ended up.
 *
 * Two answers in one sheet, because they are one question: the hospital they
 * were taken to, or the reason nobody was taken anywhere. Splitting them into
 * two controls would make "refused transport" feel like a failure to answer.
 *
 * Hospitals arrive already ordered by distance from the report's locality — the
 * API measures it, so the ordering cannot disagree with what the server would
 * say. Filtering is client-side because the list is short and a crew typing
 * "chuc" should not wait for a round trip.
 */
export const HospitalPicker = ({
  open,
  locality,
  onClose,
  onPick,
}: {
  open: boolean;
  /** The report's locality; hospitals are ordered by distance from it. */
  locality?: Locality | null;
  onClose: () => void;
  onPick: (choice: DestinationChoice) => void;
}) => {
  const t = useT();
  const isMobile = useIsMobile();
  const [hospitals, setHospitals] = useState<HospitalWithDistance[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    const path = locality?.id
      ? `/hospitals/picker?localityId=${encodeURIComponent(locality.id)}`
      : '/hospitals/picker';

    apiFetch<HospitalWithDistance[]>(path)
      .then((found) => {
        if (!cancelled) setHospitals(found);
      })
      .catch((cause) => {
        if (!cancelled) {
          setHospitals([]);
          setError(cause instanceof Error ? cause.message : t('hint.nothingFound'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, locality?.id, t]);

  const visible = useMemo(() => {
    const folded = foldForSearch(query);
    if (!folded) return hospitals ?? [];
    return (hospitals ?? []).filter((hospital) =>
      foldForSearch(hospital.name).includes(folded),
    );
  }, [hospitals, query]);

  return (
    <Dialog open={open} onClose={onClose} fullScreen={isMobile} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1 }}>{t('field.destination')}</Box>
        <IconButton onClick={onClose} aria-label={t('action.cancel')}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <TextField
          fullWidth
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('hint.searchHospital')}
          InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.disabled' }} /> }}
          sx={{ mb: 1.5 }}
        />

        {locality && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('hint.hospitalsByDistance')}
          </Typography>
        )}

        {error && (
          <Typography variant="body2" color="warning.main" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}

        {hospitals === null && <CircularProgress size={20} />}

        <List disablePadding>
          {visible.map((hospital) => (
            <ListItemButton
              key={hospital.id}
              onClick={() =>
                onPick({
                  destinationKind: VictimDestinationKind.HOSPITAL,
                  destinationHospitalId: hospital.id,
                  hospitalName: hospital.name,
                })
              }
              sx={{ minHeight: 64, borderRadius: 1 }}
            >
              <LocalHospitalIcon sx={{ mr: 1.5, color: 'text.disabled' }} />
              <ListItemText
                primary={hospital.name}
                secondary={hospital.municipality?.name}
                primaryTypographyProps={{ fontWeight: 600 }}
              />
              {hospital.distanceKm !== null && (
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 700, color: 'text.secondary', ml: 1 }}
                  // An approximate distance says so, rather than implying a
                  // precision the coordinates do not have.
                  title={hospital.approximate ? t('hint.approximateDistance') : undefined}
                >
                  {/* One string rather than three nodes, so a screen reader
                      says "about 6 km" instead of spelling it out. */}
                  {`${hospital.approximate ? '≈ ' : ''}${hospital.distanceKm} km`}
                </Typography>
              )}
            </ListItemButton>
          ))}
        </List>

        {hospitals !== null && visible.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('hint.nothingFound')}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
          {t('hint.noTransport')}
        </Typography>
        <Box
          sx={{
            mt: 1,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
            gap: 1,
          }}
        >
          {NO_TRANSPORT_DESTINATIONS.map((kind) => (
            <Button
              key={kind}
              variant="outlined"
              color="secondary"
              onClick={() =>
                onPick({ destinationKind: kind, destinationHospitalId: null })
              }
              sx={{ minHeight: 52 }}
            >
              {destinationLabel(t, kind)}
            </Button>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
};
