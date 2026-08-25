import {
  Create,
  SimpleForm,
  TextInput,
  SelectInput,
  DateInput,
  required,
  regex,
} from 'react-admin';
import { useT } from '../../i18n/useT';

const PT_LICENSE_PLATE_REGEX =
  /^([A-Z]{2}-\d{2}-\d{2}|\d{2}-\d{2}-[A-Z]{2}|\d{2}-[A-Z]{2}-\d{2}|[A-Z]{2}-\d{2}-[A-Z]{2})$/i;

export const VehicleCreate = () => {
  const t = useT();
  const vehicleTypeChoices = [
    { id: 'EMERGENCY', name: t('vehicleType.EMERGENCY') },
    { id: 'TRANSPORT', name: t('vehicleType.TRANSPORT') },
  ];

  return (
    <Create>
      <SimpleForm>
        <TextInput
          source="licensePlate"
          validate={[required(), regex(PT_LICENSE_PLATE_REGEX, t('vehicleForm.licensePlateInvalid'))]}
          helperText={t('vehicleForm.licensePlateHelp')}
          inputProps={{ style: { textTransform: 'uppercase' } }}
          fullWidth
        />
        <TextInput
          source="numeroCauda"
          validate={required()}
          helperText={t('vehicleForm.numeroCaudaHelp')}
          fullWidth
        />
        <SelectInput source="vehicleType" choices={vehicleTypeChoices} validate={required()} fullWidth />
        <DateInput source="insuranceRenewalDate" validate={required()} fullWidth />
        <DateInput source="nextImtInspectionDate" validate={required()} fullWidth />
        <TextInput source="manufacturer" fullWidth />
        <TextInput source="model" fullWidth />
        <TextInput source="notes" multiline rows={3} fullWidth />
      </SimpleForm>
    </Create>
  );
};
