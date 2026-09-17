import {
  ArrayInput,
  BooleanInput,
  Create,
  CreateButton,
  Datagrid,
  Edit,
  ExportButton,
  FunctionField,
  List,
  SelectInput,
  SimpleForm,
  SimpleFormIterator,
  TextField,
  TextInput,
  TopToolbar,
  required,
  useListContext,
} from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { Organisation } from '@redinfo/shared';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useT } from '../../i18n/useT';

/**
 * The organisation list #227 introduces: the third party to a transport —
 * whoever requests it, whoever pays for it, or both — kept the same way
 * facilities are, as reference data a coordinator maintains ahead of time.
 */

const ListActions = () => {
  const t = useT();
  return (
    <TopToolbar>
      <CreateButton label={t('organisationList.addOrganisation')} />
      <ExportButton />
    </TopToolbar>
  );
};

/** A yes/no flag rendered as a chip, so requester/payer read at a glance. */
const FlagChip = ({ on, label }: { on: boolean; label: string }) => (
  <Chip size="small" variant={on ? 'filled' : 'outlined'} color={on ? 'primary' : 'default'} label={label} />
);

/** One organisation, as a stacked card — the mobile replacement for a row of
 * the desktop `Datagrid`, in the same shape as `FacilityCard` on `/facilities`. */
const OrganisationCard = ({
  organisation,
  onOpen,
}: {
  organisation: Organisation;
  onOpen: () => void;
}) => {
  const t = useT();
  return (
    <Paper variant="outlined" onClick={onOpen} sx={{ p: 2, cursor: 'pointer' }}>
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography sx={{ fontWeight: 700 }}>{organisation.name}</Typography>
          <Chip
            size="small"
            variant="outlined"
            color={organisation.isActive ? 'success' : 'default'}
            label={organisation.isActive ? t('organisationList.active') : t('organisationList.retired')}
          />
        </Stack>

        {(organisation.contactEmail || organisation.contactPhone) && (
          <Typography variant="body2" color="text.secondary">
            {[organisation.contactEmail, organisation.contactPhone].filter(Boolean).join(' · ')}
          </Typography>
        )}

        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {organisation.isRequester && (
            <FlagChip on label={t('resources.organisations.fields.isRequester')} />
          )}
          {organisation.isPayer && <FlagChip on label={t('resources.organisations.fields.isPayer')} />}
        </Stack>
      </Stack>
    </Paper>
  );
};

/** Stacked cards instead of a table — the mobile replacement for `Datagrid`. */
const MobileOrganisationList = () => {
  const { data, isLoading } = useListContext<Organisation>();
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
      {(data ?? []).map((organisation) => (
        <OrganisationCard
          key={organisation.id}
          organisation={organisation}
          onOpen={() => navigate(`/organisations/${organisation.id}`)}
        />
      ))}
    </Stack>
  );
};

export const OrganisationList = () => {
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
          pattern on `/facilities`. */}
      <Box sx={{ pt: 2 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('organisationList.helpText')}
        </Alert>
        {isMobile ? (
          <MobileOrganisationList />
        ) : (
          <Paper variant="outlined">
            <Datagrid rowClick="edit" bulkActionButtons={false}>
              <TextField source="name" />
              <FunctionField
                label={t('resources.organisations.fields.contactEmail')}
                render={(record: Organisation) => record.contactEmail ?? '—'}
              />
              <FunctionField
                label={t('resources.organisations.fields.isRequester')}
                render={(record: Organisation) => (
                  <FlagChip on={record.isRequester} label={t('resources.organisations.fields.isRequester')} />
                )}
              />
              <FunctionField
                label={t('resources.organisations.fields.isPayer')}
                render={(record: Organisation) => (
                  <FlagChip on={record.isPayer} label={t('resources.organisations.fields.isPayer')} />
                )}
              />
              <FunctionField
                source="isActive"
                render={(record: Organisation) => (
                  <Chip
                    size="small"
                    variant="outlined"
                    color={record.isActive ? 'success' : 'default'}
                    label={record.isActive ? t('organisationList.active') : t('organisationList.retired')}
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

const OrganisationFormFields = () => {
  const t = useT();
  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('organisationList.helpText')}
      </Alert>
      <TextInput source="name" validate={required()} fullWidth />
      <TextInput source="taxId" fullWidth />
      <TextInput source="contactEmail" type="email" fullWidth />
      <TextInput source="contactPhone" fullWidth />
      <BooleanInput source="isRequester" />
      <BooleanInput source="isPayer" />
      <TextInput source="notes" multiline fullWidth />
      <ArrayInput source="references" label={t('resources.organisations.fields.references')}>
        <SimpleFormIterator inline disableReordering>
          <TextInput
            source="code"
            label={t('resources.organisations.fields.references.code')}
            validate={required()}
          />
          <TextInput
            source="description"
            label={t('resources.organisations.fields.references.description')}
          />
        </SimpleFormIterator>
      </ArrayInput>
    </>
  );
};

export const OrganisationCreate = () => (
  <Create redirect="list">
    <SimpleForm>
      <OrganisationFormFields />
    </SimpleForm>
  </Create>
);

export const OrganisationEdit = () => {
  const t = useT();
  return (
    <Edit redirect="list">
      <SimpleForm>
        <OrganisationFormFields />
        <SelectInput
          source="isActive"
          choices={[
            { id: true, name: t('organisationList.active') },
            { id: false, name: t('organisationList.retired') },
          ]}
        />
      </SimpleForm>
    </Edit>
  );
};
