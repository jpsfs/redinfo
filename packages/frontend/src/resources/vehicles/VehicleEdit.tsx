import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  DateInput,
  required,
  regex,
} from 'react-admin';

const PT_LICENSE_PLATE_REGEX =
  /^([A-Z]{2}-\d{2}-\d{2}|\d{2}-\d{2}-[A-Z]{2}|\d{2}-[A-Z]{2}-\d{2}|[A-Z]{2}-\d{2}-[A-Z]{2})$/i;

const vehicleTypeChoices = [
  { id: 'EMERGENCY', name: 'Emergency' },
  { id: 'TRANSPORT', name: 'Transport' },
];

export const VehicleEdit = () => (
  <Edit>
    <SimpleForm>
      <TextInput
        source="licensePlate"
        label="Licence Plate"
        validate={[
          required(),
          regex(
            PT_LICENSE_PLATE_REGEX,
            'Must be a valid Portuguese plate: AA-99-99, 99-99-AA, 99-AA-99 or AA-99-AA',
          ),
        ]}
        helperText="Portuguese format, e.g. 55-AA-12 or AB-12-CD"
        inputProps={{ style: { textTransform: 'uppercase' } }}
        fullWidth
      />
      <TextInput
        source="numeroCauda"
        label="Nº de Cauda (Fleet ID)"
        validate={required()}
        fullWidth
      />
      <SelectInput
        source="vehicleType"
        label="Vehicle Type"
        choices={vehicleTypeChoices}
        validate={required()}
        fullWidth
      />
      <DateInput
        source="insuranceRenewalDate"
        label="Insurance Renewal Date"
        validate={required()}
        fullWidth
      />
      <DateInput
        source="nextImtInspectionDate"
        label="Next IMT Inspection Date"
        validate={required()}
        fullWidth
      />
      <TextInput source="manufacturer" label="Manufacturer (optional)" fullWidth />
      <TextInput source="model" label="Model (optional)" fullWidth />
      <TextInput source="notes" label="Notes (optional)" multiline rows={3} fullWidth />
    </SimpleForm>
  </Edit>
);
