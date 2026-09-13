import {
  Create,
  CreateButton,
  DateInput,
  Datagrid,
  Edit,
  ExportButton,
  FunctionField,
  List,
  ReferenceField,
  ReferenceInput,
  SelectInput,
  SimpleForm,
  TextField,
  TextInput,
  TopToolbar,
  required,
  useListContext,
} from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { Agreement } from '@redinfo/shared';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useT } from '../../i18n/useT';

/**
 * The agreement list #227 introduces: the terms a transport falls under —
 * the national health service agreement, an insurer's, a private
 * arrangement — scoped to the organisation paying under it. No tariff or
 * rate fields anywhere here: billing is modelled, never performed.
 */

const ListActions = () => {
  const t = useT();
  return (
    <TopToolbar>
      <CreateButton label={t('agreementList.addAgreement')} />
      <ExportButton />
    </TopToolbar>
  );
};

/** One agreement, as a stacked card — the mobile replacement for a row of
 * the desktop `Datagrid`, in the same shape as `OrganisationCard`. */
const AgreementCard = ({ agreement, onOpen }: { agreement: Agreement; onOpen: () => void }) => {
  const t = useT();
  return (
    <Paper variant="outlined" onClick={onOpen} sx={{ p: 2, cursor: 'pointer' }}>
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography sx={{ fontWeight: 700 }}>{agreement.name}</Typography>
          <Chip
            size="small"
            variant="outlined"
            color={agreement.isActive ? 'success' : 'default'}
            label={agreement.isActive ? t('agreementList.active') : t('agreementList.retired')}
          />
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {agreement.payerOrganisation?.name ?? '—'}
        </Typography>

        <Typography variant="body2" color="text.secondary">
          {agreement.validFrom} → {agreement.validTo ?? '—'}
        </Typography>
      </Stack>
    </Paper>
  );
};

/** Stacked cards instead of a table — the mobile replacement for `Datagrid`. */
const MobileAgreementList = () => {
  const { data, isLoading } = useListContext<Agreement>();
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
      {(data ?? []).map((agreement) => (
        <AgreementCard
          key={agreement.id}
          agreement={agreement}
          onOpen={() => navigate(`/agreements/${agreement.id}`)}
        />
      ))}
    </Stack>
  );
};

export const AgreementList = () => {
  const t = useT();
  const isMobile = useIsMobile();
  return (
    <List
      actions={<ListActions />}
      perPage={50}
      sort={{ field: 'validFrom', order: 'DESC' }}
      empty={false}
      component="div"
    >
      {/* `component="div"` drops `<List>`'s own default `Card` wrapper — only
          the table itself keeps a card, matching the pattern on `/organisations`. */}
      <Box sx={{ pt: 2 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('agreementList.helpText')}
        </Alert>
        {isMobile ? (
          <MobileAgreementList />
        ) : (
          <Paper variant="outlined">
            <Datagrid rowClick="edit" bulkActionButtons={false}>
              <TextField source="name" />
              <ReferenceField
                source="payerOrganisationId"
                reference="organisations"
                label={t('resources.agreements.fields.payerOrganisationId')}
                link={false}
              >
                <TextField source="name" />
              </ReferenceField>
              <TextField source="validFrom" label={t('resources.agreements.fields.validFrom')} />
              <FunctionField
                label={t('resources.agreements.fields.validTo')}
                render={(record: Agreement) => record.validTo ?? '—'}
              />
              <FunctionField
                source="isActive"
                render={(record: Agreement) => (
                  <Chip
                    size="small"
                    variant="outlined"
                    color={record.isActive ? 'success' : 'default'}
                    label={record.isActive ? t('agreementList.active') : t('agreementList.retired')}
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

/** Only an organisation flagged as a payer can hold an agreement — the API
 * refuses the rest, so the picker never offers them in the first place. */
const PayerOrganisationInput = () => {
  const t = useT();
  return (
    <ReferenceInput source="payerOrganisationId" reference="organisations" filter={{ isPayer: true }}>
      <SelectInput
        label={t('resources.agreements.fields.payerOrganisationId')}
        optionText="name"
        validate={required()}
        fullWidth
      />
    </ReferenceInput>
  );
};

const AgreementFormFields = () => {
  const t = useT();
  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('agreementList.helpText')}
      </Alert>
      <PayerOrganisationInput />
      <TextInput source="name" validate={required()} fullWidth />
      <TextInput source="externalReference" fullWidth />
      <DateInput source="validFrom" validate={required()} fullWidth />
      <DateInput source="validTo" fullWidth />
      <TextInput source="notes" multiline fullWidth />
    </>
  );
};

export const AgreementCreate = () => (
  <Create redirect="list">
    <SimpleForm>
      <AgreementFormFields />
    </SimpleForm>
  </Create>
);

export const AgreementEdit = () => {
  const t = useT();
  return (
    <Edit redirect="list">
      <SimpleForm>
        <AgreementFormFields />
        <SelectInput
          source="isActive"
          choices={[
            { id: true, name: t('agreementList.active') },
            { id: false, name: t('agreementList.retired') },
          ]}
        />
      </SimpleForm>
    </Edit>
  );
};
