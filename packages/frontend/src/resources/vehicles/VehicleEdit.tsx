import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  DateInput,
  NumberInput,
  BooleanInput,
  required,
  regex,
} from 'react-admin';
import { Divider, Typography } from '@mui/material';
import {
  MAX_VEHICLE_SEATED_CAPACITY,
  MAX_VEHICLE_WHEELCHAIR_POSITIONS,
  MAX_VEHICLE_STRETCHER_POSITIONS,
} from '@redinfo/shared';
import { useT } from '../../i18n/useT';

const PT_LICENSE_PLATE_REGEX =
  /^([A-Z]{2}-\d{2}-\d{2}|\d{2}-\d{2}-[A-Z]{2}|\d{2}-[A-Z]{2}-\d{2}|[A-Z]{2}-\d{2}-[A-Z]{2})$/i;

export const VehicleEdit = () => {
  const t = useT();
  const vehicleTypeChoices = [
    { id: 'EMERGENCY', name: t('vehicleType.EMERGENCY') },
    { id: 'TRANSPORT', name: t('vehicleType.TRANSPORT') },
  ];

  return (
    <Edit>
      <SimpleForm>
        <TextInput
          source="licensePlate"
          validate={[required(), regex(PT_LICENSE_PLATE_REGEX, t('vehicleForm.licensePlateInvalid'))]}
          helperText={t('vehicleForm.licensePlateHelp')}
          inputProps={{ style: { textTransform: 'uppercase' } }}
          fullWidth
        />
        <TextInput source="numeroCauda" validate={required()} fullWidth />
        <SelectInput source="vehicleType" choices={vehicleTypeChoices} validate={required()} fullWidth />
        <DateInput source="insuranceRenewalDate" validate={required()} fullWidth />
        <DateInput source="nextImtInspectionDate" validate={required()} fullWidth />
        <TextInput source="manufacturer" fullWidth />
        <TextInput source="model" fullWidth />
        <TextInput source="notes" multiline rows={3} fullWidth />

        <Divider sx={{ width: '100%', my: 2 }} />
        <Typography variant="subtitle2">{t('vehicleForm.configurationHeading')}</Typography>
        <NumberInput
          source="seatedCapacity"
          min={0}
          max={MAX_VEHICLE_SEATED_CAPACITY}
          fullWidth
        />
        <NumberInput
          source="wheelchairPositions"
          min={0}
          max={MAX_VEHICLE_WHEELCHAIR_POSITIONS}
          fullWidth
        />
        <NumberInput
          source="stretcherPositions"
          min={0}
          max={MAX_VEHICLE_STRETCHER_POSITIONS}
          fullWidth
        />
        <BooleanInput source="hasRampOrLift" />
      </SimpleForm>
    </Edit>
  );
};
