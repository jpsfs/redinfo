import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { InventoryItemType, Locale, MaterialItem, materialItemDisplayName } from '@redinfo/shared';
import { apiFetch } from '../../api';
import { useT } from '../../i18n/useT';
import { BarcodeScanner, BarcodeScanErrorKind, isCameraScanSupported } from './BarcodeScanner';
import { findLine, MaterialLine, removeLine, setLineQuantity, tapMaterialItem } from './materialLines';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * The material consumption picker — one grid of pinned favourites, a
 * locale-aware search for the long tail, and a camera barcode scanner, all
 * three feeding the same lines list at the bottom.
 *
 * Fully controlled (`value`/`onChange`): the report editor and live mode
 * (#207) each own where the lines end up (a report's `materials` input, a
 * live run's append-only entries) — this component only decides what tapping,
 * searching or scanning *does* to that list, not what happens to it after.
 */
export const MaterialPicker = ({
  value,
  onChange,
  locale,
}: {
  value: MaterialLine[];
  onChange: (lines: MaterialLine[]) => void;
  locale: Locale;
}) => {
  const t = useT();
  const name = useCallback((item: MaterialItem) => materialItemDisplayName(item, locale), [locale]);

  const [favourites, setFavourites] = useState<MaterialItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MaterialItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cameraSupported = useRef(isCameraScanSupported()).current;

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ data: MaterialItem[] }>('/material-items?frequent=true&perPage=200')
      .then((res) => {
        if (!cancelled) setFavourites(res.data);
      })
      .catch(() => {
        if (!cancelled) setFavourites([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Bumped on every search; a response whose id has gone stale is dropped —
  // same discipline as `LocalityPicker`.
  const requestId = useRef(0);
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearching(false);
      return undefined;
    }
    const id = (requestId.current += 1);
    setSearching(true);
    const handle = window.setTimeout(() => {
      apiFetch<{ data: MaterialItem[] }>(`/material-items?q=${encodeURIComponent(query.trim())}`)
        .then((res) => {
          if (requestId.current === id) {
            setSearchResults(res.data);
            setSearching(false);
          }
        })
        .catch(() => {
          if (requestId.current === id) {
            setSearchResults([]);
            setSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  const flash = (item: MaterialItem) => {
    setJustAddedId(item.id);
    window.setTimeout(() => setJustAddedId((current) => (current === item.id ? null : current)), 600);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
  };

  const tap = (item: MaterialItem) => {
    onChange(tapMaterialItem(value, item));
    flash(item);
  };

  const focusSearch = () => window.setTimeout(() => searchInputRef.current?.focus(), 0);

  // Plain functions, not `useCallback`: `BarcodeScanner` reads these through
  // its own ref and never re-runs its camera effect when they change
  // identity, so there is no stale-closure risk to guard against here.
  const handleDetect = (code: string) => {
    apiFetch<MaterialItem>(`/material-items/by-barcode/${encodeURIComponent(code)}`)
      .then((item) => {
        setScanMessage(null);
        tap(item);
        // The scanner stays open — a crew scanning a shelf of boxes should
        // not have to reopen it after every item.
      })
      .catch(() => {
        setScannerOpen(false);
        setScanMessage(t('materialPicker.barcodeNotFound'));
        focusSearch();
      });
  };

  const handleScanError = (kind: BarcodeScanErrorKind) => {
    setScannerOpen(false);
    setScanMessage(kind === 'denied' ? t('materialPicker.cameraDenied') : t('materialPicker.cameraUnsupported'));
    focusSearch();
  };

  return (
    <Stack spacing={2}>
      {favourites && favourites.length > 0 && (
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.8125rem', color: 'text.secondary', mb: 1 }}>
            {t('materialPicker.favouritesTitle')}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
              gap: 1,
            }}
          >
            {favourites.map((item) => {
              const line = findLine(value, item.id);
              const selected = !!line;
              return (
                <Paper
                  key={item.id}
                  component="button"
                  type="button"
                  onClick={() => tap(item)}
                  elevation={0}
                  sx={{
                    minHeight: 72,
                    p: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.5,
                    border: 2,
                    borderColor: selected ? 'primary.main' : 'divider',
                    backgroundColor: selected ? 'primary.50' : 'background.paper',
                    color: 'text.primary',
                    cursor: 'pointer',
                    font: 'inherit',
                    transform: justAddedId === item.id ? 'scale(1.05)' : 'scale(1)',
                    transition: 'transform 150ms ease, background-color 150ms ease',
                  }}
                >
                  <Typography sx={{ fontWeight: 700, fontSize: '0.8125rem', textAlign: 'center' }}>
                    {name(item)}
                  </Typography>
                  {selected && (
                    <Chip
                      size="small"
                      color="primary"
                      label={item.type === InventoryItemType.UNLIMITED ? t('materialPicker.unlimitedLogged') : line.quantity}
                    />
                  )}
                </Paper>
              );
            })}
          </Box>
        </Box>
      )}

      <Stack direction="row" spacing={1} alignItems="flex-start">
        <TextField
          inputRef={searchInputRef}
          fullWidth
          size="small"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('materialPicker.searchPlaceholder')}
        />
        {cameraSupported && (
          <IconButton
            aria-label={t('materialPicker.scanButton')}
            onClick={() => {
              setScanMessage(null);
              setScannerOpen(true);
            }}
            sx={{ border: 1, borderColor: 'divider' }}
          >
            <QrCodeScannerIcon />
          </IconButton>
        )}
      </Stack>

      {scanMessage && <Alert severity="warning">{scanMessage}</Alert>}

      {searching && (
        <Typography variant="body2" color="text.secondary">
          {t('hint.loading')}
        </Typography>
      )}

      {searchResults && searchResults.length === 0 && !searching && (
        <Typography variant="body2" color="text.secondary">
          {t('hint.nothingFound')}
        </Typography>
      )}

      {searchResults && searchResults.length > 0 && (
        <List disablePadding>
          {searchResults.map((item) => (
            <ListItem
              key={item.id}
              disablePadding
              secondaryAction={
                <IconButton edge="end" aria-label={name(item)} onClick={() => tap(item)}>
                  <AddIcon />
                </IconButton>
              }
            >
              <ListItemText
                primary={name(item)}
                secondary={item.unit}
                onClick={() => tap(item)}
                sx={{ cursor: 'pointer' }}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Divider />

      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: '0.8125rem', color: 'text.secondary', mb: 1 }}>
          {t('materialPicker.linesTitle')}
        </Typography>
        {value.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('materialPicker.linesEmpty')}
          </Typography>
        ) : (
          <Stack spacing={1}>
            {value.map((line) => (
              <Stack
                key={line.materialItem.id}
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }} noWrap>
                    {name(line.materialItem)}
                  </Typography>
                </Box>

                {line.materialItem.type === InventoryItemType.UNLIMITED ? (
                  <Chip size="small" label={t('materialPicker.unlimitedLogged')} />
                ) : (
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <IconButton
                      size="small"
                      aria-label={`${name(line.materialItem)} −1`}
                      onClick={() => onChange(setLineQuantity(value, line.materialItem.id, (line.quantity ?? 1) - 1))}
                    >
                      <RemoveIcon fontSize="small" />
                    </IconButton>
                    <Typography sx={{ minWidth: 24, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                      {line.quantity}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label={`${name(line.materialItem)} +1`}
                      onClick={() => onChange(setLineQuantity(value, line.materialItem.id, (line.quantity ?? 0) + 1))}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                )}

                <IconButton
                  size="small"
                  aria-label={t('action.remove')}
                  onClick={() => onChange(removeLine(value, line.materialItem.id))}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        )}
      </Box>

      <Dialog open={scannerOpen} onClose={() => setScannerOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
          <Box sx={{ flex: 1 }}>{t('materialPicker.scanTitle')}</Box>
          <IconButton onClick={() => setScannerOpen(false)} aria-label={t('materialPicker.closeScan')}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {scannerOpen && <BarcodeScanner onDetect={handleDetect} onError={handleScanError} />}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('materialPicker.scanHint')}
          </Typography>
        </DialogContent>
      </Dialog>
    </Stack>
  );
};
