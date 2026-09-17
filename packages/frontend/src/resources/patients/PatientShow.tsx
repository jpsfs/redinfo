import { BooleanField, FunctionField, Show, SimpleShowLayout, useRecordContext } from 'react-admin';
import { Alert, Stack, Typography } from '@mui/material';
import { Action, Patient } from '@redinfo/shared';
import { useCapabilities } from '../../hooks/useCapabilities';
import { useT } from '../../i18n/useT';
import { MobilityChip, StatusChip } from './patientChips';

/**
 * The sealed identity, as read back — never masked, never click-to-reveal:
 * the capability is the boundary (#226). A caller without
 * `VIEW_PATIENT_IDENTITY` never reaches this component at all; see `PatientShow`.
 */
const IdentityPanel = () => {
  const t = useT();
  const record = useRecordContext<Patient>();
  if (!record) return null;

  if (record.identityUnavailable) {
    return <Alert severity="warning">{t('patientList.identityUnavailable')}</Alert>;
  }
  if (record.identityPurgedAt) {
    return (
      <Alert severity="info">
        {t('patientList.identityPurged', {
          date: new Date(record.identityPurgedAt).toLocaleDateString(),
        })}
      </Alert>
    );
  }
  if (!record.identity) {
    return <Alert severity="info">{t('patientList.noIdentityYet')}</Alert>;
  }

  const { identity } = record;
  return (
    <Stack spacing={0.75}>
      <Typography variant="subtitle2">{t('patientForm.sectionIdentity')}</Typography>
      <Typography>
        <strong>{t('patientForm.fullName')}:</strong> {identity.fullName}
      </Typography>
      <Typography>
        <strong>{t('patientForm.telephone')}:</strong> {identity.telephone}
      </Typography>
      <Typography>
        <strong>{t('patientForm.homeAddressLine')}:</strong> {identity.homeAddressLine},{' '}
        {identity.homePostalCode} {identity.homeLocality}
      </Typography>
      <Typography>
        <strong>{t('patientForm.referenceContactName')}:</strong> {identity.referenceContactName} (
        {identity.referenceContactRelationship}) — {identity.referenceContactTelephone}
      </Typography>
    </Stack>
  );
};

export const PatientShow = () => {
  const t = useT();
  const { can } = useCapabilities();
  const canSeeIdentity = can([Action.VIEW_PATIENT_IDENTITY]);

  return (
    <Show>
      <SimpleShowLayout>
        <FunctionField
          label={t('resources.patients.fields.mobility')}
          render={(record: Patient) => <MobilityChip value={record.mobility} />}
        />
        <BooleanField source="needsOxygen" label={t('resources.patients.fields.needsOxygen')} />
        <BooleanField source="escortRequired" label={t('resources.patients.fields.escortRequired')} />
        <BooleanField source="isBariatric" label={t('resources.patients.fields.isBariatric')} />
        <FunctionField
          label={t('patientList.colLocality')}
          render={(record: Patient) => record.locality?.name ?? '—'}
        />
        <FunctionField
          label={t('resources.patients.fields.defaultLatitude')}
          render={(record: Patient) =>
            record.defaultLatitude !== null && record.defaultLatitude !== undefined
              ? `${record.defaultLatitude.toFixed(4)}, ${record.defaultLongitude?.toFixed(4)}`
              : '—'
          }
        />
        <BooleanField
          source="referenceContactIsOrganisation"
          label={t('resources.patients.fields.referenceContactIsOrganisation')}
        />
        <BooleanField
          source="contactAuthorisationRecorded"
          label={t('resources.patients.fields.contactAuthorisationRecorded')}
        />
        <FunctionField
          label={t('resources.patients.fields.isActive')}
          render={(record: Patient) => <StatusChip active={record.isActive} />}
        />
        {canSeeIdentity ? (
          <IdentityPanel />
        ) : (
          <Alert severity="warning">{t('patientList.identityRestricted')}</Alert>
        )}
      </SimpleShowLayout>
    </Show>
  );
};
