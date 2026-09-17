import {
  BooleanInput,
  Create,
  Edit,
  NumberInput,
  SelectInput,
  SimpleForm,
  TextInput,
  required,
} from 'react-admin';
import { Divider, Typography } from '@mui/material';
import { Action, PatientMobility } from '@redinfo/shared';
import { useCapabilities } from '../../hooks/useCapabilities';
import { useT } from '../../i18n/useT';
import { PatientLocalityField } from './PatientLocalityField';

/**
 * Create and edit share every field: `MANAGE_PATIENTS` covers the whole
 * profile on both routes, and identity is either present or absent on the
 * form the same way it is on the record — see `PatientIdentityFields` below.
 */

const MobilitySelect = () => {
  const t = useT();
  return (
    <SelectInput
      source="mobility"
      label={t('resources.patients.fields.mobility')}
      choices={Object.values(PatientMobility).map((value) => ({
        id: value,
        name: t(`patientMobility.${value}`),
      }))}
      validate={required()}
      fullWidth
    />
  );
};

/** The unsealed profile — what planning reads without `VIEW_PATIENT_IDENTITY`. */
const PatientProfileFields = () => {
  const t = useT();
  return (
    <>
      <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
        {t('patientForm.sectionProfile')}
      </Typography>
      <MobilitySelect />
      <BooleanInput source="needsOxygen" label={t('resources.patients.fields.needsOxygen')} />
      <BooleanInput source="escortRequired" label={t('resources.patients.fields.escortRequired')} />
      <BooleanInput source="isBariatric" label={t('resources.patients.fields.isBariatric')} />
      <PatientLocalityField source="localityId" />
      {/* Both or neither, same rule `validatePatient` enforces server-side. */}
      <NumberInput
        source="defaultLatitude"
        label={t('resources.patients.fields.defaultLatitude')}
        helperText="e.g. 40.1976"
      />
      <NumberInput
        source="defaultLongitude"
        label={t('resources.patients.fields.defaultLongitude')}
        helperText="e.g. -8.4392"
      />
      <BooleanInput
        source="referenceContactIsOrganisation"
        label={t('resources.patients.fields.referenceContactIsOrganisation')}
      />
      <BooleanInput
        source="contactAuthorisationRecorded"
        label={t('resources.patients.fields.contactAuthorisationRecorded')}
      />
      <TextInput
        source="contactAuthorisationNote"
        label={t('resources.patients.fields.contactAuthorisationNote')}
        fullWidth
        multiline
      />
    </>
  );
};

/**
 * The sealed blob, written and read as one unit — see `PatientIdentity`'s doc
 * comment (shared). Rendered only for a caller who holds
 * `VIEW_PATIENT_IDENTITY`; a `MANAGE_PATIENTS`-only caller never sees this
 * section at all, matching the API's own refusal to accept it from them.
 */
const PatientIdentityFields = () => {
  const t = useT();
  return (
    <>
      <Divider sx={{ my: 2, width: '100%' }} />
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {t('patientForm.sectionIdentity')}
      </Typography>
      <TextInput source="identity.fullName" label={t('patientForm.fullName')} validate={required()} fullWidth />
      <TextInput source="identity.telephone" label={t('patientForm.telephone')} validate={required()} />
      <TextInput
        source="identity.homeAddressLine"
        label={t('patientForm.homeAddressLine')}
        validate={required()}
        fullWidth
      />
      <TextInput source="identity.homePostalCode" label={t('patientForm.homePostalCode')} validate={required()} />
      <TextInput source="identity.homeLocality" label={t('patientForm.homeLocality')} validate={required()} />
      <TextInput
        source="identity.referenceContactName"
        label={t('patientForm.referenceContactName')}
        validate={required()}
        fullWidth
      />
      <TextInput
        source="identity.referenceContactRelationship"
        label={t('patientForm.referenceContactRelationship')}
        validate={required()}
      />
      <TextInput
        source="identity.referenceContactTelephone"
        label={t('patientForm.referenceContactTelephone')}
        validate={required()}
      />
    </>
  );
};

const PatientFormFields = () => {
  const { can } = useCapabilities();
  return (
    <>
      <PatientProfileFields />
      {can([Action.VIEW_PATIENT_IDENTITY]) && <PatientIdentityFields />}
    </>
  );
};

export const PatientCreate = () => (
  <Create redirect="list">
    <SimpleForm>
      <PatientFormFields />
    </SimpleForm>
  </Create>
);

export const PatientEdit = () => {
  const t = useT();
  return (
    <Edit redirect="list">
      <SimpleForm>
        <PatientFormFields />
        <SelectInput
          source="isActive"
          label={t('resources.patients.fields.isActive')}
          choices={[
            { id: true, name: t('patientList.active') },
            { id: false, name: t('patientList.retired') },
          ]}
        />
      </SimpleForm>
    </Edit>
  );
};
