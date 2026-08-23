import { useCallback, useMemo, useState } from 'react';
import { useNotify, useRedirect } from 'react-admin';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SaveIcon from '@mui/icons-material/Save';
import {
  EventReport,
  EventReportAttachment,
  EventReportInput,
  EventReportSubmitResponse,
  EventReportType,
  eventReportRules,
  formatEventReportCode,
  isEventReportSubmitted,
  validateAttachment,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { problemLabel, reportTypeLabel, t, warningLabel } from '../../i18n/labels';
import { uploadAttachment } from './uploadAttachment';
import { StepId } from './reportDraft';
import { EventReportDraft } from './useEventReportDraft';
import { useReportLookups } from './useReportLookups';
import { PendingPhotosBanner } from '../liveRuns';
import {
  ClinicalSection,
  CrewSection,
  NarrativeSection,
  ReviewSection,
  SectionProps,
  TimesSection,
  VehiclesSection,
  VictimsSection,
  WhenWhereSection,
} from './ReportSections';

/**
 * The title of a step, which depends on the type: an emergency has one vehicle
 * and one victim, a support report may have several, and the heading should say
 * so rather than reading "Vítima" above a list of four.
 */
const stepTitle = (step: StepId, type: EventReportType | string): string => {
  const rules = eventReportRules(type);
  switch (step) {
    case 'whenWhere':
      return t('step.whenWhere');
    case 'times':
      return `${t('step.times')} · ${t('step.optional')}`;
    case 'crew':
      return t('step.crew');
    case 'vehicles':
      return rules.maxVehicles === 1 ? t('step.vehicles') : t('step.vehiclesPlural');
    case 'victims':
      return rules.maxVictims === 1 ? t('step.victims') : t('step.victimsPlural');
    case 'clinical':
      return t('live.vitals');
    case 'narrative':
      return t('step.narrative');
    case 'review':
      return t('step.review');
    default:
      return step;
  }
};

export interface EventReportEditorProps {
  form: EventReportDraft;
  /** Set when editing a filed report; absent when filing a new one. */
  report?: EventReport | null;
}

/**
 * The report form.
 *
 * One component, two layouts: a phone gets a guided wizard with one section per
 * screen, a desktop gets every section on one page with a fixed save bar. They
 * share the same state, the same sections and the same save path — the only
 * difference is how much is on screen at once.
 */
export const EventReportEditor = ({ form, report = null }: EventReportEditorProps) => {
  const isMobile = useIsMobile();
  const notify = useNotify();
  const redirect = useRedirect();

  const lookups = useReportLookups(form.draft);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<EventReportAttachment[]>(
    report?.attachments ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [filing, setFiling] = useState(false);

  /**
   * A report that exists but has not been filed — the one a closed live run left
   * behind. Saving it keeps it a draft; filing it is the separate, deliberate act
   * that claims its number.
   */
  const isDraft = report !== null && !isEventReportSubmitted(report);

  const addFiles = useCallback(
    (chosen: File[]) => {
      const accepted: File[] = [];
      for (const file of chosen) {
        // Checked here as well as server-side, so a 20 MB photo is refused
        // before it is carried over a mobile connection.
        const error = validateAttachment({
          filename: file.name,
          mimeType: file.type,
          byteSize: file.size,
        });
        if (error) notify(`${file.name}: ${error}`, { type: 'warning' });
        else accepted.push(file);
      }
      if (accepted.length) setPendingFiles((current) => [...current, ...accepted]);
    },
    [notify],
  );

  const removeAttachment = useCallback(
    async (id: string) => {
      if (!report) return;
      try {
        await apiFetch(`/event-reports/${report.id}/attachments/${id}`, {
          method: 'DELETE',
        });
        setAttachments((current) => current.filter((entry) => entry.id !== id));
      } catch (cause) {
        notify(cause instanceof Error ? cause.message : 'Could not remove', {
          type: 'error',
        });
      }
    },
    [notify, report],
  );

  /**
   * Saves the report, then the photographs.
   *
   * That order is forced — an attachment needs a report to hang off — and it is
   * also the right one: the report is what matters, so a photo that fails to
   * upload is reported as a warning against a report that is safely filed,
   * rather than taking the whole save down with it.
   */
  const save = useCallback(async () => {
    setSaving(true);
    try {
      const payload: EventReportInput = form.draft;
      const saved = report
        ? await apiFetch<EventReport>(`/event-reports/${report.id}`, {
            method: 'PATCH',
            body: payload,
          })
        : await apiFetch<EventReport>('/event-reports', { method: 'POST', body: payload });

      const failed: string[] = [];
      for (const file of pendingFiles) {
        try {
          await uploadAttachment(saved.id, file);
        } catch {
          failed.push(file.name);
        }
      }

      form.forget();
      setPendingFiles([]);

      // A draft has no code yet, so the confirmation says what happened rather
      // than showing an empty string where a number belongs.
      const label = formatEventReportCode(saved) ?? t('report.pending');
      if (failed.length) {
        notify(`${label} — ${failed.join(', ')}`, { type: 'warning' });
      } else {
        notify(label, { type: 'success' });
      }
      // A draft stays where it is: the crew is mid-way through finishing it, and
      // bouncing them to a read-only view is how the next field never gets typed.
      if (isEventReportSubmitted(saved)) redirect('show', 'event-reports', saved.id);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Could not save the report', {
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  }, [form, notify, pendingFiles, redirect, report]);

  /**
   * Files the report, and says what it displaced.
   *
   * Saved first: filing validates what is *stored*, so an unsaved correction
   * would be judged against the old row and refused for a reason the crew has
   * already fixed on screen.
   */
  const file = useCallback(async () => {
    if (!report) return;
    setFiling(true);
    try {
      await apiFetch<EventReport>(`/event-reports/${report.id}`, {
        method: 'PATCH',
        body: form.draft as EventReportInput,
      });
      const result = await apiFetch<EventReportSubmitResponse>(
        `/event-reports/${report.id}/submit`,
        { method: 'POST' },
      );

      notify(
        result.renumbered.length > 0
          ? `${formatEventReportCode(result.report)} — ${result.renumbered.length} ${t('report.renumbered')}`
          : `${t('report.submitted')} · ${formatEventReportCode(result.report)}`,
        { type: 'success' },
      );
      redirect('show', 'event-reports', report.id);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t('sync.failed'), { type: 'error' });
    } finally {
      setFiling(false);
    }
  }, [form.draft, notify, redirect, report]);

  const sectionProps: SectionProps = {
    draft: form.draft,
    patch: form.patch,
    lookups,
  };

  const narrativeProps = {
    ...sectionProps,
    pendingFiles,
    onAddFiles: addFiles,
    onRemovePendingFile: (index: number) =>
      setPendingFiles((current) => current.filter((_, at) => at !== index)),
    attachments,
    onRemoveAttachment: report ? removeAttachment : undefined,
  };

  const renderStep = (step: StepId) => {
    switch (step) {
      case 'whenWhere':
        return <WhenWhereSection {...sectionProps} />;
      case 'times':
        return <TimesSection {...sectionProps} />;
      case 'crew':
        return <CrewSection {...sectionProps} />;
      case 'vehicles':
        return <VehiclesSection {...sectionProps} />;
      case 'victims':
        return <VictimsSection {...sectionProps} />;
      case 'clinical':
        return <ClinicalSection {...sectionProps} />;
      case 'narrative':
        return <NarrativeSection {...narrativeProps} />;
      case 'review':
        return (
          <ReviewSection
            {...sectionProps}
            warnings={form.warnings}
            onEditStep={form.goTo}
            pendingFileCount={pendingFiles.length + attachments.length}
          />
        );
      default:
        return null;
    }
  };

  const currentStepTitle = useMemo(
    () => stepTitle(form.stepId, form.draft.type),
    [form.stepId, form.draft.type],
  );

  // ── Phone: one section at a time ──
  if (isMobile) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <AppBar position="sticky">
          <Toolbar>
            <Typography sx={{ flex: 1, fontWeight: 600 }}>
              {reportTypeLabel(form.draft.type)}
            </Typography>
            {form.savedAt && (
              <Chip
                size="small"
                icon={<CheckIcon />}
                label={t('status.draftSaved')}
                sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'inherit' }}
              />
            )}
          </Toolbar>
          <Box sx={{ bgcolor: 'primary.dark', px: 2, pb: 1.5 }}>
            <Stack direction="row" alignItems="baseline" sx={{ color: '#fff', mb: 1 }}>
              <Typography sx={{ flex: 1, fontWeight: 700 }}>{currentStepTitle}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                {form.stepIndex + 1} {t('step.of')} {form.steps.length}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={((form.stepIndex + 1) / form.steps.length) * 100}
              sx={{
                height: 5,
                borderRadius: 3,
                bgcolor: 'rgba(255,255,255,0.3)',
                '& .MuiLinearProgress-bar': { bgcolor: '#fff' },
              }}
            />
          </Box>
        </AppBar>

        <Box sx={{ flex: 1, p: 2 }}>
          {report && (
            <Box sx={{ mb: 2 }}>
              <PendingPhotosBanner reportId={report.id} liveRunId={report.liveRunId} />
            </Box>
          )}
          {renderStep(form.stepId)}
        </Box>

        <Paper
          square
          elevation={3}
          sx={{ position: 'sticky', bottom: 0, p: 2, display: 'flex', gap: 1.5 }}
        >
          {!form.isFirstStep && (
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<ChevronLeftIcon />}
              onClick={form.back}
              sx={{ minHeight: 52 }}
            >
              {t('action.back')}
            </Button>
          )}
          {form.isLastStep ? (
            <Stack sx={{ flex: 1 }} spacing={1}>
              <Button
                fullWidth
                variant={isDraft ? 'outlined' : 'contained'}
                startIcon={saving ? <CircularProgress size={16} /> : <CheckIcon />}
                disabled={!form.canSave || saving || filing}
                onClick={save}
                sx={{ minHeight: 52, fontWeight: 700 }}
              >
                {saving ? t('status.saving') : t('action.save')}
              </Button>
              {isDraft && (
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={filing ? <CircularProgress size={16} /> : <CheckIcon />}
                  disabled={!form.canSave || saving || filing}
                  onClick={file}
                  sx={{ minHeight: 52, fontWeight: 700 }}
                >
                  {filing ? t('report.submitting') : t('report.submit')}
                </Button>
              )}
            </Stack>
          ) : (
            <Button
              fullWidth
              variant="contained"
              endIcon={<ChevronRightIcon />}
              onClick={form.next}
              sx={{ minHeight: 52, fontWeight: 700 }}
            >
              {t('action.next')}
            </Button>
          )}
        </Paper>
      </Box>
    );
  }

  // ── Desktop: everything at once, with a fixed save bar ──
  const rules = eventReportRules(form.draft.type);

  return (
    <Box sx={{ pb: 12 }}>
      <Container maxWidth="lg" sx={{ pt: 2 }}>
        <Stack spacing={2.5}>
          {report && (
            <PendingPhotosBanner reportId={report.id} liveRunId={report.liveRunId} />
          )}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled' }}>
                  {t('field.type').toUpperCase()}
                </Typography>
                <Typography variant="h6">{reportTypeLabel(form.draft.type)}</Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled' }}>
                  {t('field.reportNumber').toUpperCase()}
                </Typography>
                <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {/* A report that has not been filed has no code, and the
                      placeholder is the honest answer for both cases: a new
                      report, and a draft a live run left behind. */}
                  {(report && formatEventReportCode(report)) ||
                    `${rules.codePrefix} ···/${form.draft.occurredOn.slice(0, 4)}`}
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }} />
              {form.savedAt && (
                <Chip size="small" icon={<CheckIcon />} label={t('status.draftSaved')} />
              )}
            </Stack>
          </Paper>

          {form.steps
            .filter((step) => step !== 'review')
            .map((step) => (
              <Paper key={step} variant="outlined">
                <Box sx={{ px: 2.5, py: 1.75, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography sx={{ fontWeight: 700 }}>
                    {stepTitle(step, form.draft.type)}
                  </Typography>
                </Box>
                <Box sx={{ p: 2.5 }}>{renderStep(step)}</Box>
              </Paper>
            ))}

          {form.warnings.length > 0 && (
            <Alert severity="warning">
              <Stack spacing={0.25}>
                {form.warnings.map((warning) => (
                  <span key={warning}>{warningLabel(warning)}</span>
                ))}
                <strong>{t('hint.canSaveIncomplete')}</strong>
              </Stack>
            </Alert>
          )}
        </Stack>
      </Container>

      <Paper
        square
        elevation={3}
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          p: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          zIndex: (theme) => theme.zIndex.appBar,
        }}
      >
        {form.error ? (
          <Alert severity="warning" sx={{ py: 0 }}>
            {problemLabel(form.error)}
          </Alert>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t('hint.numberOnSave')}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          variant={isDraft ? 'outlined' : 'contained'}
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
          disabled={!form.canSave || saving || filing}
          onClick={save}
        >
          {saving ? t('status.saving') : t('action.save')}
        </Button>
        {isDraft && (
          <Button
            variant="contained"
            startIcon={filing ? <CircularProgress size={16} /> : <CheckIcon />}
            disabled={!form.canSave || saving || filing}
            onClick={file}
          >
            {filing ? t('report.submitting') : t('report.submit')}
          </Button>
        )}
      </Paper>
    </Box>
  );
};
