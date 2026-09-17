import {
  Create,
  SimpleForm,
  TextInput,
  DateInput,
  NumberInput,
  ReferenceInput,
  SelectInput,
  required,
  useCreateContext,
  type Identifier,
  type RaRecord,
} from 'react-admin';
import { useLocation } from 'react-router-dom';

interface MaintenanceData extends RaRecord {
  vehicleId?: string;
}

const MaintenanceCreateForm = () => {
  const { record } = useCreateContext();
  const location = useLocation();
  // Support pre-filled vehicleId via router state
  const defaultVehicleId =
    (location.state as { record?: { vehicleId?: string } } | null)?.record?.vehicleId ??
    record?.vehicleId;

  return (
    <SimpleForm defaultValues={{ vehicleId: defaultVehicleId }}>
      <ReferenceInput source="vehicleId" reference="vehicles">
        <SelectInput
          optionText={(v: { licensePlate: string; numeroCauda: string }) =>
            `${v.licensePlate} – ${v.numeroCauda}`
          }
          validate={required()}
          fullWidth
        />
      </ReferenceInput>
      <DateInput source="date" validate={required()} fullWidth />
      <TextInput source="description" validate={required()} fullWidth />
      <TextInput source="serviceProvider" validate={required()} fullWidth />
      <NumberInput source="cost" validate={required()} min={0} step={0.01} fullWidth />
      <NumberInput source="vatAmount" min={0} step={0.01} fullWidth />
      <TextInput source="notes" multiline rows={3} fullWidth />
    </SimpleForm>
  );
};

export const MaintenanceCreate = () => (
  <Create redirect={(_resource: string | undefined, _id: Identifier | undefined, data: Partial<RaRecord> | undefined) => `vehicles/${(data as MaintenanceData | undefined)?.vehicleId}/show`}>
    <MaintenanceCreateForm />
  </Create>
);
