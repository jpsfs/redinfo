import {
  Create,
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
import { useLocation } from 'react-router-dom';
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

export const InventoryItemCreate = () => {
  const location = useLocation();
  const [locale] = useLocaleState();
  const defaultValues = (location.state as { record?: { templateId?: string } })?.record ?? {};

  return (
    <Create redirect="show">
      <SimpleForm defaultValues={defaultValues}>
        <TextInput source="templateId" required disabled fullWidth />
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
        <NumberInput source="order" min={0} defaultValue={0} fullWidth />
        <TextInput source="notes" multiline fullWidth />
      </SimpleForm>
    </Create>
  );
};
