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
  useListContext,
  useRecordContext,
} from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { Facility } from '@redinfo/shared';
import { useIsMobile } from '../../hooks/useIsMobile';
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

/** "40.1976, -8.4392", or a note that the municipality centre is standing in.
 * Takes the coordinates directly rather than reading `useRecordContext`, so
 * it renders the same inside a `Datagrid` row and a plain `FacilityCard`. */
const Coordinates = ({
  latitude,
  longitude,
}: {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}) => {
  const t = useT();
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

const CoordinatesField = () => {
  const record = useRecordContext<Facility>();
  if (!record) return null;
  return <Coordinates latitude={record.latitude} longitude={record.longitude} />;
};

/** A yes/no flag rendered as a chip, so the two uses read at a glance. */
const FlagChip = ({ on, label }: { on: boolean; label: string }) => (
  <Chip size="small" variant={on ? 'filled' : 'outlined'} color={on ? 'primary' : 'default'} label={label} />
);

/** One facility, as a stacked card — the mobile replacement for a row of the
 * desktop `Datagrid`, in the same shape as `PersonCard` on `/users`. */
const FacilityCard = ({ facility, onOpen }: { facility: Facility; onOpen: () => void }) => {
  const t = useT();
  return (
    <Paper variant="outlined" onClick={onOpen} sx={{ p: 2, cursor: 'pointer' }}>
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography sx={{ fontWeight: 700 }}>{facility.name}</Typography>
          <Chip
            size="small"
            variant="outlined"
            color={facility.isActive ? 'success' : 'default'}
            label={facility.isActive ? t('facilityList.active') : t('facilityList.retired')}
          />
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {facility.municipality
            ? `${facility.municipality.name} · ${facility.municipality.district}`
            : '—'}
        </Typography>

        <Coordinates latitude={facility.latitude} longitude={facility.longitude} />

        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {facility.isEmergencyDestination && (
            <FlagChip on label={t('resources.facilities.fields.isEmergencyDestination')} />
          )}
          {facility.isTransportDestination && (
            <FlagChip on label={t('resources.facilities.fields.isTransportDestination')} />
          )}
        </Stack>
      </Stack>
    </Paper>
  );
};

/** Stacked cards instead of a table — the mobile replacement for `Datagrid`. */
const MobileFacilityList = () => {
  const { data, isLoading } = useListContext<Facility>();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Stack spacing={1.5}>
      {(data ?? []).map((facility) => (
        <FacilityCard key={facility.id} facility={facility} onOpen={() => navigate(`/facilities/${facility.id}`)} />
      ))}
    </Stack>
  );
};

export const FacilityList = () => {
  const t = useT();
  const isMobile = useIsMobile();
  return (
    <List
      actions={<ListActions />}
      perPage={50}
      sort={{ field: 'name', order: 'ASC' }}
      empty={false}
      component="div"
    >
      {/* `component="div"` drops `<List>`'s own default `Card` wrapper — only
          the table itself keeps a card, via the `Paper` below, matching the
          pattern on `/users`. */}
      <Box sx={{ pt: 2 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('facilityList.helpText')}
        </Alert>
        {isMobile ? (
          <MobileFacilityList />
        ) : (
          <Paper variant="outlined">
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
          </Paper>
        )}
      </Box>
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
