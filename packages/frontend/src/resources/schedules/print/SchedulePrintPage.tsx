import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuthenticated } from 'react-admin';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PrintIcon from '@mui/icons-material/Print';
import { availabilityWindowLabel, ScheduleBoardResponse, ScheduleStatus } from '@redinfo/shared';
import { ApiError, apiFetch } from '../../../api';
import { DelegacaoCampoLogo } from '../../../components/DelegacaoCampoLogo';
import { apiErrorLabel, windowCategoryLabel } from '../../../i18n/labels';
import { useT } from '../../../i18n/useT';
import { formatDateRange, formatDayLabel } from '../../../utils/dates';
import { buildPrintRows, choosePrintLayout, PrintCell } from './printLayout';
import './schedulePrint.css';

/** A cell's people (bold if driver) and its unfilled places (em-dash each). */
const PrintCellContent = ({ cell, t }: { cell: PrintCell; t: ReturnType<typeof useT> }) => (
  <>
    {cell.people.map((person, index) => (
      <div key={index} className={person.isDriver ? 'crew-name is-driver' : 'crew-name'}>
        {person.name}
      </div>
    ))}
    {Array.from({ length: cell.unfilled }, (_, index) => (
      <div key={`unfilled-${index}`} className="crew-name is-unfilled" title={t('schedulePrint.unfilled')}>
        —
      </div>
    ))}
  </>
);

/**
 * Print-optimised, browser-print rota — the third option settled on for
 * AB#189: no server-generated PDF, just an ordinary app screen the browser's
 * own print dialog turns into paper (or a saved PDF). That is what makes it
 * bilingual for free (it renders in the reader's current locale, same as
 * every other screen) and keeps the backend untouched.
 *
 * `noLayout` (see `App.tsx`) renders this outside react-admin's auth gate, so
 * it brings its own — `useAuthenticated()` — the same pattern `LiveRunGate`
 * uses. Otherwise ungated: no permission check, matching the Export CSV
 * button this replaces for paper, which is deliberately not restricted to
 * coordinators either.
 */
export const SchedulePrintPage = () => {
  useAuthenticated();
  const { id = '' } = useParams<{ id: string }>();
  const t = useT();
  const [board, setBoard] = useState<ScheduleBoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await apiFetch<ScheduleBoardResponse>(`/schedules/${id}/board`);
        if (!cancelled) setBoard(loaded);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof ApiError
            ? apiErrorLabel(t, e)
            : e instanceof Error
              ? e.message
              : t('schedulePrint.loadFailed'),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  // Printing before the board has resolved and the logo has settled leaves
  // the letterhead half-drawn on paper — see `DelegacaoCampoLogo.onLoad`.
  useEffect(() => {
    if (board && logoLoaded) window.print();
  }, [board, logoLoaded]);

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="warning">{error}</Alert>
      </Box>
    );
  }

  if (!board) {
    return (
      <Box sx={{ p: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  const rows = buildPrintRows(board);
  const layout = choosePrintLayout({ roleCount: board.roles.length, rowCount: rows.length });
  const isDraft = board.schedule.status === ScheduleStatus.DRAFT;

  return (
    <Box className={`schedule-print orientation-${layout.orientation} density-${layout.density}`}>
      {/* `@page` cannot be switched by a CSS class, only by a fresh at-rule — see
          schedulePrint.css's default (portrait) and this override. */}
      {layout.orientation === 'landscape' && <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style>}

      <Stack
        className="print-toolbar"
        direction="row"
        spacing={2}
        sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
          {t('schedulePrint.printButton')}
        </Button>
        <Button startIcon={<CloseIcon />} onClick={() => window.close()}>
          {t('schedulePrint.close')}
        </Button>
      </Stack>

      <Box className="letterhead">
        <DelegacaoCampoLogo sx={{ height: 56 }} onLoad={() => setLogoLoaded(true)} />
        <Box>
          <Typography variant="h6" component="p">
            {t('schedulePrint.organisation')}
          </Typography>
          <Typography variant="subtitle1" component="p">
            {availabilityWindowLabel(board.window)} — {windowCategoryLabel(t, board.window.category)}
          </Typography>
          <Typography variant="body2" component="p">
            {formatDateRange(t, board.window.startDate, board.window.endDate)}
          </Typography>
          {isDraft && <Typography className="draft-notice">{t('schedulePrint.draftNotice')}</Typography>}
        </Box>
      </Box>

      <table className="schedule-print-table">
        <thead>
          <tr>
            <th>{t('schedulePrint.dateColumn')}</th>
            <th>{t('schedulePrint.shiftColumn')}</th>
            {layout.columnMode === 'roles' &&
              (board.roles.length > 0 ? (
                board.roles.map((role) => <th key={role.id}>{role.name}</th>)
              ) : (
                <th>{t('schedulePrint.crewColumn')}</th>
              ))}
            {layout.columnMode === 'stacked' && <th>{t('schedulePrint.crewColumn')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className={row.isHoliday ? 'day-holiday' : row.isWeekend ? 'day-weekend' : undefined}
            >
              <td>
                {row.firstOfDay && (
                  <>
                    <div>{formatDayLabel(t, row.date)}</div>
                    {row.isHoliday && (
                      <div className="day-marker">
                        {t('schedulePrint.holiday')}
                        {row.holidayName ? ` · ${row.holidayName}` : ''}
                      </div>
                    )}
                    {row.isWeekend && !row.isHoliday && <div className="day-marker">{t('schedulePrint.weekend')}</div>}
                  </>
                )}
              </td>
              <td>{row.shiftLabel}</td>
              {layout.columnMode === 'roles' &&
                row.cells.map((cell, cellIndex) => (
                  <td key={cellIndex}>
                    <PrintCellContent cell={cell} t={t} />
                  </td>
                ))}
              {layout.columnMode === 'stacked' && (
                <td>
                  {(board.roles.length > 0 ? board.roles : [null]).map((role, cellIndex) => (
                    <div key={role?.id ?? 'crew'} className="stacked-role">
                      <span className="stacked-role-name">{role?.name ?? t('schedulePrint.crewColumn')}:</span>{' '}
                      <PrintCellContent cell={row.cells[cellIndex]} t={t} />
                    </div>
                  ))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <Box className="legend">
        <span className="legend-item">
          <strong>{t('schedulePrint.legendDriver')}</strong>
        </span>
        <span className="legend-item">{t('schedulePrint.legendUnfilled')}</span>
      </Box>
    </Box>
  );
};
