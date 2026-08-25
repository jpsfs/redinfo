import {
  Create,
  CreateButton,
  Datagrid,
  Edit,
  ExportButton,
  FunctionField,
  List,
  NumberInput,
  ReferenceInput,
  SelectInput,
  SimpleForm,
  TextField,
  TextInput,
  TopToolbar,
  required,
  useRecordContext,
} from 'react-admin';
import { Alert, Chip } from '@mui/material';
import { Hospital } from '@redinfo/shared';
import { useT } from '../../i18n/useT';

/**
 * The hospital list a report's transport destination is chosen from.
 *
 * Kept in the app the same way holidays are — seeded with a starting set, then
 * maintained by a coordinator.
 */

const ListActions = () => {
  const t = useT();
  return (
    <TopToolbar>
      <CreateButton label={t('hospitalList.addHospital')} />
      <ExportButton />
    </TopToolbar>
  );
};

/** "40.1976, -8.4392", or a note that the municipality centre is standing in. */
const CoordinatesField = () => {
  const t = useT();
  const record = useRecordContext<Hospital>();
  if (!record) return null;
  const { latitude, longitude } = record;
  // Both or neither, by construction — but read as a pair anyway, so a
  // half-filled row from an older record cannot render "40.1976, undefined".
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined
  ) {
    return (
      <Chip size="small" variant="outlined" label={t('hospitalList.municipalityCentreFallback')} />
    );
  }
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {latitude.toFixed(4)}, {longitude.toFixed(4)}
    </span>
  );
};

export const HospitalList = () => {
  const t = useT();
  return (
    <List
      actions={<ListActions />}
      perPage={50}
      sort={{ field: 'name', order: 'ASC' }}
      empty={false}
    >
      <>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('hospitalList.helpText')}
        </Alert>
        <Datagrid rowClick="edit" bulkActionButtons={false}>
          <TextField source="name" />
          <FunctionField
            label={t('hospitalList.colMunicipality')}
            render={(record: Hospital) => record.municipality?.name ?? '—'}
          />
          <FunctionField
            label={t('hospitalList.colDistrict')}
            render={(record: Hospital) => record.municipality?.district ?? '—'}
          />
          <FunctionField label={t('hospitalList.colCoordinates')} render={() => <CoordinatesField />} />
          <FunctionField
            source="isActive"
            render={(record: Hospital) => (
              <Chip
                size="small"
                variant="outlined"
                color={record.isActive ? 'success' : 'default'}
                label={record.isActive ? t('hospitalList.active') : t('hospitalList.retired')}
              />
            )}
          />
        </Datagrid>
      </>
    </List>
  );
};

/**
 * The municipality picker reads the whole list — 308 rows, which is small
 * enough to hand over at once and saves a coordinator guessing at a search box.
 */
const MunicipalityInput = () => (
  <ReferenceInput source="municipalityId" reference="municipalities" perPage={400}>
    <SelectInput
      optionText={(record) => `${record.name} · ${record.district}`}
      validate={required()}
      fullWidth
    />
  </ReferenceInput>
);

const HospitalFormFields = () => {
  const t = useT();
  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('hospitalList.helpText')}
      </Alert>
      <TextInput source="name" label={t('hospitalList.nameField')} validate={required()} fullWidth />
      <MunicipalityInput />
      {/* Both or neither: half a coordinate locates nothing, which the API
          refuses with that exact wording. */}
      <NumberInput source="latitude" label={t('hospitalList.latitude')} helperText="e.g. 40.1976" />
      <NumberInput source="longitude" label={t('hospitalList.longitude')} helperText="e.g. -8.4392" />
    </>
  );
};

export const HospitalCreate = () => (
  <Create redirect="list">
    <SimpleForm>
      <HospitalFormFields />
    </SimpleForm>
  </Create>
);

export const HospitalEdit = () => {
  const t = useT();
  return (
    <Edit redirect="list">
      <SimpleForm>
        <HospitalFormFields />
        <SelectInput
          source="isActive"
          choices={[
            { id: true, name: t('hospitalList.active') },
            { id: false, name: t('hospitalList.retiredHiddenFromNewReports') },
          ]}
        />
      </SimpleForm>
    </Edit>
  );
};
