import {
  Edit,
  SimpleForm,
  TextInput,
} from 'react-admin';

export const InventoryTemplateEdit = () => (
  <Edit redirect="show">
    <SimpleForm>
      <TextInput source="notes" label="Notes" multiline fullWidth />
    </SimpleForm>
  </Edit>
);
