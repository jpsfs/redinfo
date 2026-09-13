import { useState } from 'react';
import { useInput, useRecordContext } from 'react-admin';
import { Button, Stack } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Locality, Patient } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
// Reused from eventReports rather than a second search widget for the same
// job: "type a few letters, get back a locality" is one problem, not two.
import { LocalityPicker, localityLabel } from '../eventReports/LocalityPicker';

/**
 * `Patient.localityId`, picked the same way an event report's is.
 *
 * Kept unsealed, unlike the rest of a patient's address — every planning
 * query reads it directly, without opening the identity blob (see the
 * schema comment on `Patient.localityId`, backend) — so this field is always
 * shown, whether or not the viewer holds `VIEW_PATIENT_IDENTITY`.
 */
export const PatientLocalityField = ({ source = 'localityId' }: { source?: string }) => {
  const t = useT();
  const record = useRecordContext<Patient>();
  const { field } = useInput({ source });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosen, setChosen] = useState<Locality | null>(record?.locality ?? null);

  return (
    <Stack spacing={0.5} sx={{ mb: 2 }}>
      <Button
        variant="outlined"
        color="secondary"
        onClick={() => setPickerOpen(true)}
        endIcon={<ChevronRightIcon />}
        sx={{ justifyContent: 'space-between', textAlign: 'left', minHeight: 48 }}
      >
        {chosen ? localityLabel(chosen) : t('patientForm.noLocalityChosen')}
      </Button>
      <LocalityPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(locality: Locality) => {
          setChosen(locality);
          field.onChange(locality.id);
        }}
      />
    </Stack>
  );
};
