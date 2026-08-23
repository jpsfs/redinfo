import { useState } from 'react';
import { Title } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DescriptionIcon from '@mui/icons-material/Description';
import { EVENT_REPORT_TYPES, EventReportType, eventReportRules } from '@redinfo/shared';
import { reportTypeHint, reportTypeLabel, t } from '../../i18n/labels';
import { readCurrentRunId } from '../liveRuns';
import { StoredDraft, clearDraft, loadDraft } from './reportDraft';
import { useEventReportDraft } from './useEventReportDraft';
import { EventReportEditor } from './EventReportEditor';

/**
 * The first screen of a new report: which kind of activity was this.
 *
 * A separate screen rather than a field inside the form, because the answer
 * changes what the form *is* — how many steps it has, whether it asks for a
 * chronology, how many vehicles it takes. Choosing it first means the crew
 * never has fields appear and disappear underneath them.
 */
const TypeChooser = ({
  suggested,
  resumable,
  onChoose,
  onResume,
  onDiscard,
  onGoLive,
}: {
  suggested: EventReportType | null;
  resumable: StoredDraft | null;
  onChoose: (type: EventReportType) => void;
  onResume: () => void;
  onDiscard: () => void;
  onGoLive: () => void;
}) => (
  <Container maxWidth="sm" sx={{ py: 3 }}>
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {t('report.chooseType')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('report.chooseTypeHint')}
        </Typography>
      </Box>

      {EVENT_REPORT_TYPES.map((type) => (
        <Paper
          key={type}
          variant="outlined"
          onClick={() => onChoose(type)}
          data-testid={`choose-${type}`}
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            minHeight: 88,
            cursor: 'pointer',
            borderWidth: suggested === type ? 2 : 1,
            borderColor: suggested === type ? 'primary.main' : 'divider',
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '1.125rem' }}>
              {reportTypeLabel(type)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {reportTypeHint(type)}
            </Typography>
            {suggested === type && (
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                <Typography
                  variant="caption"
                  sx={{ color: 'success.main', fontWeight: 700 }}
                >
                  {t('report.yourShiftToday')}
                </Typography>
              </Stack>
            )}

            {/*
              The fork, exactly where the decision is made. `stopPropagation` so
              the card's own target is unchanged: this is an extra door, not a
              replacement, and typing the report up afterwards stays the default.
            */}
            {eventReportRules(type).supportsLiveRun && (
              <Button
                onClick={(event) => {
                  event.stopPropagation();
                  onGoLive();
                }}
                endIcon={<ChevronRightIcon />}
                sx={{ mt: 0.5, ml: -1, minHeight: 48, fontWeight: 700 }}
              >
                {readCurrentRunId() ? t('live.resume') : t('live.start')}
              </Button>
            )}
          </Box>
          <ChevronRightIcon sx={{ color: 'text.disabled' }} />
        </Paper>
      ))}

      {resumable && (
        <Alert
          severity="warning"
          icon={<DescriptionIcon />}
          action={
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={onResume}>
                {t('action.continueDraft')}
              </Button>
              <Button size="small" color="inherit" onClick={onDiscard}>
                {t('action.discardDraft')}
              </Button>
            </Stack>
          }
        >
          <strong>{t('status.draftUnfinished')}</strong>{' '}
          {reportTypeLabel(resumable.draft.type)} ·{' '}
          {new Date(resumable.savedAt).toLocaleString()}
        </Alert>
      )}
    </Stack>
  </Container>
);

/**
 * Filing a new report.
 *
 * Three states in one screen: pick a type, or pick up the draft the device
 * still holds, and then the form. An unfinished draft is offered rather than
 * silently resumed — the crew may have moved on to a different call, and
 * quietly reopening yesterday's half-report would be worse than asking.
 */
export const EventReportCreate = () => {
  const navigate = useNavigate();
  // Read once on mount: a draft that gets saved while this screen is open
  // belongs to the form below, not to this offer.
  const [resumable, setResumable] = useState<StoredDraft | null>(() => loadDraft());
  const [choice, setChoice] = useState<{ type: EventReportType; resume: boolean } | null>(
    null,
  );

  if (!choice) {
    return (
      <>
        <Title title={t('report.new')} />
        <TypeChooser
          // Which kind of report today's rota implies is a genuinely useful
          // hint, but it needs the crew-suggestion endpoint per type; until the
          // form is open there is nothing to ask about, so nothing is claimed.
          suggested={null}
          resumable={resumable}
          onChoose={(type) => setChoice({ type, resume: false })}
          onResume={() =>
            setChoice({ type: resumable!.draft.type, resume: true })
          }
          onDiscard={() => {
            clearDraft();
            setResumable(null);
          }}
          onGoLive={() => {
            const open = readCurrentRunId();
            navigate(open ? `/live/${open}` : '/live');
          }}
        />
      </>
    );
  }

  return <NewReportForm type={choice.type} resume={choice.resume} />;
};

/**
 * Mounted only once a type is settled, so the draft hook resolves its initial
 * state against a decision that has already been made rather than a null.
 */
const NewReportForm = ({
  type,
  resume,
}: {
  type: EventReportType;
  resume: boolean;
}) => {
  const form = useEventReportDraft({ type, resume });
  return (
    <>
      <Title title={t('report.new')} />
      <EventReportEditor form={form} />
    </>
  );
};
