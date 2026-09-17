import { Edit, SimpleForm } from 'react-admin';
import { MaterialItemFormFields } from './MaterialItemForm';

export const MaterialItemEdit = () => (
  <Edit redirect="list">
    <SimpleForm>
      <MaterialItemFormFields />
    </SimpleForm>
  </Edit>
);
