import {
  AutocompleteInput,
  BooleanInput,
  Create,
  CreateButton,
  Datagrid,
  DateTimeInput,
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
import { Alert, Box, Chip, CircularProgress, Divider, Paper, Stack, Typography } from '@mui/material';
import {
  Patient,
  TransportRequest,
  TransportRequestDecision,
  TransportRequestOccurrenceType,
  TransportRequestVehicleType,
} from '@redinfo/shared';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useT } from '../../i18n/useT';
import { DestinationFacilityField } from './DestinationFacilityField';

/**
 * Referral intake (#228): a `TransportRequest` entered by hand from the
 * source referral — field order and grouping mirror the referral's own
 * layout rather than an idealised one. Decision (accept/reject) is a
 * separate, richer screen (#229); this is create/edit plus the ageing list
 * that feeds it.
 */

const decisionColor = (decision: TransportRequestDecision): 'default' | 'success' | 'error' => {
  if (decision === TransportRequestDecision.ACCEPTED) return 'success';
  if (decision === TransportRequestDecision.REJECTED) return 'error';
  return 'default';
};

/** Exported for the decision page (#229), which needs the same chip against
 * a referral it fetched itself rather than a `Datagrid`/card record. */
export const DecisionChip = ({ decision }: { decision: TransportRequestDecision }) => {
  const t = useT();
  return (
    <Chip
      size="small"
      variant={decision === TransportRequestDecision.PENDING ? 'outlined' : 'filled'}
      color={decisionColor(decision)}
      label={t(`transportRequestDecision.${decision}`)}
    />
  );
};

/** Minutes remaining, or overdue, against `responseDueAt` — same computation
 * `minutesUntilResponseDue` (shared) does server-side; the API hands the
 * number back already computed. */
const TimeRemaining = ({ minutes }: { minutes: number }) => {
  const t = useT();
  if (minutes < 0) {
    return (
      <Typography variant="body2" color="error.main" sx={{ fontWeight: 700 }}>
        {t('transportRequestList.overdueByMinutes', { minutes: Math.abs(minutes) })}
      </Typography>
    );
  }
  return (
    <Typography variant="body2" color="text.secondary">
      {t('transportRequestList.minutesRemaining', { minutes })}
    </Typography>
  );
};

const ListActions = () => {
  const t = useT();
  return (
    <TopToolbar>
      <CreateButton label={t('transportRequestList.addRequest')} />
      <ExportButton />
    </TopToolbar>
  );
};

/** One referral, as a stacked card — the mobile replacement for a row of the
 * desktop `Datagrid`, same shape as `OrganisationCard`. */
const TransportRequestCard = ({
  transportRequest,
  onOpen,
}: {
  transportRequest: TransportRequest;
  onOpen: () => void;
}) => {
  const t = useT();
  return (
    <Paper variant="outlined" onClick={onOpen} sx={{ p: 2, cursor: 'pointer' }}>
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography sx={{ fontWeight: 700 }}>{transportRequest.externalServiceNumber}</Typography>
          <DecisionChip decision={transportRequest.decision} />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {transportRequest.requestingOrganisation?.name ?? '—'}
          {' → '}
          {transportRequest.destinationFacility?.name ?? '—'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t(`transportRequestOccurrenceType.${transportRequest.occurrenceType}`)}
        </Typography>
        <TimeRemaining minutes={transportRequest.minutesUntilResponseDue} />
      </Stack>
    </Paper>
  );
};

const MobileTransportRequestList = () => {
  const { data, isLoading } = useListContext<TransportRequest>();
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
      {(data ?? []).map((transportRequest) => (
        <TransportRequestCard
          key={transportRequest.id}
          transportRequest={transportRequest}
          onOpen={() => navigate(`/transport-requests/${transportRequest.id}`)}
        />
      ))}
    </Stack>
  );
};

