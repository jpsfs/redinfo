import { useState, MouseEvent } from 'react';
import { Alert, Box, Button, Popover, Stack, TextField } from '@mui/material';
import { apiDownload } from '../../api';
import { useT } from '../../i18n/useT';

/** First and last day of the current calendar month, as `YYYY-MM-DD`. */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Toolbar popover: pick a date range, download the approved/pending CSV summary. */
export const ExportMenu = () => {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [range, setRange] = useState(currentMonthRange());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await apiDownload(
        `/volunteer-hours/summary/csv?from=${range.from}&to=${range.to}`,
        `volunteer-hours-${range.from}-to-${range.to}.csv`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('volunteerHoursReview.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button variant="outlined" onClick={(e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)}>
        {t('volunteerHoursReview.exportMenuButton')}
      </Button>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, width: 280 }}>
          {error && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              {error}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField
              type="date"
              size="small"
              label={t('volunteerHoursReview.exportFrom')}
              value={range.from}
              onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              type="date"
              size="small"
              label={t('volunteerHoursReview.exportTo')}
              value={range.to}
              onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <Button variant="contained" onClick={handleExport} disabled={exporting}>
              {t('volunteerHoursReview.exportButton')}
            </Button>
          </Stack>
        </Box>
      </Popover>
    </>
  );
};
