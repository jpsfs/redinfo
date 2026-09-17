import {
  Edit,
  SimpleForm,
  TextInput,
  ReferenceInput,
  AutocompleteInput,
  NumberInput,
  required,
  FormDataConsumer,
  useGetOne,
  useLocaleState,
} from 'react-admin';
import { InventoryItemType, Locale, MaterialItem, materialItemDisplayName } from '@redinfo/shared';

/**
 * `recommendedQuantity` only makes sense for a `COUNTABLE` item, and type is
 * no longer a field on this form — it's read through from the linked
 * `MaterialItem` (#206) — so this fetches the selected item just to know
 * whether to show the field at all.
 */
const RecommendedQuantityInput = ({ materialItemId }: { materialItemId?: string }) => {
  const { data } = useGetOne<MaterialItem>(
    'material-items',
    { id: materialItemId as string },
    { enabled: Boolean(materialItemId) },
  );
  if (!materialItemId || data?.type === InventoryItemType.UNLIMITED) return null;
  return <NumberInput source="recommendedQuantity" min={0} validate={required()} fullWidth />;
};

export const InventoryItemEdit = () => {
  const [locale] = useLocaleState();

  return (
    <Edit redirect="show">
      <SimpleForm>
        <ReferenceInput source="materialItemId" reference="material-items">
          <AutocompleteInput
            optionText={(record: MaterialItem) => materialItemDisplayName(record, locale as Locale)}
            filterToQuery={(searchText: string) => ({ q: searchText })}
            validate={required()}
            fullWidth
          />
        </ReferenceInput>
        <FormDataConsumer>
          {({ formData }) => <RecommendedQuantityInput materialItemId={formData.materialItemId} />}
        </FormDataConsumer>
        <NumberInput source="order" min={0} fullWidth />
        <TextInput source="notes" multiline fullWidth />
      </SimpleForm>
    </Edit>
  );
};