export const TransportRequestList = () => {
  const t = useT();
  const isMobile = useIsMobile();
  return (
    <List
      actions={<ListActions />}
      perPage={50}
      sort={{ field: 'responseDueAt', order: 'ASC' }}
      empty={false}
      component="div"
    >
      <Box sx={{ pt: 2 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('transportRequestList.helpText')}
        </Alert>
        {isMobile ? (
          <MobileTransportRequestList />
        ) : (
          <Paper variant="outlined">
            <Datagrid rowClick="edit" bulkActionButtons={false}>
              <TextField
                source="externalServiceNumber"
                label={t('resources.transport-requests.fields.externalServiceNumber')}
              />
              <ReferenceField
                source="requestingOrganisationId"
                reference="organisations"
                label={t('resources.transport-requests.fields.requestingOrganisationId')}
                link={false}
              >
                <TextField source="name" />
              </ReferenceField>
              <FunctionField
                label={t('resources.transport-requests.fields.occurrenceType')}
                render={(record: TransportRequest) => t(`transportRequestOccurrenceType.${record.occurrenceType}`)}
              />
              <FunctionField
                label={t('resources.transport-requests.fields.minutesUntilResponseDue')}
                render={(record: TransportRequest) => (
                  <TimeRemaining minutes={record.minutesUntilResponseDue} />
                )}
              />
              <FunctionField
                label={t('resources.transport-requests.fields.decision')}
                render={(record: TransportRequest) => <DecisionChip decision={record.decision} />}
              />
            </Datagrid>
          </Paper>
        )}
      </Box>
    </List>
  );
};

const RequestingOrganisationInput = () => {
  const t = useT();
  return (
    <ReferenceInput source="requestingOrganisationId" reference="organisations" filter={{ isRequester: true }}>
      <SelectInput
        label={t('resources.transport-requests.fields.requestingOrganisationId')}
        optionText="name"
        validate={required()}
        fullWidth
      />
    </ReferenceInput>
  );
};

const PayingOrganisationInput = () => {
  const t = useT();
  return (
    <ReferenceInput source="payingOrganisationId" reference="organisations" filter={{ isPayer: true }}>
      <SelectInput
        label={t('resources.transport-requests.fields.payingOrganisationId')}
        optionText="name"
        validate={required()}
        fullWidth
      />
    </ReferenceInput>
  );
};

/**
 * Not filtered by the currently-chosen paying organisation — the backend
 * (`assertAgreementScopedToPayer`) is what refuses a mismatched pair, the
 * same "form doesn't second-guess the API" bias `PatientsService`'s identity
 * gating comment describes.
 */
const AgreementInput = () => {
  const t = useT();
  return (
    <ReferenceInput source="agreementId" reference="agreements">
      <SelectInput label={t('resources.transport-requests.fields.agreementId')} optionText="name" fullWidth />
    </ReferenceInput>
  );
};

const PatientInput = () => {
  const t = useT();
  return (
    <ReferenceInput source="patientId" reference="patients">
      <AutocompleteInput
        label={t('resources.transport-requests.fields.patientId')}
        optionText={(patient: Patient) => patient.identity?.fullName ?? patient.id}
        validate={required()}
        fullWidth
      />
    </ReferenceInput>
  );
};

const OccurrenceTypeInput = () => {
  const t = useT();
  return (
    <SelectInput
      source="occurrenceType"
      label={t('resources.transport-requests.fields.occurrenceType')}
      choices={Object.values(TransportRequestOccurrenceType).map((value) => ({
        id: value,
        name: t(`transportRequestOccurrenceType.${value}`),
      }))}
      validate={required()}
      fullWidth
    />
  );
};

const RequestedVehicleTypeInput = () => {
  const t = useT();
  return (
    <SelectInput
      source="requestedVehicleType"
      label={t('resources.transport-requests.fields.requestedVehicleType')}
      choices={Object.values(TransportRequestVehicleType).map((value) => ({
        id: value,
        name: t(`transportRequestVehicleType.${value}`),
      }))}
      validate={required()}
      fullWidth
    />
  );
};

const TransportRequestFormFields = () => {
  const t = useT();
  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('transportRequestForm.helpText')}
      </Alert>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {t('transportRequestForm.sectionEnvelope')}
      </Typography>
      <TextInput
        source="batchReference"
        label={t('resources.transport-requests.fields.batchReference')}
        validate={required()}
        fullWidth
      />
      <DateTimeInput
        source="communicatedAt"
        label={t('resources.transport-requests.fields.communicatedAt')}
        validate={required()}
        fullWidth
      />
      <TextInput
        source="requesterAccountCode"
        label={t('resources.transport-requests.fields.requesterAccountCode')}
        validate={required()}
        fullWidth
      />
      <DateTimeInput
        source="responseDueAt"
        label={t('resources.transport-requests.fields.responseDueAt')}
        validate={required()}
        fullWidth
      />

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {t('transportRequestForm.sectionService')}
      </Typography>
      <TextInput
        source="externalServiceNumber"
        label={t('resources.transport-requests.fields.externalServiceNumber')}
        validate={required()}
        fullWidth
      />
      <DateTimeInput
        source="appointmentAt"
        label={t('resources.transport-requests.fields.appointmentAt')}
        validate={required()}
        fullWidth
      />
      <RequestingOrganisationInput />
      <PayingOrganisationInput />
      <AgreementInput />
      <PatientInput />
      <OccurrenceTypeInput />
      <RequestedVehicleTypeInput />
      <BooleanInput
        source="escortTravels"
        label={t('resources.transport-requests.fields.escortTravels')}
      />
      <BooleanInput source="isRoundTrip" label={t('resources.transport-requests.fields.isRoundTrip')} />

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {t('transportRequestForm.sectionOrigin')}
      </Typography>
      <TextInput
        source="originAddress"
        label={t('resources.transport-requests.fields.originAddress')}
        validate={required()}
        fullWidth
      />

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {t('transportRequestForm.sectionDestination')}
      </Typography>
      <DestinationFacilityField />

      <TextInput
        source="freeTextMessage"
        label={t('resources.transport-requests.fields.freeTextMessage')}
        multiline
        fullWidth
      />
      <TextInput
        source="coordColumnValue"
        label={t('resources.transport-requests.fields.coordColumnValue')}
        fullWidth
      />
    </>
  );
};

export const TransportRequestCreate = () => (
  <Create redirect="list">
    <SimpleForm>
      <TransportRequestFormFields />
    </SimpleForm>
  </Create>
);

export const TransportRequestEdit = () => (
  <Edit redirect="list">
    <SimpleForm>
      <TransportRequestFormFields />
    </SimpleForm>
  </Edit>
);
