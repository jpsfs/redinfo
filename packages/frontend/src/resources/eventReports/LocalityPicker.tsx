import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import PlaceIcon from '@mui/icons-material/Place';
import { Locality } from '@redinfo/shared';
import { apiFetch } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useT } from '../../i18n/useT';

/** Localities the crew has picked before, most recent first. */
const RECENT_KEY = 'redinfo.recentLocalities.v1';
const RECENT_LIMIT = 4;

export function loadRecentLocalities(): Locality[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Locality[]) : [];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry?.id && entry?.name) : [];
  } catch {
    return [];
  }
}

export function rememberLocality(locality: Locality): void {
  try {
    const next = [locality, ...loadRecentLocalities().filter((e) => e.id !== locality.id)];
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, RECENT_LIMIT)));
  } catch {
    // Recents are a convenience; losing them is not worth interrupting anyone.
  }
}

/** `Ceira · Coimbra · Coimbra` — the locality, its concelho and its distrito. */
export const localityLabel = (locality?: Locality | null): string => {
  if (!locality) return '';
  const municipality = locality.municipality;
  if (!municipality) return locality.name;
  return `${locality.name} · ${municipality.name} · ${municipality.district}`;
};

/**
 * Where the call came from.
 *
 * A full-screen sheet on a phone, a dialog on a desktop. Three ways in, because
 * a crew at 3am should not have to type: the places they used last, their own
 * position, and — only if none of that helps — the search box.
 *
 * Search is debounced and the in-flight request is discarded when a newer one
 * starts, so a fast typist never sees results for a query they have moved past.
 */
export const LocalityPicker = ({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (locality: Locality) => void;
}) => {
  const t = useT();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Locality[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recent = useMemo(() => (open ? loadRecentLocalities() : []), [open]);

  // Bumped on every search; a response whose id is stale is dropped.
  const requestId = useRef(0);

  const search = useCallback(async (text: string) => {
    const id = (requestId.current += 1);
    setError(null);
    try {
      const found = await apiFetch<Locality[]>(
        `/localities?q=${encodeURIComponent(text)}`,
      );
      if (requestId.current === id) setResults(found);
    } catch (cause) {
      if (requestId.current === id) {
        setResults([]);
        setError(cause instanceof Error ? cause.message : t('hint.nothingFound'));
      }
    }
  }, [t]);

  useEffect(() => {
    if (!open) return undefined;
    const handle = window.setTimeout(() => void search(query), query ? 250 : 0);
    return () => window.clearTimeout(handle);
  }, [open, query, search]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError(t('hint.nothingFound'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const id = (requestId.current += 1);
        try {
          const found = await apiFetch<Locality[]>(
            `/localities/nearest?lat=${position.coords.latitude}&lon=${position.coords.longitude}`,
          );
          if (requestId.current === id) setResults(found);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : t('hint.nothingFound'));
        } finally {
          setLocating(false);
        }
      },
      () => {
        // Permission refused, or no fix. The search box still works.
        setLocating(false);
        setError(t('hint.searchLocality'));
      },
      { timeout: 10000 },
    );
  }, [t]);

  const pick = (locality: Locality) => {
    rememberLocality(locality);
    onPick(locality);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={isMobile} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1 }}>{t('field.locality')}</Box>
        <IconButton onClick={onClose} aria-label={t('action.cancel')}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <TextField
          autoFocus
          fullWidth
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('hint.searchLocality')}
          InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.disabled' }} /> }}
          sx={{ mb: 2 }}
        />

        <Button
          fullWidth
          variant="outlined"
          startIcon={locating ? <CircularProgress size={16} /> : <MyLocationIcon />}
          disabled={locating}
          onClick={useMyLocation}
          sx={{ mb: 2 }}
        >
          {t('action.useMyLocation')}
        </Button>

        {recent.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
              {t('hint.recent')}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              {recent.map((locality) => (
                <Chip
                  key={locality.id}
                  label={locality.name}
                  onClick={() => pick(locality)}
                  sx={{ height: 40, fontSize: '0.9375rem' }}
                />
              ))}
            </Stack>
          </Box>
        )}

        <Divider sx={{ mb: 1 }} />

        {error && (
          <Typography variant="body2" color="warning.main" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}

        {results === null && <CircularProgress size={20} />}

        {results?.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('hint.nothingFound')}
          </Typography>
        )}

        <List disablePadding>
          {(results ?? []).map((locality) => (
            <ListItemButton
              key={locality.id}
              onClick={() => pick(locality)}
              sx={{ minHeight: 64, borderRadius: 1 }}
            >
              <PlaceIcon sx={{ mr: 1.5, color: 'text.disabled' }} />
              <ListItemText
                primary={locality.name}
                secondary={
                  locality.municipality
                    ? `${locality.municipality.name} · ${locality.municipality.district}`
                    : undefined
                }
                primaryTypographyProps={{ fontWeight: 600 }}
              />
            </ListItemButton>
          ))}
        </List>

        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2 }}>
          {t('hint.localitiesOffline')}
        </Typography>
      </DialogContent>
    </Dialog>
  );
};
