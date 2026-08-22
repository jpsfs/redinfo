import { useEffect, useState } from 'react';
import { Title, usePermissions } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Fab,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DescriptionIcon from '@mui/icons-material/Description';
import {
  Action,
  EventReport,
  PaginatedResponse,
  UserRole,
  formatEventReportCode,
  hasPermission,
  totalKilometres,
} from '@redinfo/shared';
import { apiFetch } from '../api';
import { destinationLabel, reportTypeLabel, t } from '../i18n/labels';
import { StoredDraft, loadDraft } from '../resources/eventReports/reportDraft';
import { timeOfDay } from '../resources/eventReports/reportDraft';

const ReportCard = ({
  report,
  onOpen,
}: {
  report: EventReport;
  onOpen: () => void;
}) => (
  <Paper variant="outlined" onClick={onOpen} sx={{ p: 2, cursor: 'pointer' }}>
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {formatEventReportCode(report)}
        </Typography>
        <Chip size="small" variant="outlined" label={reportTypeLabel(report.type)} />
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {report.occurredOn} · {timeOfDay(report.startedAt) || '--:--'}–
        {timeOfDay(report.endedAt) || '--:--'}
        {report.locality ? ` · ${report.locality.name}` : ''}
      </Typography>

      {report.victims.length > 0 && (
        <Typography variant="body2">
          {report.victims.length}{' '}
          {report.victims.length === 1
            ? report.victims[0].destinationHospital?.name ??
              destinationLabel(report.victims[0].destinationKind)
            : ''}
        </Typography>
      )}

      {report.vehicles.length > 0 && (
        <Typography variant="caption" color="text.disabled">
          {report.vehicles.length === 1
            ? report.vehicles[0].vehicle?.licensePlate
            : `${report.vehicles.length}×`}{' '}
          · {totalKilometres(report.vehicles)} {t('field.kilometresShort')}
        </Typography>
      )}
    </Stack>
  </Paper>
);

/**
 * The activities the signed-in person was on.
 *
 * A personal page rather than the resource list: reading the whole archive is a
 * coordinator's job, while a crew member can always see what they attended —
 * and this is where they start a new report from, since the resource list is
 * closed to them.
 *
 * An unfinished draft is shown first and never buried. It lives on this device
 * only, so if it is not on this screen it is nowhere.
 */
export const MyReportsPage = () => {
  const navigate = useNavigate();
  const { permissions } = usePermissions<UserRole>();
  const [reports, setReports] = useState<EventReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft] = useState<StoredDraft | null>(() => loadDraft());

  useEffect(() => {
    let cancelled = false;

    apiFetch<PaginatedResponse<EventReport>>('/event-reports/me?perPage=100')
      .then((result) => {
        if (!cancelled) setReports(result.data);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load your reports.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const canFile = permissions
    ? hasPermission(permissions, Action.CREATE_EVENT_REPORT)
    : false;

  return (
    <Container maxWidth="sm" sx={{ py: 2, pb: 12 }}>
      <Title title={t('report.mine')} />

      <Stack spacing={1.5}>
        {error && <Alert severity="warning">{error}</Alert>}

        {draft && (
          <Alert
            severity="warning"
            icon={<DescriptionIcon />}
            action={
              <Button size="small" onClick={() => navigate('/event-reports/create')}>
                {t('action.continueDraft')}
              </Button>
            }
          >
            <strong>{t('status.draftUnfinished')}</strong>{' '}
            {reportTypeLabel(draft.draft.type)} ·{' '}
            {new Date(draft.savedAt).toLocaleString()}
          </Alert>
        )}

        {reports === null && !error && <CircularProgress size={24} />}

        {reports?.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {t('report.none')}
          </Typography>
        )}

        {reports?.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            onOpen={() => navigate(`/event-reports/${report.id}/show`)}
          />
        ))}
      </Stack>

      {canFile && (
        <Box sx={{ position: 'fixed', bottom: 24, left: 16, right: 16, maxWidth: 560, mx: 'auto' }}>
          <Fab
            variant="extended"
            color="primary"
            onClick={() => navigate('/event-reports/create')}
            sx={{ width: '100%', minHeight: 60, fontSize: '1.0625rem', fontWeight: 700 }}
          >
            <AddIcon sx={{ mr: 1 }} />
            {t('action.newReport')}
          </Fab>
        </Box>
      )}
    </Container>
  );
};
