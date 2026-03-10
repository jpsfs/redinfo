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
  { id: 'ADMIN', name: 'Admin' },
  { id: 'STAFF', name: 'Staff' },
  { id: 'VOLUNTEER', name: 'Volunteer' },
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
        defaultValue="VOLUNTEER"
        validate={required()}
      />
    </SimpleForm>
  </Create>
);
