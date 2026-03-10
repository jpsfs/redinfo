import {
  Create,
  SimpleForm,
  TextInput,
  SelectInput,
  PasswordInput,
  required,
  email,
  minLength,
} from 'react-admin';

const roleChoices = [
  { id: 'SYSTEM_ADMIN', name: 'System Administrator' },
  { id: 'EMERGENCY_OPERATIONAL', name: 'Emergency Operational' },
  { id: 'EMERGENCY_COORDINATOR', name: 'Emergency Coordinator' },
  { id: 'LOGISTICS_COORDINATOR', name: 'Logistics Coordinator' },
];

export const UserCreate = () => (
  <Create>
    <SimpleForm>
      <TextInput source="firstName" label="First Name" validate={required()} />
      <TextInput source="lastName" label="Last Name" validate={required()} />
      <TextInput source="email" validate={[required(), email()]} />
      <PasswordInput source="password" validate={[required(), minLength(8)]} />
      <SelectInput
        source="role"
        choices={roleChoices}
        defaultValue="EMERGENCY_OPERATIONAL"
        validate={required()}
      />
    </SimpleForm>
  </Create>
);
