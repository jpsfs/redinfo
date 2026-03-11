import {
  Create,
  SimpleForm,
  SelectInput,
  TextInput,
  required,
} from 'react-admin';

const vehicleTypeChoices = [
  { id: 'EMERGENCY', name: 'Emergency' },
  { id: 'TRANSPORT', name: 'Transport' },
];

export const InventoryTemplateCreate = () => (
  <Create redirect="show">
    <SimpleForm>
      <SelectInput
        source="vehicleType"
        label="Vehicle Type"
        choices={vehicleTypeChoices}
        validate={required()}
        fullWidth
      />
      <TextInput source="notes" label="Notes (optional)" multiline fullWidth />
    </SimpleForm>
  </Create>
);
