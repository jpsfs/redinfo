import { useEffect, useState } from 'react';
import { Title, useGetIdentity, useLocaleState, usePermissions } from 'react-admin';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import {
  ABCDE_BANDS,
  Action,
  AbcdeFindings,
  CHAMU_FIELDS,
  EventReport,
  InventoryItemType,
  Locale,
  OCCURRENCE_TIME_FIELDS,
  UserRole,
  eventReportRules,
  formatEventReportCode,
  hasPermission,
  isEventReportInvolved,
  materialItemDisplayName,
  totalKilometres,
} from '@redinfo/shared';
import { apiDownload, apiFetch } from '../../api';
import { CategoryChip } from '../../components/CategoryChip';
import { RichTextViewer } from '../../components/RichTextViewer';
import {
  Translate,
  abcdeBandLabel,
  abcdeStatusLabel,
  avdsLevelLabel,
  chamuLabel,
  destinationLabel,
  genderLabel,
  inemUnitLabel,
  locationTypeLabel,
  occurrenceTimeLabel,
  reportTypeLabel,
  roleLabel,
  vitalLabel,
} from '../../i18n/labels';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import { useT } from '../../i18n/useT';
import { VITAL_FIELDS, formatVital } from '../liveRuns/vitalsFields';
import { minutesBetween, timeOfDay } from './reportDraft';

const Fact = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <Box>
    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled' }}>
      {label.toUpperCase()}
    </Typography>
    <Typography sx={{ fontWeight: 600 }}>{value}</Typography>
  </Box>
);

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Paper variant="outlined">
    <Box sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
    </Box>
    <Box sx={{ p: 2.5 }}>{children}</Box>
  </Paper>
);

/**
 * The chronology, as a rail with the gap between consecutive stamps.
 *
 * The gaps are the point: "12 min to the scene" is what a coordinator reads a
 * report for, and computing it here means nobody has to subtract two times in
 * their head. Gaps are measured between stamps that are actually filled in, so
 * a blank in the middle does not read as zero.
 */
