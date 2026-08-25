import {
  Edit,
  SimpleForm,
  TextInput,
  DateInput,
  NumberInput,
  ReferenceInput,
  SelectInput,
  required,
  type Identifier,
  type RaRecord,
} from 'react-admin';

interface MaintenanceData extends RaRecord {
  vehicleId?: string;
}

export const MaintenanceEdit = () => (
  <Edit redirect={(_resource: string | undefined, _id: Identifier | undefined, data: Partial<RaRecord> | undefined) => `vehicles/${(data as MaintenanceData | undefined)?.vehicleId}/show`}>
    <SimpleForm>
      <ReferenceInput source="vehicleId" reference="vehicles">
        <SelectInput
          optionText={(v: { licensePlate: string; numeroCauda: string }) =>
            `${v.licensePlate} – ${v.numeroCauda}`
          }
          validate={required()}
          fullWidth
          disabled
        />
      </ReferenceInput>
      <DateInput source="date" validate={required()} fullWidth />
      <TextInput source="description" validate={required()} fullWidth />
      <TextInput source="serviceProvider" validate={required()} fullWidth />
      <NumberInput source="cost" validate={required()} min={0} step={0.01} fullWidth />
      <NumberInput source="vatAmount" min={0} step={0.01} fullWidth />
      <TextInput source="notes" multiline rows={3} fullWidth />
    </SimpleForm>
  </Edit>
);
