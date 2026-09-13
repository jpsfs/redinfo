import { useCallback, useEffect, useMemo, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Patient,
  StaffAbsenceKind,
  TransportRequest,
  TransportRequestDecision,
  TransportRequestFeasibility,
  TransportRequestOccurrenceType,
  TransportRequestVehicleType,
  mapTransportRequestVehicleType,
} from '@redinfo/shared';
import { apiFetch, ApiError } from '../api';
import { apiErrorLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';
import { useIntlLocale } from '../i18n/useIntlLocale';
import { DecisionChip } from '../resources/transportRequests';

/**
 * The decision page (#229): a queue of referrals awaiting an accept/reject,
 * ordered by deadline, a persistent second queue for what's accepted but not
 * yet clicked through on the requester's own platform, and — for whichever
 * referral is selected — the same fields the intake form (#228) collects,
 * plus a feasibility snapshot for the appointment date. A standalone page
 * rather than a react-admin `Show`: the side-by-side of referral and
 * feasibility is the entire point, and a `Show` view cannot carry it.
 *
 * Deliberately not built against any assumption about how a referral
 * arrived — today it's always transcribed from an email by hand (#228), but
 * a phone call or a future SGTD platform integration would land in the same
 * `TransportRequest` row the same way; nothing here reads `batchReference`
 * as "the email".
 */

interface TransportRequestPage {
  data: TransportRequest[];
  total: number;
}

const TICK_MS = 1000;

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Minutes remaining against `responseDueAt`, recomputed every tick from
 * `now` rather than the number the list API handed back once — the point of
 * a *live* countdown (unlike `TimeRemaining` in the intake list). */
function useMinutesRemaining(responseDueAt: string, now: Date): number {
  return Math.round((new Date(responseDueAt).getTime() - now.getTime()) / 60000);
}

const ReferralCountdown = ({ responseDueAt, now, prominent }: { responseDueAt: string; now: Date; prominent?: boolean }) => {
  const t = useT();
  const minutes = useMinutesRemaining(responseDueAt, now);
  const overdue = minutes < 0;
  // Prominent as it nears zero: plain text well before the deadline, bold
  // amber inside the last hour, bold red once inside 15 minutes or overdue.
  const urgent = overdue || minutes <= 15;
  const nearing = !urgent && minutes <= 60;
  return (
    <Typography
      variant={prominent ? 'h6' : 'body2'}
      component="span"
      color={urgent ? 'error.main' : nearing ? 'warning.main' : 'text.secondary'}
      sx={{ fontWeight: urgent ? 800 : nearing ? 700 : prominent ? 600 : 400 }}
    >
      {overdue
        ? t('transportRequestList.overdueByMinutes', { minutes: Math.abs(minutes) })
        : t('transportRequestList.minutesRemaining', { minutes })}
    </Typography>
  );
};

const OCCURRENCE_LABEL_KEY = (value: TransportRequestOccurrenceType) => `transportRequestOccurrenceType.${value}` as const;
const VEHICLE_TYPE_LABEL_KEY = (value: TransportRequestVehicleType) => `transportRequestVehicleType.${value}` as const;

const absenceKindLabel = (t: ReturnType<typeof useT>, kind: StaffAbsenceKind): string => {
  switch (kind) {
    case StaffAbsenceKind.VACATION:
      return t('staffAbsences.kindVacation');
    case StaffAbsenceKind.SICK_LEAVE:
      return t('staffAbsences.kindSickLeave');
    case StaffAbsenceKind.OTHER_PAID_LEAVE:
      return t('staffAbsences.kindOtherPaidLeave');
    default:
      return kind;
  }
};

/** One referral row in either queue — the requester, the occurrence and a
 * live countdown are enough to triage without opening it. */
const ReferralRow = ({
  referral,
  now,
  selected,
  onSelect,
}: {
  referral: TransportRequest;
  now: Date;
  selected: boolean;
  onSelect: () => void;
}) => {
  const t = useT();
  return (
    <Paper
      variant="outlined"
      onClick={onSelect}
      sx={{
        p: 1.5,
        cursor: 'pointer',
        borderColor: selected ? 'primary.main' : undefined,
        borderWidth: selected ? 2 : 1,
        bgcolor: selected ? 'action.selected' : undefined,
      }}
    >
      <Stack spacing={0.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography sx={{ fontWeight: 700 }}>{referral.externalServiceNumber}</Typography>
          <DecisionChip decision={referral.decision} />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {referral.requestingOrganisation?.name ?? '—'}
          {' · '}
          {t(OCCURRENCE_LABEL_KEY(referral.occurrenceType))}
        </Typography>
        <ReferralCountdown responseDueAt={referral.responseDueAt} now={now} />
      </Stack>
    </Paper>
  );
};

/** A read-only label/value pair — the detail panel's whole vocabulary. */
const Field = ({ label, value }: { label: string; value: string }) => (
  <Box>
    <Typography variant="caption" color="text.secondary" display="block">
      {label}
    </Typography>
    <Typography variant="body2">{value || '—'}</Typography>
  </Box>
);

const FeasibilityPanel = ({
  feasibility,
  requestedVehicleType,
}: {
  feasibility: TransportRequestFeasibility;
  requestedVehicleType: TransportRequestVehicleType;
}) => {
  const t = useT();
  const intlLocale = useIntlLocale();

  const mappedType = mapTransportRequestVehicleType(requestedVehicleType);

  const requestedAvailabilityAlert =
    feasibility.requestedVehicleTypeFree === null ? (
      <Alert severity="info">{t('transportReferrals.requestedTypeUnknown')}</Alert>
    ) : feasibility.requestedVehicleTypeFree ? (
      <Alert severity="success">{t('transportReferrals.requestedTypeAvailable')}</Alert>
    ) : (
      <Alert severity="warning">{t('transportReferrals.requestedTypeUnavailable')}</Alert>
    );

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1">
        {t('transportReferrals.feasibilityTitle', { date: feasibility.date })}
      </Typography>
      {requestedAvailabilityAlert}

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t('transportReferrals.rosterTitle')}
        </Typography>
        {feasibility.roster.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('transportReferrals.rosterEmpty')}
          </Typography>
        ) : (
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
            {feasibility.roster.map((member, index) => (
              <Chip
                key={`${member.userId}-${index}`}
                size="small"
                label={`${member.firstName} ${member.lastName}${member.roleName ? ` · ${member.roleName}` : ''}`}
              />
            ))}
          </Stack>
        )}
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t('transportReferrals.absencesTitle')}
        </Typography>
        {feasibility.absentStaff.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('transportReferrals.absencesEmpty')}
          </Typography>
        ) : (
          <Stack spacing={0.5}>
            {feasibility.absentStaff.map((absence, index) => (
              <Typography variant="body2" key={`${absence.userId}-${index}`}>
                {absence.userName} — {absenceKindLabel(t, absence.kind)}
              </Typography>
            ))}
          </Stack>
        )}
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t('transportReferrals.committedVehiclesTitle')}
        </Typography>
        {feasibility.committedVehicles.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('transportReferrals.committedVehiclesEmpty')}
          </Typography>
        ) : (
          <Stack spacing={0.5}>
            {feasibility.committedVehicles.map((vehicle, index) => (
              <Typography variant="body2" key={`${vehicle.vehicleId}-${index}`}>
                {vehicle.licensePlate} ({vehicle.numeroCauda}) · {t(`vehicleType.${vehicle.vehicleType}`)} ·{' '}
                {new Date(vehicle.startsAt).toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' })}–
                {new Date(vehicle.endsAt).toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' })}
              </Typography>
            ))}
          </Stack>
        )}
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t('transportReferrals.freeVehiclesTitle')}
        </Typography>
        <Stack spacing={0.5}>
          {feasibility.freeVehiclesByType.map((group) => (
            <Typography
              variant="body2"
              key={group.vehicleType}
              sx={{ fontWeight: mappedType !== null && group.vehicleType === mappedType ? 700 : 400 }}
            >
              {t(`vehicleType.${group.vehicleType}`)}: {group.vehicles.length}
              {group.vehicles.length > 0 ? ` (${group.vehicles.map((v) => v.licensePlate).join(', ')})` : ''}
            </Typography>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
};

const RejectDialogInline = ({
  onCancel,
  onConfirm,
  submitting,
}: {
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  submitting: boolean;
}) => {
  const t = useT();
  const [reason, setReason] = useState('');
  return (
    <Stack spacing={1.5} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="subtitle2">{t('transportReferrals.rejectDialogTitle')}</Typography>
      <TextField
        label={t('transportReferrals.rejectReasonLabel')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        multiline
        minRows={2}
        fullWidth
        size="small"
      />
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button onClick={onCancel} disabled={submitting}>
          {t('transportReferrals.cancel')}
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={submitting || !reason.trim()}
          onClick={() => onConfirm(reason.trim())}
        >
          {t('transportReferrals.rejectConfirm')}
        </Button>
      </Stack>
    </Stack>
  );
};

const ReferralDetail = ({
  referral,
  now,
  onDecided,
}: {
  referral: TransportRequest;
  now: Date;
  onDecided: () => void;
}) => {
  const t = useT();
  const intlLocale = useIntlLocale();
  const notify = useNotify();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [feasibility, setFeasibility] = useState<TransportRequestFeasibility | null>(null);
  const [feasibilityError, setFeasibilityError] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPatient(null);
    apiFetch<Patient>(`/patients/${referral.patientId}`)
      .then((p) => {
        if (!cancelled) setPatient(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [referral.patientId]);

  useEffect(() => {
    let cancelled = false;
    setFeasibility(null);
    setFeasibilityError(false);
    apiFetch<TransportRequestFeasibility>(`/transport-requests/${referral.id}/feasibility`)
      .then((data) => {
        if (!cancelled) setFeasibility(data);
      })
      .catch(() => {
        if (!cancelled) setFeasibilityError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [referral.id]);

  const notifyError = useCallback(
    (e: unknown, fallbackKey: Parameters<typeof t>[0]) => {
      notify(e instanceof ApiError ? apiErrorLabel(t, e) : e instanceof Error ? e.message : t(fallbackKey), {
        type: 'error',
      });
    },
    [notify, t],
  );

  const decide = async (decision: TransportRequestDecision.ACCEPTED | TransportRequestDecision.REJECTED, rejectionReason?: string) => {
    setSubmitting(true);
    try {
      await apiFetch(`/transport-requests/${referral.id}/decide`, {
        method: 'POST',
        body: { decision, rejectionReason },
      });
      notify(
        decision === TransportRequestDecision.ACCEPTED ? t('transportReferrals.accepted') : t('transportReferrals.rejected'),
        { type: 'success' },
      );
      setRejecting(false);
      onDecided();
    } catch (e) {
      notifyError(e, decision === TransportRequestDecision.ACCEPTED ? 'transportReferrals.acceptFailed' : 'transportReferrals.rejectFailed');
    } finally {
      setSubmitting(false);
    }
  };

  const registerExternally = async () => {
    setSubmitting(true);
    try {
      await apiFetch(`/transport-requests/${referral.id}/register-external`, { method: 'POST' });
      notify(t('transportReferrals.registeredExternally'), { type: 'success' });
      onDecided();
    } catch (e) {
      notifyError(e, 'transportReferrals.registerExternalFailed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
        <Typography variant="h6">{referral.externalServiceNumber}</Typography>
        <DecisionChip decision={referral.decision} />
        {referral.decision === TransportRequestDecision.PENDING && (
          <ReferralCountdown responseDueAt={referral.responseDueAt} now={now} prominent />
        )}
      </Stack>

      {referral.decision === TransportRequestDecision.REJECTED && referral.rejectionReason && (
        <Alert severity="error">
          {t('transportReferrals.rejectionReasonLabel')}: {referral.rejectionReason}
        </Alert>
      )}
      {referral.decidedAt && (
        <Typography variant="body2" color="text.secondary">
          {t('transportReferrals.decidedBy', {
            name: referral.createdBy ? `${referral.createdBy.firstName} ${referral.createdBy.lastName}` : referral.decidedByUserId ?? '',
            date: new Date(referral.decidedAt).toLocaleString(intlLocale),
          })}
        </Typography>
      )}
      {referral.externallyRegisteredAt && (
        <Alert severity="success">
          {t('transportReferrals.externallyRegisteredAt', {
            date: new Date(referral.externallyRegisteredAt).toLocaleString(intlLocale),
          })}
        </Alert>
      )}

      <Divider />

      <Typography variant="subtitle2">{t('transportRequestForm.sectionEnvelope')}</Typography>
      <Stack direction="row" flexWrap="wrap" gap={2}>
        <Field label={t('resources.transport-requests.fields.batchReference')} value={referral.batchReference} />
        <Field
          label={t('resources.transport-requests.fields.communicatedAt')}
          value={new Date(referral.communicatedAt).toLocaleString(intlLocale)}
        />
        <Field label={t('resources.transport-requests.fields.requesterAccountCode')} value={referral.requesterAccountCode} />
        <Field
          label={t('resources.transport-requests.fields.responseDueAt')}
          value={new Date(referral.responseDueAt).toLocaleString(intlLocale)}
        />
      </Stack>

      <Divider />

      <Typography variant="subtitle2">{t('transportRequestForm.sectionService')}</Typography>
      <Stack direction="row" flexWrap="wrap" gap={2}>
        <Field label={t('resources.transport-requests.fields.externalServiceNumber')} value={referral.externalServiceNumber} />
        <Field
          label={t('resources.transport-requests.fields.appointmentAt')}
          value={new Date(referral.appointmentAt).toLocaleString(intlLocale)}
        />
        <Field
          label={t('resources.transport-requests.fields.requestingOrganisationId')}
          value={referral.requestingOrganisation?.name ?? '—'}
        />
        <Field label={t('resources.transport-requests.fields.payingOrganisationId')} value={referral.payingOrganisation?.name ?? '—'} />
        <Field label={t('resources.transport-requests.fields.agreementId')} value={referral.agreement?.name ?? '—'} />
        <Field label={t('resources.transport-requests.fields.patientId')} value={patient?.identity?.fullName ?? '—'} />
        <Field label={t('resources.transport-requests.fields.occurrenceType')} value={t(OCCURRENCE_LABEL_KEY(referral.occurrenceType))} />
        <Field
          label={t('resources.transport-requests.fields.requestedVehicleType')}
          value={t(VEHICLE_TYPE_LABEL_KEY(referral.requestedVehicleType))}
        />
        <Field label={t('resources.transport-requests.fields.escortTravels')} value={referral.escortTravels ? '✓' : '—'} />
        <Field label={t('resources.transport-requests.fields.isRoundTrip')} value={referral.isRoundTrip ? '✓' : '—'} />
      </Stack>

      <Divider />

      <Typography variant="subtitle2">{t('transportRequestForm.sectionOrigin')}</Typography>
      <Field label={t('resources.transport-requests.fields.originAddress')} value={referral.originAddress} />

      <Divider />

      <Typography variant="subtitle2">{t('transportRequestForm.sectionDestination')}</Typography>
      <Field label={t('resources.transport-requests.fields.destinationFacilityId')} value={referral.destinationFacility?.name ?? '—'} />

      {(referral.freeTextMessage || referral.coordColumnValue) && (
        <>
          <Divider />
          {referral.freeTextMessage && (
            <Field label={t('resources.transport-requests.fields.freeTextMessage')} value={referral.freeTextMessage} />
          )}
          {referral.coordColumnValue && (
            <Field label={t('resources.transport-requests.fields.coordColumnValue')} value={referral.coordColumnValue} />
          )}
        </>
      )}

      <Divider />

      {feasibilityError && <Alert severity="warning">{t('transportReferrals.feasibilityFailed')}</Alert>}
      {!feasibilityError && !feasibility && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <CircularProgress size={20} />
        </Box>
      )}
      {feasibility && <FeasibilityPanel feasibility={feasibility} requestedVehicleType={referral.requestedVehicleType} />}

      <Divider />

      {referral.decision === TransportRequestDecision.PENDING && !rejecting && (
        <Stack direction="row" spacing={1.5}>
          <Button variant="contained" color="success" disabled={submitting} onClick={() => decide(TransportRequestDecision.ACCEPTED)}>
            {t('transportReferrals.acceptButton')}
          </Button>
          <Button variant="outlined" color="error" disabled={submitting} onClick={() => setRejecting(true)}>
            {t('transportReferrals.rejectButton')}
          </Button>
        </Stack>
      )}
      {referral.decision === TransportRequestDecision.PENDING && rejecting && (
        <RejectDialogInline
          submitting={submitting}
          onCancel={() => setRejecting(false)}
          onConfirm={(reason) => decide(TransportRequestDecision.REJECTED, reason)}
        />
      )}
      {referral.decision === TransportRequestDecision.ACCEPTED && !referral.externallyRegisteredAt && (
        <Button variant="contained" disabled={submitting} onClick={registerExternally}>
          {t('transportReferrals.registerExternalButton')}
        </Button>
      )}
    </Stack>
  );
};

export const TransportReferralsPage = () => {
  const t = useT();
  const notify = useNotify();
  const now = useNow();

  const [queue, setQueue] = useState<TransportRequest[]>([]);
  const [undispatched, setUndispatched] = useState<TransportRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiFetch<TransportRequestPage>('/transport-requests?decision=PENDING&perPage=200'),
      apiFetch<TransportRequestPage>('/transport-requests?awaitingExternalRegistration=true&perPage=200'),
    ])
      .then(([pending, notRegistered]) => {
        if (cancelled) return;
        setQueue(pending.data);
        setUndispatched(notRegistered.data);
      })
      .catch((e) => {
        if (!cancelled) notify(e instanceof ApiError ? apiErrorLabel(t, e) : t('transportReferrals.loadFailed'), { type: 'error' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  const selected = useMemo(
    () => [...queue, ...undispatched].find((r) => r.id === selectedId) ?? null,
    [queue, undispatched, selectedId],
  );

  const handleDecided = useCallback(() => {
    setSelectedId(null);
    reload();
  }, [reload]);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <Title title={t('transportReferrals.pageTitle')} />
      <Typography variant="h5" sx={{ mb: 2 }}>
        {t('transportReferrals.pageTitle')}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: 'flex-start' }}>
        <Stack spacing={2} sx={{ width: { xs: '100%', md: 380 }, flexShrink: 0 }}>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              {t('transportReferrals.queueTitle')} ({queue.length})
            </Typography>
            <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={20} />
                </Box>
              ) : queue.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('transportReferrals.queueEmpty')}
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {queue.map((referral) => (
                    <ReferralRow
                      key={referral.id}
                      referral={referral}
                      now={now}
                      selected={referral.id === selectedId}
                      onSelect={() => setSelectedId(referral.id)}
                    />
                  ))}
                </Stack>
              )}
            </Box>
          </Paper>

          {/* Persistent — never allowed to scroll off the screen, since an
              accepted referral nobody ever registered externally only
              surfaces later as nobody showing up (AB#229). */}
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
              {t('transportReferrals.undispatchedTitle')} ({undispatched.length})
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              {t('transportReferrals.undispatchedHelp')}
            </Typography>
            <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
              {undispatched.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('transportReferrals.undispatchedEmpty')}
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {undispatched.map((referral) => (
                    <ReferralRow
                      key={referral.id}
                      referral={referral}
                      now={now}
                      selected={referral.id === selectedId}
                      onSelect={() => setSelectedId(referral.id)}
                    />
                  ))}
                </Stack>
              )}
            </Box>
          </Paper>
        </Stack>

        <Paper variant="outlined" sx={{ p: 2, flexGrow: 1, minWidth: 0, width: '100%' }}>
          {selected ? (
            <ReferralDetail key={selected.id} referral={selected} now={now} onDecided={handleDecided} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              {t('transportReferrals.selectPrompt')}
            </Typography>
          )}
        </Paper>
      </Box>
    </Box>
  );
};
