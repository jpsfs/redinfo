import {
  CreateButton,
  Datagrid,
  ExportButton,
  FunctionField,
  List,
  TopToolbar,
  useListContext,
} from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { Action, Patient } from '@redinfo/shared';
import { useCapabilities } from '../../hooks/useCapabilities';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useT } from '../../i18n/useT';
import { MobilityChip, StatusChip } from './patientChips';

/**
 * The non-urgent transport patient list (#219, #226).
 *
 * Whether the identity column exists at all depends on `VIEW_PATIENT_IDENTITY`
 * — not on masking or hiding a column client-side, but because the API never
 * sent the field to begin with (see `PatientsService`). A caller without it
 * still manages the transport profile: mobility, coordinates, locality.
 */

const ListActions = () => {
  const t = useT();
  return (
    <TopToolbar>
      <CreateButton label={t('patientList.addPatient')} />
      <ExportButton />
    </TopToolbar>
  );
};

const PatientCard = ({
  patient,
  canSeeIdentity,
  onOpen,
}: {
  patient: Patient;
  canSeeIdentity: boolean;
  onOpen: () => void;
}) => {
  const t = useT();
  return (
    <Paper variant="outlined" onClick={onOpen} sx={{ p: 2, cursor: 'pointer' }}>
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography sx={{ fontWeight: 700 }}>
            {canSeeIdentity ? patient.identity?.fullName ?? t('patientList.noIdentityYet') : patient.id}
          </Typography>
          <StatusChip active={patient.isActive} />
        </Stack>

        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          <MobilityChip value={patient.mobility} />
          {patient.needsOxygen && (
            <Chip size="small" variant="outlined" label={t('resources.patients.fields.needsOxygen')} />
          )}
          {patient.escortRequired && (
            <Chip size="small" variant="outlined" label={t('resources.patients.fields.escortRequired')} />
          )}
          {patient.isBariatric && (
            <Chip size="small" variant="outlined" label={t('resources.patients.fields.isBariatric')} />
          )}
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {patient.locality?.name ?? '—'}
        </Typography>
      </Stack>
    </Paper>
  );
};

const MobilePatientList = ({ canSeeIdentity }: { canSeeIdentity: boolean }) => {
  const { data, isLoading } = useListContext<Patient>();
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
      {(data ?? []).map((patient) => (
        <PatientCard
          key={patient.id}
          patient={patient}
          canSeeIdentity={canSeeIdentity}
          onOpen={() => navigate(`/patients/${patient.id}`)}
        />
      ))}
    </Stack>
  );
};

export const PatientList = () => {
  const t = useT();
  const isMobile = useIsMobile();
  const { can } = useCapabilities();
  const canSeeIdentity = can([Action.VIEW_PATIENT_IDENTITY]);

  return (
    <List
      actions={<ListActions />}
      perPage={50}
      sort={{ field: 'updatedAt', order: 'DESC' }}
      empty={false}
      component="div"
    >
      <Box sx={{ pt: 2 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('patientList.helpText')}
        </Alert>
        {!canSeeIdentity && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('patientList.identityRestricted')}
          </Alert>
        )}
        {isMobile ? (
          <MobilePatientList canSeeIdentity={canSeeIdentity} />
        ) : (
          <Paper variant="outlined">
            <Datagrid rowClick="edit" bulkActionButtons={false}>
              {canSeeIdentity && (
                <FunctionField
                  label={t('patientList.colName')}
                  render={(record: Patient) => record.identity?.fullName ?? '—'}
                />
              )}
              <FunctionField
                label={t('resources.patients.fields.mobility')}
                render={(record: Patient) => <MobilityChip value={record.mobility} />}
              />
              <FunctionField
                label={t('patientList.colLocality')}
                render={(record: Patient) => record.locality?.name ?? '—'}
              />
              <FunctionField
                source="isActive"
                render={(record: Patient) => <StatusChip active={record.isActive} />}
              />
            </Datagrid>
          </Paper>
        )}
      </Box>
    </List>
  );
};
