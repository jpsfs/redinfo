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
import { useT } from '../../i18n/useT';

export const InventoryItemCreate = () => {
  const t = useT();
  const location = useLocation();
  const defaultValues = (location.state as { record?: { templateId?: string } })?.record ?? {};
  const itemTypeChoices = [
    { id: 'COUNTABLE', name: t('itemType.COUNTABLE') },
    { id: 'UNLIMITED', name: t('itemType.UNLIMITED') },
  ];

  return (
    <Create redirect="show">
      <SimpleForm defaultValues={defaultValues}>
        <TextInput source="templateId" required disabled fullWidth />
        <TextInput source="name" validate={required()} fullWidth />
        <SelectInput
          source="type"
          choices={itemTypeChoices}
          validate={required()}
          defaultValue="COUNTABLE"
          fullWidth
        />
        <FormDataConsumer>
          {({ formData }) =>
            formData.type !== 'UNLIMITED' && (
              <NumberInput source="recommendedQuantity" min={0} validate={required()} fullWidth />
            )
          }
        </FormDataConsumer>
        <TextInput
          source="unit"
          validate={required()}
          defaultValue="pcs"
          helperText={t('inventoryItemForm.unitHelp')}
          fullWidth
        />
        <NumberInput source="order" min={0} defaultValue={0} fullWidth />
        <TextInput source="notes" multiline fullWidth />
      </SimpleForm>
    </Create>
  );
};
