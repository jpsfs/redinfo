import { useEffect, useState } from 'react';
import { Title, useGetIdentity, usePermissions } from 'react-admin';
import { useParams } from 'react-router-dom';
import { Alert, Box, CircularProgress } from '@mui/material';
import {
  Action,
  EventReport,
  UserRole,
  formatEventReportCode,
  hasPermission,
  isEventReportInvolved,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { useT } from '../../i18n/useT';
import { useEventReportDraft } from './useEventReportDraft';
import { EventReportEditor } from './EventReportEditor';

/**
 * Correcting or finishing a filed report.
 *
 * Loaded by hand rather than through react-admin's `Edit`: the form is not a
 * flat record but a nested one the wizard owns, and `Edit`'s save cycle would
 * have to be bypassed anyway. Fetching it here keeps one save path shared with
 * the create screen.
 */
export const EventReportEdit = () => {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<EventReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;

    apiFetch<EventReport>(`/event-reports/${id}`)
      .then((loaded) => {
        if (!cancelled) setReport(loaded);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load the report');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!report) {
    return (
      <Box sx={{ p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return <LoadedEditor report={report} />;
};

/**
 * Mounted only once the report is in hand, so the draft hook seeds itself from
 * a real record rather than from an empty one it would then have to replace.
 *
 * Guarded here rather than only by hiding `EventReportShow`'s Edit button:
 * the archive is readable by everyone now, so a direct link to this route
 * must not open the form for someone who is not on the crew. Mirrors the
 * backend's `assertCanWrite`.
 */
const LoadedEditor = ({ report }: { report: EventReport }) => {
  const t = useT();
  const { permissions, isLoading: permissionsLoading } = usePermissions<UserRole[]>();
  const { identity, isLoading: identityLoading } = useGetIdentity();
  const form = useEventReportDraft({ report });

  if (permissionsLoading || identityLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  const viewerId = identity?.id !== undefined ? String(identity.id) : undefined;
  const canEdit = permissions
    ? hasPermission(permissions, Action.MANAGE_EVENT_REPORTS) ||
      (hasPermission(permissions, Action.CREATE_EVENT_REPORT) &&
        viewerId !== undefined &&
        isEventReportInvolved(report, viewerId))
    : false;

  if (!canEdit) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning">{t('report.editForbidden')}</Alert>
      </Box>
    );
  }

  return (
    <>
      <Title
        title={`${formatEventReportCode(report) ?? t('report.pending')} — ${t('action.edit')}`}
      />
      <EventReportEditor form={form} report={report} />
    </>
  );
};
