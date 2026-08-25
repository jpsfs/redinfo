import {
  Create,
  SimpleForm,
  SelectInput,
  TextInput,
  required,
} from 'react-admin';
import { useT } from '../../i18n/useT';

export const InventoryTemplateCreate = () => {
  const t = useT();
  const vehicleTypeChoices = [
    { id: 'EMERGENCY', name: t('vehicleType.EMERGENCY') },
    { id: 'TRANSPORT', name: t('vehicleType.TRANSPORT') },
  ];

  return (
    <Create redirect="show">
      <SimpleForm>
        <SelectInput source="vehicleType" choices={vehicleTypeChoices} validate={required()} fullWidth />
        <TextInput source="notes" multiline fullWidth />
      </SimpleForm>
    </Create>
  );
};
