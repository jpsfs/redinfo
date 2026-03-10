import {
  Show,
  SimpleShowLayout,
  TextField,
  EmailField,
  DateField,
  BooleanField,
  ChipField,
} from 'react-admin';

export const UserShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="firstName" label="First Name" />
      <TextField source="lastName" label="Last Name" />
      <EmailField source="email" />
      <ChipField source="role" />
      <ChipField source="provider" />
      <BooleanField source="isActive" label="Active" />
      <DateField source="createdAt" label="Created" showTime />
      <DateField source="updatedAt" label="Updated" showTime />
    </SimpleShowLayout>
  </Show>
);
