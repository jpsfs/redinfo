import { useState } from 'react';
import {
  Box,
  Chip,
  Dialog,
  Divider,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import { ABCDE_BANDS, AbcdeFindings, CHAMU_FIELDS, MAX_HOSPITAL_EPISODE_NUMBER_LENGTH } from '@redinfo/shared';
import { abcdeBandLabel, abcdeStatusLabel, avdsLevelLabel, chamuLabel, genderLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { timeOfDay } from '../eventReports/reportDraft';
import { ReportLookups } from '../eventReports/useReportLookups';
import { LiveRunHandle } from './useLiveRun';
import { VITAL_FIELDS, formatVital } from './vitalsFields';

/**
 * Groups a string of digits in threes, left to right — `"123456789"` becomes
 * `"123 456 789"`. How the SNS number is read aloud at a hospital desk, so it
 * is shown the same way it is spoken rather than as one long run of digits.
 */
function groupInThrees(digits: string | null | undefined): string {
  if (!digits) return '—';
  const clean = digits.replace(/\D/g, '');
  if (!clean) return '—';
  return clean.replace(/(\d{3})(?=\d)/g, '$1 ');
}

/** Up, down, or unchanged against the previous set — never the raw numbers. */
const VitalDelta = ({ latest, previous }: { latest: number | null; previous: number | null }) => {
  if (latest === null || previous === null || latest === previous) {
    return <DragHandleIcon fontSize="small" sx={{ color: 'text.disabled' }} />;
  }
  return latest > previous ? (
    <ArrowUpwardIcon fontSize="small" color="warning" />
  ) : (
    <ArrowDownwardIcon fontSize="small" color="warning" />
  );
};

const BigFact = ({ label, value }: { label: string; value: string }) => (
  <Box>
    <Typography sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '1rem' }}>
      {label}
    </Typography>
    <Typography
      sx={{
        fontWeight: 800,
        fontSize: '2.5rem',
        lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </Typography>
  </Box>
);

const SmallFact = ({ label, value }: { label: string; value: string }) => (
  <Box>
    <Typography sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.875rem' }}>
      {label}
    </Typography>
    <Typography sx={{ fontWeight: 700, fontSize: '1.25rem' }}>{value}</Typography>
  </Box>
);

/**
 * Read the run out to hospital staff, full screen, at arm's length.
 *
 * Everything here comes from `form.run` and `lookups` already held by the live
 * shell — no new API call, because the one thing this screen must never do is
 * spin while a nurse is waiting for a number.
 *
 * Two tabs rather than one long scroll: ADMISSÃO is what the front desk asks
 * for first (CODU reference, SNS, name), TRIAGEM is what the clinical handover
 * needs (vitals, AVDS, ABCDE, CHAMU). The one writable control in the whole
 * sheet — the episode number the hospital hands back — sits at the bottom of
 * ADMISSÃO, deliberately separated from the CODU reference above it: under
 * pressure those two numbers must never be confused for one another.
 */
export const HandoverSheet = ({
  open,
  onClose,
  form,
  lookups,
}: {
  open: boolean;
  onClose: () => void;
  form: LiveRunHandle;
  lookups: ReportLookups;
}) => {
  const t = useT();
  const [tab, setTab] = useState<'admission' | 'triage'>('admission');

  const { run } = form;
  const identity = run.identity ?? null;
  const destinationHospital = run.destinationHospitalId
    ? lookups.hospitalsById[run.destinationHospitalId]
    : undefined;

  const assessments = form.assessments;
  const latest = assessments[assessments.length - 1];
  const previous = assessments.length > 1 ? assessments[assessments.length - 2] : undefined;
  const findings = (run.capture?.abcde ?? {}) as AbcdeFindings;
  const bandsWithContent = ABCDE_BANDS.filter((band) => findings[band]);
  const chamuWithContent = CHAMU_FIELDS.filter((field) => (run.capture?.[field] ?? '').trim() !== '');

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          bgcolor: 'background.default',
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
        >
          <Typography sx={{ flex: 1, fontWeight: 800, fontSize: '1.25rem' }}>
            {t('live.handover.title')}
          </Typography>
          <IconButton
            onClick={onClose}
            aria-label={t('action.close')}
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            <CloseIcon />
          </IconButton>
        </Stack>

        <Tabs
          value={tab}
          onChange={(_event, next) => setTab(next)}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 56, fontWeight: 800 } }}
        >
          <Tab value="admission" label={t('live.handover.admission')} />
          <Tab value="triage" label={t('live.handover.triage')} />
        </Tabs>

        <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
          {tab === 'admission' && (
            <Stack spacing={3}>
              <BigFact label={t('field.coduReference')} value={run.externalReference || '—'} />
              <BigFact
                label={t('field.victimSnsNumber')}
                value={groupInThrees(identity?.victimSnsNumber)}
              />
              <SmallFact label={t('field.victimName')} value={identity?.victimName || '—'} />

              <Stack direction="row" spacing={3}>
                <SmallFact
                  label={t('field.victimDateOfBirth')}
                  value={identity?.victimDateOfBirth || '—'}
                />
                <SmallFact
                  label={t('field.age')}
                  value={run.victimAge !== null && run.victimAge !== undefined ? String(run.victimAge) : '—'}
                />
              </Stack>

              <Stack direction="row" spacing={3}>
                <SmallFact
                  label={t('field.gender')}
                  value={run.victimGender ? genderLabel(t, run.victimGender) : '—'}
                />
                <SmallFact
                  label={t('field.destination')}
                  value={destinationHospital?.name ?? '—'}
                />
              </Stack>

              <Divider sx={{ pt: 1 }} />

              {/*
                The one writable field in the whole sheet, and visually apart
                from the CODU reference above by a divider and its own block —
                the "número de episódio de urgência" the hospital hands back on
                admission, not to be confused with the CODU number the crew
                arrived with.
              */}
              <Box>
                <Typography sx={{ fontWeight: 800, mb: 1 }}>
                  {t('live.handover.episodeNumberTitle')}
                </Typography>
                <TextField
                  fullWidth
                  value={run.hospitalEpisodeNumber ?? ''}
                  onChange={(event) =>
                    form.patchLater({ hospitalEpisodeNumber: event.target.value })
                  }
                  inputProps={{
                    inputMode: 'numeric',
                    maxLength: MAX_HOSPITAL_EPISODE_NUMBER_LENGTH,
                    'aria-label': t('live.handover.episodeNumberTitle'),
                    style: { fontSize: '1.5rem', fontWeight: 700 },
                  }}
                />
              </Box>
            </Stack>
          )}

          {tab === 'triage' && (
            <Stack spacing={3}>
              <SmallFact label={t('field.chiefComplaint')} value={run.chiefComplaint || '—'} />

              {latest ? (
                <Box>
                  <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.125rem' }}>
                      {t('live.vitals')}
                    </Typography>
                    <Typography color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {timeOfDay(latest.takenAt)}
                    </Typography>
                  </Stack>

                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 2,
                    }}
                  >
                    {VITAL_FIELDS.filter(
                      (field) => latest[field.key] !== null && latest[field.key] !== undefined,
                    ).map((field) => (
                      <Stack key={field.key} direction="row" alignItems="center" spacing={1}>
                        <VitalDelta
                          latest={latest[field.key] ?? null}
                          previous={previous?.[field.key] ?? null}
                        />
                        <Box>
                          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                            {field.label}
                          </Typography>
                          <Typography
                            sx={{
                              fontWeight: 800,
                              fontSize: '1.5rem',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatVital(latest[field.key] ?? null, field.decimals)} {field.unit}
                          </Typography>
                        </Box>
                      </Stack>
                    ))}
                  </Box>

                  {latest.avds && (
                    <Chip
                      color="warning"
                      label={`AVDS — ${latest.avds} — ${avdsLevelLabel(t, latest.avds)}`}
                      sx={{ mt: 2, minHeight: 44, fontWeight: 800 }}
                    />
                  )}
                </Box>
              ) : (
                <Typography color="text.secondary">{t('live.noAssessments')}</Typography>
              )}

              {bandsWithContent.length > 0 && (
                <Box>
                  <Typography sx={{ fontWeight: 800, mb: 1 }}>{t('live.abcde')}</Typography>
                  <Stack spacing={1}>
                    {bandsWithContent.map((band) => (
                      <Stack key={band} direction="row" spacing={1.5} alignItems="baseline">
                        <Typography sx={{ fontWeight: 700, minWidth: 180 }}>
                          {abcdeBandLabel(t, band)}
                        </Typography>
                        <Typography sx={{ flex: 1, fontSize: '1.0625rem' }}>
                          {abcdeStatusLabel(t, findings[band]!.status)}
                          {findings[band]!.note ? ` — ${findings[band]!.note}` : ''}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}

              {chamuWithContent.length > 0 && (
                <Box>
                  <Typography sx={{ fontWeight: 800, mb: 1 }}>{t('live.chamu')}</Typography>
                  <Stack spacing={1.5}>
                    {chamuWithContent.map((field) => (
                      <Box key={field}>
                        <Typography sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.875rem' }}>
                          {chamuLabel(t, field)}
                        </Typography>
                        <Typography sx={{ fontSize: '1.0625rem' }}>{run.capture?.[field]}</Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          )}
        </Box>
      </Box>
    </Dialog>
  );
};
