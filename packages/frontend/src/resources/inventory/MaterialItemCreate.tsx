import { Create, SimpleForm } from 'react-admin';
import { MaterialItemFormFields } from './MaterialItemForm';

export const MaterialItemCreate = () => (
  <Create redirect="list">
    <SimpleForm>
      <MaterialItemFormFields />
    </SimpleForm>
  </Create>
);
