import { useCallback, useEffect, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  ArrivalWindowThresholds,
  OccurrenceTypePolicy,
  OccurrenceTypePolicyInput,
  PatientHandlingThresholds,
  TransportRequestOccurrenceType,
  validateArrivalWindowThresholds,
  validateOccurrenceTypePolicy,
  validatePatientHandlingThresholds,
} from '@redinfo/shared';
import { apiFetch } from '../api';
import { useT } from '../i18n/useT';

const THRESHOLDS_URL = '/transport-config/arrival-window-thresholds';
const HANDLING_URL = '/transport-config/patient-handling-thresholds';
const POLICIES_URL = '/transport-config/occurrence-type-policies';

/**
 * Planning policy for non-urgent transport (#233), not physics — two pieces
 * of config a coordinator must be able to change without a deploy, gated
 * `MANAGE_TRANSPORT_CONFIG` the same as `organisations`/`agreements`:
 *
 * - The delegation-wide arrival window thresholds. A facility can carry its
 *   own override of any of the three fields on its own form
 *   (`resources/facilities`); this screen only ever edits the default.
 * - The per-patient pickup/drop-off handling time — how long it actually
 *   takes to get someone in or out of the vehicle, folded into the board's
 *   suggested pickup/home-arrival times (`suggestLegTimes`).
 * - The duration floor/default per `TransportRequestOccurrenceType`, one row
 *   each, always present (seeded by migration).
 *
 * Both PUT/PATCH endpoints require every field of the object they replace —
 * no partial patch — so each save sends the whole draft, never a diff.
 */