const Chronology = ({ report }: { report: EventReport }) => {
  const t = useT();
  const marked = OCCURRENCE_TIME_FIELDS.map((field) => ({
    field,
    at: report[field] ?? null,
  }));

  let previous: string | null = null;

  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={{ xs: 1.5, md: 0 }}
      alignItems={{ md: 'flex-start' }}
    >
      {marked.map(({ field, at }, index) => {
        const gap = at && previous ? minutesBetween(previous, at) : null;
        if (at) previous = at;

        return (
          <Stack
            key={field}
            direction={{ xs: 'row', md: 'column' }}
            alignItems="center"
            spacing={1}
            sx={{ flex: 1, minWidth: 0 }}
          >
            {index > 0 && (
              <Typography
                variant="caption"
                sx={{ color: 'text.disabled', fontWeight: 600, display: { xs: 'none', md: 'block' } }}
              >
                {gap === null ? '—' : `${gap} min`}
              </Typography>
            )}
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: at ? 'text.secondary' : 'text.disabled' }}
            >
              {occurrenceTimeLabel(t, field)}
            </Typography>
            <Typography
              sx={{
                fontSize: '1.375rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: at ? 'text.primary' : 'text.disabled',
              }}
            >
              {timeOfDay(at) || '--:--'}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
};

/**
 * A filed report, as everyone else reads it.
 *
 * Loaded by hand rather than through react-admin's `Show`, for the same reason
 * the edit screen is: the record is nested, and the layout owes nothing to a
 * field-list convention.
 */
export const EventReportShow = () => {
  const t = useT();
  const intlLocale = useIntlLocale();
  const [locale] = useLocaleState();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { permissions } = usePermissions<UserRole[]>();
  const { identity } = useGetIdentity();
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

  // A draft has no code. Naming that in the title beats a blank heading, and
  // beats inventing a number another report is going to be given.
  const code = formatEventReportCode(report) ?? t('report.noNumberYet');
  const rules = eventReportRules(report.type);
  const viewerId = identity?.id !== undefined ? String(identity.id) : undefined;
  // Mirrors the backend's `assertCanWrite`: managing anyone's report needs
  // `MANAGE_EVENT_REPORTS`; otherwise editing is only for the crew of this
  // one activity, even though everyone can now read the whole archive.
  const canEdit = permissions
    ? hasPermission(permissions, Action.MANAGE_EVENT_REPORTS) ||
      (hasPermission(permissions, Action.CREATE_EVENT_REPORT) &&
        viewerId !== undefined &&
        isEventReportInvolved(report, viewerId))
    : false;

  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Title title={code} />

      <Stack spacing={2.5}>
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ sm: 'center' }}
          >
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography
                  variant="h4"
                  sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                >
                  {code}
                </Typography>
                <CategoryChip category={report.type} label={reportTypeLabel(t, report.type)} size="small" />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {[
                  report.occurredOn,
                  report.externalReference
                    ? `${
                        rules.requiresExternalReference
                          ? t('field.coduReference')
                          : t('field.reference')
                      } ${report.externalReference}`
                    : '',
                  report.shift?.label
                    ? `${t('field.shift')} ${report.shift.label}`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Typography>
            </Box>

            <Button
              startIcon={<PrintIcon />}
              color="secondary"
              variant="outlined"
              onClick={() => window.print()}
            >
              {t('action.print')}
            </Button>
            {canEdit && (
              <Button
                startIcon={<EditIcon />}
                variant="outlined"
                onClick={() => navigate(`/event-reports/${report.id}/edit`)}
              >
                {t('action.edit')}
              </Button>
            )}
          </Stack>
        </Paper>

        {rules.hasOccurrenceTimes && (
          <Card title={t('step.times')}>
            <Chronology report={report} />
          </Card>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1.15fr 1fr' },
            gap: 2.5,
            alignItems: 'start',
          }}
        >
          <Card title={t('step.whenWhere')}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' },
                gap: 2.5,
              }}
            >
              <Fact
                label={t('field.hours')}
                value={`${timeOfDay(report.startedAt) || '--:--'} – ${
                  timeOfDay(report.endedAt) || '--:--'
                }`}
              />
              <Fact
                label={t('field.locationType')}
                value={locationTypeLabel(t, report.locationType)}
              />
              <Fact
                label={t('field.locality')}
                value={
                  report.locality
                    ? `${report.locality.name}${
                        report.locality.municipality
                          ? ` · ${report.locality.municipality.name}`
                          : ''
                      }`
                    : '—'
                }
              />
              <Fact
                label={rules.maxVehicles === 1 ? t('field.vehicle') : t('field.vehiclesUsed')}
                value={
                  report.vehicles.length === 0
                    ? '—'
                    : report.vehicles
                        .map((line) => line.vehicle?.licensePlate ?? '')
                        .join(' · ')
                }
              />
              <Fact
                label={t('field.kilometres')}
                value={kilometresText(t, report)}
              />
            </Box>
          </Card>

          <Card title={t('field.crew')}>
            {report.crew.length === 0 ? (
              <Typography color="text.secondary">—</Typography>
            ) : (
              <Stack spacing={1.5}>
                {report.crew.map((member) => (
                  <Stack key={member.id} direction="row" spacing={1.5} alignItems="center">
                    <Typography sx={{ flex: 1, fontWeight: 600 }}>
                      {member.user
                        ? `${member.user.firstName} ${member.user.lastName}`
                        : member.userId}
                    </Typography>
                    {member.roleName && (
                      <Chip size="small" label={roleLabel(t, member.roleName)} />
                    )}
                  </Stack>
                ))}
              </Stack>
            )}
          </Card>
        </Box>

        <Card title={t('field.materials')}>
          {report.materials.length === 0 ? (
            <Typography color="text.secondary">{t('hint.noMaterials')}</Typography>
          ) : (
            <Stack divider={<Divider flexItem />} spacing={1.5}>
              {report.materials.map((material) => (
                <Stack key={material.id} direction="row" spacing={1.5} alignItems="center">
                  <Typography sx={{ flex: 1, fontWeight: 600 }}>
                    {material.materialItem
                      ? materialItemDisplayName(material.materialItem, locale as Locale)
                      : material.materialItemId}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {material.materialItem?.type === InventoryItemType.UNLIMITED
                      ? t('materialPicker.unlimitedLogged')
                      : `${material.quantity} ${material.materialItem?.unit ?? ''}`.trim()}
                  </Typography>
                  {/* Named only when there is more than one vehicle to tell
                      apart — on a single-vehicle report every line is
                      obviously that vehicle's, and naming it would be noise. */}
                  {report.vehicles.length > 1 && material.vehicle && (
                    <Chip
                      size="small"
                      label={`${material.vehicle.licensePlate} · ${material.vehicle.numeroCauda}`}
                    />
                  )}
                </Stack>
              ))}
            </Stack>
          )}
        </Card>

        <Card
          title={rules.maxVictims === 1 ? t('step.victims') : t('step.victimsPlural')}
        >
          {report.victims.length === 0 ? (
            <Typography color="text.secondary">{t('hint.noVictim')}</Typography>
          ) : (
            <Stack divider={<Divider flexItem />} spacing={1.5}>
              {report.victims.map((victim, index) => (
                <Stack
                  key={victim.id}
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  sx={{ pt: index === 0 ? 0 : 1.5 }}
                >
                  <Typography sx={{ fontWeight: 700, color: 'text.disabled', width: 28 }}>
                    {victim.position + 1}
                  </Typography>
                  <Typography sx={{ flex: 1, fontWeight: 600 }}>
                    {genderLabel(t, victim.gender)}, {victim.age} {t('field.years')}
                  </Typography>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <LocalHospitalIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                    <Typography variant="body2" color="text.secondary">
                      {victim.destinationHospital?.name ??
                        destinationLabel(t, victim.destinationKind)}
                    </Typography>
                  </Stack>
                  {victim.hospitalEpisodeNumber && (
                    <Chip
                      size="small"
                      label={`${t('field.hospitalEpisodeNumber')}: ${victim.hospitalEpisodeNumber}`}
                      sx={{ fontVariantNumeric: 'tabular-nums' }}
                    />
                  )}
                </Stack>
              ))}
            </Stack>
          )}
        </Card>

        {rules.hasInemSupportUnits && (
          <Card title={t('field.inemSupportUnits')}>
            {report.inemSupportUnits.length === 0 ? (
              <Typography color="text.secondary">{t('hint.noInemSupportUnits')}</Typography>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={1.5}>
                {report.inemSupportUnits.map((unit, index) => (
                  <Stack
                    key={unit.id}
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    sx={{ pt: index === 0 ? 0 : 1.5 }}
                  >
                    <Chip label={inemUnitLabel(t, unit.unitType)} sx={{ fontWeight: 700 }} />
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flex: 1 }}>
                      <LocalHospitalIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                      <Typography variant="body2" color="text.secondary">
                        {unit.hospital?.name ?? unit.hospitalId}
                      </Typography>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            )}
          </Card>
        )}

        {rules.hasClinicalRecord && <ClinicalCard report={report} />}

        <Card title={t('field.narrative')}>
          {report.operationalReport ? (
            <RichTextViewer html={report.operationalReport} />
          ) : (
            <Typography color="text.secondary">—</Typography>
          )}
        </Card>

        <Card title={t('field.attachments')}>
          {report.attachments.length === 0 ? (
            <Typography color="text.secondary">—</Typography>
          ) : (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {report.attachments.map((attachment) => (
                <Button
                  key={attachment.id}
                  size="small"
                  variant="outlined"
                  color="secondary"
                  startIcon={<DownloadIcon />}
                  onClick={() =>
                    void apiDownload(
                      `/event-reports/${report.id}/attachments/${attachment.id}`,
                      attachment.filename,
                    )
                  }
                >
                  {attachment.filename}
                </Button>
              ))}
            </Stack>
          )}
        </Card>

        <Typography variant="caption" color="text.disabled">
          {report.createdBy
            ? `${report.createdBy.firstName} ${report.createdBy.lastName} · `
            : ''}
          {new Date(report.createdAt).toLocaleString(intlLocale)}
        </Typography>
      </Stack>
    </Container>
  );
};

