import {
  ArrayInput,
  BooleanInput,
  FormDataConsumer,
  NumberInput,
  SelectInput,
  SimpleFormIterator,
  TextInput,
  required,
} from 'react-admin';
import { InventoryItemType } from '@redinfo/shared';
import { useT } from '../../i18n/useT';

/**
 * The field set shared by `MaterialItemCreate` and `MaterialItemEdit` (#206).
 * `namePt`/`nameEn` are data, not a locale toggle — both are kept, PT is the
 * required fallback per `materialItemDisplayName` (shared).
 */
export const MaterialItemFormFields = () => {
  const t = useT();

  const typeChoices = [
    { id: InventoryItemType.COUNTABLE, name: t('itemType.COUNTABLE') },
    { id: InventoryItemType.UNLIMITED, name: t('itemType.UNLIMITED') },
  ];

  return (
    <>
      <TextInput source="namePt" validate={required()} fullWidth />
      <TextInput source="nameEn" helperText={t('materialItemForm.namePtHelp')} fullWidth />
      <SelectInput
        source="type"
        choices={typeChoices}
        validate={required()}
        defaultValue={InventoryItemType.COUNTABLE}
        fullWidth
      />
      <TextInput
        source="unit"
        validate={required()}
        defaultValue="pcs"
        helperText={t('inventoryItemForm.unitHelp')}
        fullWidth
      />
      <BooleanInput source="isFrequent" defaultValue={false} />
      <FormDataConsumer>
        {({ formData }) =>
          formData.isFrequent && (
            <NumberInput
              source="frequentOrder"
              min={0}
              defaultValue={0}
              helperText={t('materialItemForm.frequentOrderHelp')}
              fullWidth
            />
          )
        }
      </FormDataConsumer>
      <TextInput source="notes" multiline fullWidth />
      <ArrayInput source="barcodes">
        <SimpleFormIterator inline disableReordering>
          <TextInput
            source="code"
            label={t('resources.material-items.fields.barcodes.code')}
            validate={required()}
          />
          <TextInput source="label" label={t('resources.material-items.fields.barcodes.label')} />
        </SimpleFormIterator>
      </ArrayInput>
    </>
  );
};