export const TransportConfigPage = () => {
  const t = useT();
  const notify = useNotify();

  const [thresholdsDraft, setThresholdsDraft] = useState<ArrivalWindowThresholds | null>(null);
  const [thresholdsError, setThresholdsError] = useState<string | null>(null);
  const [savingThresholds, setSavingThresholds] = useState(false);

  const [handlingDraft, setHandlingDraft] = useState<PatientHandlingThresholds | null>(null);
  const [handlingError, setHandlingError] = useState<string | null>(null);
  const [savingHandling, setSavingHandling] = useState(false);

  const [policies, setPolicies] = useState<OccurrenceTypePolicy[] | null>(null);
  const [policiesError, setPoliciesError] = useState<string | null>(null);
  const [policyDrafts, setPolicyDrafts] = useState<Record<string, OccurrenceTypePolicyInput>>({});
  const [savingType, setSavingType] = useState<TransportRequestOccurrenceType | null>(null);

  const loadThresholds = useCallback(async () => {
    setThresholdsError(null);
    try {
      setThresholdsDraft(await apiFetch<ArrivalWindowThresholds>(THRESHOLDS_URL));
    } catch (e) {
      setThresholdsError(e instanceof Error ? e.message : t('transportConfig.loadFailed'));
    }
  }, [t]);

  const loadHandling = useCallback(async () => {
    setHandlingError(null);
    try {
      setHandlingDraft(await apiFetch<PatientHandlingThresholds>(HANDLING_URL));
    } catch (e) {
      setHandlingError(e instanceof Error ? e.message : t('transportConfig.loadFailed'));
    }
  }, [t]);

  const loadPolicies = useCallback(async () => {
    setPoliciesError(null);
    try {
      const data = await apiFetch<OccurrenceTypePolicy[]>(POLICIES_URL);
      setPolicies(data);
      setPolicyDrafts(
        Object.fromEntries(
          data.map((policy) => [
            policy.occurrenceType,
            {
              minimumDurationMinutes: policy.minimumDurationMinutes,
              defaultDurationMinutes: policy.defaultDurationMinutes,
            },
          ]),
        ),
      );
    } catch (e) {
      setPoliciesError(e instanceof Error ? e.message : t('transportConfig.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void loadThresholds();
    void loadHandling();
    void loadPolicies();
  }, [loadThresholds, loadHandling, loadPolicies]);

  const thresholdsFieldError = thresholdsDraft ? validateArrivalWindowThresholds(thresholdsDraft) : null;

  const saveThresholds = async () => {
    if (!thresholdsDraft || thresholdsFieldError) return;
    setSavingThresholds(true);
    try {
      setThresholdsDraft(await apiFetch<ArrivalWindowThresholds>(THRESHOLDS_URL, { method: 'PUT', body: thresholdsDraft }));
      notify(t('transportConfig.saved'), { type: 'success' });
    } catch (e) {
      notify(e instanceof Error ? e.message : t('transportConfig.saveFailed'), { type: 'warning' });
    } finally {
      setSavingThresholds(false);
    }
  };

  const handlingFieldError = handlingDraft ? validatePatientHandlingThresholds(handlingDraft) : null;

  const saveHandling = async () => {
    if (!handlingDraft || handlingFieldError) return;
    setSavingHandling(true);
    try {
      setHandlingDraft(await apiFetch<PatientHandlingThresholds>(HANDLING_URL, { method: 'PUT', body: handlingDraft }));
      notify(t('transportConfig.saved'), { type: 'success' });
    } catch (e) {
      notify(e instanceof Error ? e.message : t('transportConfig.saveFailed'), { type: 'warning' });
    } finally {
      setSavingHandling(false);
    }
  };

  const savePolicy = async (occurrenceType: TransportRequestOccurrenceType) => {
    const draft = policyDrafts[occurrenceType];
    if (!draft || validateOccurrenceTypePolicy(draft)) return;
    setSavingType(occurrenceType);
    try {
      const saved = await apiFetch<OccurrenceTypePolicy>(`${POLICIES_URL}/${occurrenceType}`, {
        method: 'PATCH',
        body: draft,
      });
      setPolicies((prev) => prev?.map((p) => (p.occurrenceType === occurrenceType ? saved : p)) ?? prev);
      notify(t('transportConfig.saved'), { type: 'success' });
    } catch (e) {
      notify(e instanceof Error ? e.message : t('transportConfig.saveFailed'), { type: 'warning' });
    } finally {
      setSavingType(null);
    }
  };

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Title title={t('transportConfig.pageTitle')} />

      <Card>
        <CardContent>
          <Typography variant="h6">{t('transportConfig.thresholdsHeading')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('transportConfig.thresholdsSubheading')}
          </Typography>

          {!thresholdsDraft && !thresholdsError && <CircularProgress size={24} />}
          {thresholdsError && <Alert severity="warning">{thresholdsError}</Alert>}

          {thresholdsDraft && (
            <Stack spacing={2} alignItems="flex-start">
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  type="number"
                  label={t('transportConfig.arrivalWindowEarliestMinutes')}
                  value={thresholdsDraft.arrivalWindowEarliestMinutes}
                  onChange={(e) =>
                    setThresholdsDraft({ ...thresholdsDraft, arrivalWindowEarliestMinutes: Number(e.target.value) })
                  }
                  inputProps={{ min: 0 }}
                />
                <TextField
                  type="number"
                  label={t('transportConfig.arrivalWindowLatestMinutes')}
                  value={thresholdsDraft.arrivalWindowLatestMinutes}
                  onChange={(e) =>
                    setThresholdsDraft({ ...thresholdsDraft, arrivalWindowLatestMinutes: Number(e.target.value) })
                  }
                  inputProps={{ min: 0 }}
                />
                <TextField
                  type="number"
                  label={t('transportConfig.arrivalToleranceMinutes')}
                  value={thresholdsDraft.arrivalToleranceMinutes}
                  onChange={(e) =>
                    setThresholdsDraft({ ...thresholdsDraft, arrivalToleranceMinutes: Number(e.target.value) })
                  }
                  inputProps={{ min: 0 }}
                />
              </Stack>
              {thresholdsFieldError && <Alert severity="warning">{thresholdsFieldError}</Alert>}
              <Button variant="contained" disabled={savingThresholds || !!thresholdsFieldError} onClick={() => void saveThresholds()}>
                {t('transportConfig.save')}
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">{t('transportConfig.handlingHeading')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('transportConfig.handlingSubheading')}
          </Typography>

          {!handlingDraft && !handlingError && <CircularProgress size={24} />}
          {handlingError && <Alert severity="warning">{handlingError}</Alert>}

          {handlingDraft && (
            <Stack spacing={2} alignItems="flex-start">
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  type="number"
                  label={t('transportConfig.pickupHandlingMinutes')}
                  value={handlingDraft.pickupHandlingMinutes}
                  onChange={(e) => setHandlingDraft({ ...handlingDraft, pickupHandlingMinutes: Number(e.target.value) })}
                  inputProps={{ min: 0 }}
                />
                <TextField
                  type="number"
                  label={t('transportConfig.dropoffHandlingMinutes')}
                  value={handlingDraft.dropoffHandlingMinutes}
                  onChange={(e) => setHandlingDraft({ ...handlingDraft, dropoffHandlingMinutes: Number(e.target.value) })}
                  inputProps={{ min: 0 }}
                />
              </Stack>
              {handlingFieldError && <Alert severity="warning">{handlingFieldError}</Alert>}
              <Button variant="contained" disabled={savingHandling || !!handlingFieldError} onClick={() => void saveHandling()}>
                {t('transportConfig.save')}
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">{t('transportConfig.policiesHeading')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('transportConfig.policiesSubheading')}
          </Typography>

          {!policies && !policiesError && <CircularProgress size={24} />}
          {policiesError && <Alert severity="warning">{policiesError}</Alert>}

          {policies && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('transportConfig.occurrenceType')}</TableCell>
                  <TableCell>{t('transportConfig.minimumDurationMinutes')}</TableCell>
                  <TableCell>{t('transportConfig.defaultDurationMinutes')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {policies.map((policy) => {
                  const draft = policyDrafts[policy.occurrenceType] ?? policy;
                  const error = validateOccurrenceTypePolicy(draft);
                  return (
                    <TableRow key={policy.occurrenceType}>
                      <TableCell>{t(`transportRequestOccurrenceType.${policy.occurrenceType}`)}</TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          size="small"
                          value={draft.minimumDurationMinutes}
                          onChange={(e) =>
                            setPolicyDrafts((prev) => ({
                              ...prev,
                              [policy.occurrenceType]: { ...draft, minimumDurationMinutes: Number(e.target.value) },
                            }))
                          }
                          inputProps={{ min: 1 }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          size="small"
                          value={draft.defaultDurationMinutes}
                          onChange={(e) =>
                            setPolicyDrafts((prev) => ({
                              ...prev,
                              [policy.occurrenceType]: { ...draft, defaultDurationMinutes: Number(e.target.value) },
                            }))
                          }
                          inputProps={{ min: 1 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          disabled={savingType === policy.occurrenceType || !!error}
                          onClick={() => void savePolicy(policy.occurrenceType)}
                        >
                          {t('transportConfig.save')}
                        </Button>
                        {error && (
                          <Typography variant="caption" color="warning.main" display="block">
                            {error}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
};