/**
 * How far the vehicles went, and where the figure came from.
 *
 * "por calcular" rather than "0 km" for a run closed with no network: zero is a
 * measurement, and a report that claims an ambulance travelled no distance is
 * worse than one that admits nobody has worked it out yet.
 */
function kilometresText(t: Translate, report: EventReport): string {
  const total = totalKilometres(report.vehicles);
  const computed = report.vehicles.some((line) => (line.routeLegs ?? []).length > 0);
  const overridden = report.vehicles.some((line) => line.isOverridden);

  if (total === 0 && !computed && report.vehicles.length > 0) {
    return t('report.kilometresPending');
  }

  const provenance = overridden
    ? ` · ${t('report.kilometresOverridden')}`
    : computed
      ? ` · ${t('report.kilometresComputed')}`
      : '';
  return `${total} ${t('field.kilometresShort')}${provenance}`;
}

/**
 * The clinical record, read-only.
 *
 * Emergency reports only. Vitals are a table with one column per set of
 * observations, because that is the question a reader has: not "what was the
 * blood pressure" but "what was it when we arrived, and what was it when we
 * handed over".
 */
const ClinicalCard = ({ report }: { report: EventReport }) => {
  const t = useT();
  const assessments = report.assessments ?? [];
  const findings = (report.abcde ?? {}) as AbcdeFindings;
  const chamu = CHAMU_FIELDS.filter((field) => (report[field] ?? '').trim() !== '');
  const bands = ABCDE_BANDS.filter((band) => findings[band]);

  if (assessments.length === 0 && chamu.length === 0 && bands.length === 0) return null;

  return (
    <Card title={t('live.vitals')}>
      <Stack spacing={2.5}>
        {assessments.length > 0 && (
          <Box sx={{ overflowX: 'auto' }}>
            <Box
              component="table"
              sx={{
                borderCollapse: 'collapse',
                minWidth: '100%',
                '& th, & td': {
                  textAlign: 'left',
                  py: 0.75,
                  pr: 2,
                  borderBottom: 1,
                  borderColor: 'divider',
                  whiteSpace: 'nowrap',
                },
                '& td': { fontVariantNumeric: 'tabular-nums' },
              }}
            >
              <thead>
                <tr>
                  <th>{t('field.takenAt')}</th>
                  {assessments.map((assessment) => (
                    <th key={assessment.id}>{timeOfDay(assessment.takenAt) || '--:--'}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {VITAL_FIELDS.filter((field) =>
                  assessments.some(
                    (assessment) =>
                      assessment[field.key] !== null && assessment[field.key] !== undefined,
                  ),
                ).map((field) => (
                  <tr key={field.key}>
                    <th scope="row">
                      {vitalLabel(t, field.key)}
                      {field.unit ? ` (${field.unit})` : ''}
                    </th>
                    {assessments.map((assessment) => (
                      <td key={assessment.id}>
                        {formatVital(assessment[field.key] ?? null, field.decimals) || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                {assessments.some((assessment) => assessment.avds) && (
                  <tr>
                    <th scope="row">{t('vital.avds')}</th>
                    {assessments.map((assessment) => (
                      <td key={assessment.id}>
                        {assessment.avds
                          ? `${assessment.avds} — ${avdsLevelLabel(t, assessment.avds)}`
                          : '—'}
                      </td>
                    ))}
                  </tr>
                )}
                {assessments.some((assessment) => assessment.bodyPosition) && (
                  <tr>
                    <th scope="row">{t('field.bodyPosition')}</th>
                    {assessments.map((assessment) => (
                      <td key={assessment.id}>{assessment.bodyPosition ?? '—'}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </Box>
          </Box>
        )}

        {bands.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled' }}>
              {t('live.abcde').toUpperCase()}
            </Typography>
            <Stack spacing={1} sx={{ mt: 0.75 }}>
              {bands.map((band) => (
                <Stack key={band} direction="row" spacing={1.5} alignItems="baseline">
                  <Typography sx={{ fontWeight: 700, minWidth: 200 }}>
                    {abcdeBandLabel(t, band)}
                  </Typography>
                  <Typography sx={{ flex: 1 }}>
                    {abcdeStatusLabel(t, findings[band]!.status)}
                    {findings[band]!.note ? ` — ${findings[band]!.note}` : ''}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}

        {chamu.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.disabled' }}>
              {t('live.chamu').toUpperCase()}
            </Typography>
            <Stack spacing={1} sx={{ mt: 0.75 }}>
              {chamu.map((field) => (
                <Box key={field}>
                  <Typography sx={{ fontWeight: 700 }}>{chamuLabel(t, field)}</Typography>
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>{report[field]}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
    </Card>
  );
};
