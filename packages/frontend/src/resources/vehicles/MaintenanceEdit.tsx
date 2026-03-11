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
          label="Vehicle"
          validate={required()}
          fullWidth
          disabled
        />
      </ReferenceInput>
      <DateInput source="date" label="Date" validate={required()} fullWidth />
      <TextInput source="description" label="Description" validate={required()} fullWidth />
      <TextInput
        source="serviceProvider"
        label="Service Provider"
        validate={required()}
        fullWidth
      />
      <NumberInput
        source="cost"
        label="Cost (€)"
        validate={required()}
        min={0}
        step={0.01}
        fullWidth
      />
      <NumberInput
        source="vatAmount"
        label="VAT Amount (€) — optional"
        min={0}
        step={0.01}
        fullWidth
      />
      <TextInput source="notes" label="Notes (optional)" multiline rows={3} fullWidth />
    </SimpleForm>
  </Edit>
);
