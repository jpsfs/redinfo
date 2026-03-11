import {
  Create,
  SimpleForm,
  TextInput,
  SelectInput,
  NumberInput,
  required,
  FormDataConsumer,
} from 'react-admin';
import { useLocation } from 'react-router-dom';

const itemTypeChoices = [
  { id: 'COUNTABLE', name: 'Countable (integer quantity)' },
  { id: 'UNLIMITED', name: 'Unlimited (present/absent only)' },
];

export const InventoryItemCreate = () => {
  const location = useLocation();
  const defaultValues = (location.state as { record?: { templateId?: string } })?.record ?? {};

  return (
    <Create redirect="show">
      <SimpleForm defaultValues={defaultValues}>
        <TextInput
          source="templateId"
          label="Template ID"
          required
          disabled
          fullWidth
        />
        <TextInput
          source="name"
          label="Item Name"
          validate={required()}
          fullWidth
        />
        <SelectInput
          source="type"
          label="Type"
          choices={itemTypeChoices}
          validate={required()}
          defaultValue="COUNTABLE"
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
          defaultValue="pcs"
          fullWidth
        />
        <NumberInput
          source="order"
          label="Display Order"
          min={0}
          defaultValue={0}
          fullWidth
        />
        <TextInput source="notes" label="Notes (optional)" multiline fullWidth />
      </SimpleForm>
    </Create>
  );
};
