import {
  List,
  Datagrid,
  TextField,
  EmailField,
  DateField,
  BooleanField,
  ChipField,
  SearchInput,
  SelectInput,
  TopToolbar,
  CreateButton,
  ExportButton,
} from 'react-admin';

const userFilters = [
  <SearchInput source="q" alwaysOn key="q" />,
  <SelectInput
    source="role"
    key="role"
    choices={[
      { id: 'ADMIN', name: 'Admin' },
      { id: 'STAFF', name: 'Staff' },
      { id: 'VOLUNTEER', name: 'Volunteer' },
    ]}
  />,
];

const ListActions = () => (
  <TopToolbar>
    <CreateButton />
    <ExportButton />
  </TopToolbar>
);

export const UserList = () => (
  <List filters={userFilters} actions={<ListActions />}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="firstName" label="First Name" />
      <TextField source="lastName" label="Last Name" />
      <EmailField source="email" />
      <ChipField source="role" />
      <ChipField source="provider" />
      <BooleanField source="isActive" label="Active" />
      <DateField source="createdAt" label="Created" showTime />
    </Datagrid>
  </List>
);
