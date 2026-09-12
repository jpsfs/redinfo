import {
  BooleanInput,
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
import { Facility } from '@redinfo/shared';
import { useT } from '../../i18n/useT';

/**
 * The facility list both destination pickers are drawn from: emergency (a
 * victim's destination) and transport, two independent flags on the one
 * table. Kept in the app the same way holidays are — seeded with a starting
 * set, then maintained by a coordinator.
 */

const ListActions = () => {
  const t = useT();
  return (
    <TopToolbar>
      <CreateButton label={t('facilityList.addFacility')} />
      <ExportButton />
    </TopToolbar>
  );
};

/** "40.1976, -8.4392", or a note that the municipality centre is standing in. */
const CoordinatesField = () => {
  const t = useT();
  const record = useRecordContext<Facility>();
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
      <Chip size="small" variant="outlined" label={t('facilityList.municipalityCentreFallback')} />
    );
  }
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {latitude.toFixed(4)}, {longitude.toFixed(4)}
    </span>
  );
};

/** A yes/no flag rendered as a chip, so the two uses read at a glance. */
const FlagChip = ({ on, label }: { on: boolean; label: string }) => (
  <Chip size="small" variant={on ? 'filled' : 'outlined'} color={on ? 'primary' : 'default'} label={label} />
);

export const FacilityList = () => {
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
          {t('facilityList.helpText')}
        </Alert>
        <Datagrid rowClick="edit" bulkActionButtons={false}>
          <TextField source="name" />
          <FunctionField
            label={t('facilityList.colMunicipality')}
            render={(record: Facility) => record.municipality?.name ?? '—'}
          />
          <FunctionField
            label={t('facilityList.colDistrict')}
            render={(record: Facility) => record.municipality?.district ?? '—'}
          />
          <FunctionField label={t('facilityList.colCoordinates')} render={() => <CoordinatesField />} />
          <FunctionField
            label={t('resources.facilities.fields.isEmergencyDestination')}
            render={(record: Facility) => (
              <FlagChip
                on={record.isEmergencyDestination}
                label={t('resources.facilities.fields.isEmergencyDestination')}
              />
            )}
          />
          <FunctionField
            label={t('resources.facilities.fields.isTransportDestination')}
            render={(record: Facility) => (
              <FlagChip
                on={record.isTransportDestination}
                label={t('resources.facilities.fields.isTransportDestination')}
              />
            )}
          />
          <FunctionField
            source="isActive"
            render={(record: Facility) => (
              <Chip
                size="small"
                variant="outlined"
                color={record.isActive ? 'success' : 'default'}
                label={record.isActive ? t('facilityList.active') : t('facilityList.retired')}
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

const FacilityFormFields = () => {
  const t = useT();
  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('facilityList.helpText')}
      </Alert>
      <TextInput source="name" label={t('facilityList.nameField')} validate={required()} fullWidth />
      <MunicipalityInput />
      <TextInput source="addressLine" label={t('facilityList.addressLine')} fullWidth />
      <TextInput source="postalCode" label={t('facilityList.postalCode')} />
      {/* Both or neither: half a coordinate locates nothing, which the API
          refuses with that exact wording. A transport destination also needs
          both — the API refuses to save one without them. */}
      <NumberInput source="latitude" label={t('facilityList.latitude')} helperText="e.g. 40.1976" />
      <NumberInput source="longitude" label={t('facilityList.longitude')} helperText="e.g. -8.4392" />
      <BooleanInput
        source="isEmergencyDestination"
        label={t('facilityList.isEmergencyDestination')}
      />
      <BooleanInput
        source="isTransportDestination"
        label={t('facilityList.isTransportDestination')}
      />
    </>
  );
};

export const FacilityCreate = () => (
  <Create redirect="list">
    <SimpleForm>
      <FacilityFormFields />
    </SimpleForm>
  </Create>
);

export const FacilityEdit = () => {
  const t = useT();
  return (
    <Edit redirect="list">
      <SimpleForm>
        <FacilityFormFields />
        <SelectInput
          source="isActive"
          choices={[
            { id: true, name: t('facilityList.active') },
            { id: false, name: t('facilityList.retiredHiddenFromNewReports') },
          ]}
        />
      </SimpleForm>
    </Edit>
  );
};
