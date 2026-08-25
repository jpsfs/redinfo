import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  NumberInput,
  required,
  FormDataConsumer,
} from 'react-admin';
import { useT } from '../../i18n/useT';

export const InventoryItemEdit = () => {
  const t = useT();
  const itemTypeChoices = [
    { id: 'COUNTABLE', name: t('itemType.COUNTABLE') },
    { id: 'UNLIMITED', name: t('itemType.UNLIMITED') },
  ];

  return (
    <Edit redirect="show">
      <SimpleForm>
        <TextInput source="name" validate={required()} fullWidth />
        <SelectInput source="type" choices={itemTypeChoices} validate={required()} fullWidth />
        <FormDataConsumer>
          {({ formData }) =>
            formData.type !== 'UNLIMITED' && (
              <NumberInput source="recommendedQuantity" min={0} validate={required()} fullWidth />
            )
          }
        </FormDataConsumer>
        <TextInput source="unit" validate={required()} helperText={t('inventoryItemForm.unitHelp')} fullWidth />
        <NumberInput source="order" min={0} fullWidth />
        <TextInput source="notes" multiline fullWidth />
      </SimpleForm>
    </Edit>
  );
};
