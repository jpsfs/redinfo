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

/**
 * The hospital list a report's transport destination is chosen from.
 *
 * Kept in the app the same way holidays are — seeded with a starting set, then
 * maintained by a coordinator. Deliberately English, like the rest of the
 * configuration screens: this is a desk job, unlike the report itself.
 */

const HOSPITAL_HELP =
  'This list fills the "taken to" field on a report. Coordinates order the ' +
  'hospitals by distance from the report\'s locality — a hospital without them ' +
  'falls back to the centre of its municipality, so the ordering always works ' +
  'and filling them in only sharpens it. Retiring a hospital removes it from ' +
  'new reports without changing the ones already filed.';

const ListActions = () => (
  <TopToolbar>
    <CreateButton label="Add hospital" />
    <ExportButton />
  </TopToolbar>
);

/** "40.1976, -8.4392", or a note that the municipality centre is standing in. */
const CoordinatesField = () => {
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
    return <Chip size="small" variant="outlined" label="municipality centre" />;
  }
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {latitude.toFixed(4)}, {longitude.toFixed(4)}
    </span>
  );
};

export const HospitalList = () => (
  <List
    actions={<ListActions />}
    perPage={50}
    sort={{ field: 'name', order: 'ASC' }}
    empty={false}
  >
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        {HOSPITAL_HELP}
      </Alert>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="name" label="Hospital" />
        <FunctionField
          label="Municipality"
          render={(record: Hospital) => record.municipality?.name ?? '—'}
        />
        <FunctionField
          label="District"
          render={(record: Hospital) => record.municipality?.district ?? '—'}
        />
        <FunctionField label="Coordinates" render={() => <CoordinatesField />} />
        <FunctionField
          label="Status"
          render={(record: Hospital) => (
            <Chip
              size="small"
              variant="outlined"
              color={record.isActive ? 'success' : 'default'}
              label={record.isActive ? 'Active' : 'Retired'}
            />
          )}
        />
      </Datagrid>
    </>
  </List>
);

/**
 * The municipality picker reads the whole list — 308 rows, which is small
 * enough to hand over at once and saves a coordinator guessing at a search box.
 */
const MunicipalityInput = () => (
  <ReferenceInput source="municipalityId" reference="municipalities" perPage={400}>
    <SelectInput
      label="Municipality"
      optionText={(record) => `${record.name} · ${record.district}`}
      validate={required()}
      fullWidth
    />
  </ReferenceInput>
);

const HospitalFormFields = () => (
  <>
    <Alert severity="info" sx={{ mb: 2 }}>
      {HOSPITAL_HELP}
    </Alert>
    <TextInput source="name" label="Hospital name" validate={required()} fullWidth />
    <MunicipalityInput />
    {/* Both or neither: half a coordinate locates nothing, which the API
        refuses with that exact wording. */}
    <NumberInput source="latitude" label="Latitude (optional)" helperText="e.g. 40.1976" />
    <NumberInput source="longitude" label="Longitude (optional)" helperText="e.g. -8.4392" />
  </>
);

export const HospitalCreate = () => (
  <Create redirect="list">
    <SimpleForm>
      <HospitalFormFields />
    </SimpleForm>
  </Create>
);

export const HospitalEdit = () => (
  <Edit redirect="list">
    <SimpleForm>
      <HospitalFormFields />
      <SelectInput
        source="isActive"
        label="Status"
        choices={[
          { id: true, name: 'Active' },
          { id: false, name: 'Retired — hidden from new reports' },
        ]}
      />
    </SimpleForm>
  </Edit>
);
