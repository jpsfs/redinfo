import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  NumberInput,
  required,
  FormDataConsumer,
} from 'react-admin';

const itemTypeChoices = [
  { id: 'COUNTABLE', name: 'Countable (integer quantity)' },
  { id: 'UNLIMITED', name: 'Unlimited (present/absent only)' },
];

export const InventoryItemEdit = () => (
  <Edit redirect="show">
    <SimpleForm>
      <TextInput source="name" label="Item Name" validate={required()} fullWidth />
      <SelectInput
        source="type"
        label="Type"
        choices={itemTypeChoices}
        validate={required()}
        fullWidth
      />
      <FormDataConsumer>
        {({ formData }) =>
          formData.type !== 'UNLIMITED' && (
            <NumberInput
              source="recommendedQuantity"
              label="Recommended Quantity"
              min={0}
              validate={required()}
              fullWidth
            />
          )
        }
      </FormDataConsumer>
      <TextInput
        source="unit"
        label="Unit (e.g. pcs, liters, kit)"
        validate={required()}
        fullWidth
      />
      <NumberInput source="order" label="Display Order" min={0} fullWidth />
      <TextInput source="notes" label="Notes (optional)" multiline fullWidth />
    </SimpleForm>
  </Edit>
);
