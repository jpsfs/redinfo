import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  BooleanInput,
  PasswordInput,
  required,
  email,
} from 'react-admin';

const roleChoices = [
  { id: 'SYSTEM_ADMIN', name: 'System Administrator' },
  { id: 'EMERGENCY_OPERATIONAL', name: 'Emergency Operational' },
  { id: 'EMERGENCY_COORDINATOR', name: 'Emergency Coordinator' },
  { id: 'LOGISTICS_COORDINATOR', name: 'Logistics Coordinator' },
];

export const UserEdit = () => (
  <Edit>
    <SimpleForm>
      <TextInput source="firstName" label="First Name" validate={required()} />
      <TextInput source="lastName" label="Last Name" validate={required()} />
      <TextInput source="email" validate={[required(), email()]} />
      <SelectInput source="role" choices={roleChoices} validate={required()} />
      <PasswordInput source="password" label="New Password (leave blank to keep)" />
      <BooleanInput source="isActive" label="Active" />
    </SimpleForm>
  </Edit>
);
