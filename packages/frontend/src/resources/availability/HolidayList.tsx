import {
  Create,
  CreateButton,
  Datagrid,
  DateField,
  DateInput,
  Edit,
  ExportButton,
  List,
  SimpleForm,
  TextField,
  TextInput,
  TopToolbar,
  required,
} from 'react-admin';
import { Link } from 'react-router-dom';
import { Alert, Button } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';

const HOLIDAY_HELP =
  'A holiday makes that weekday start on the weekend pattern when a window is ' +
  'opened: two shifts (08:00–16:00 and 16:00–24:00) instead of the single ' +
  '20:00–24:00 workday shift. Windows already open keep the shifts they were ' +
  'given.';

/**
 * Holidays have no menu entry of their own — they are reached from Availability
 * Windows — so every holiday screen carries its own way back.
 */
const BackToWindowsButton = () => (
  <Button
    component={Link}
    to="/availability-windows"
    size="small"
    startIcon={<ChevronLeftIcon />}
  >
    Availability windows
  </Button>
);

const ListActions = () => (
  <TopToolbar>
    <BackToWindowsButton />
    <CreateButton label="Add holiday" />
    <ExportButton />
  </TopToolbar>
);

const FormActions = () => (
  <TopToolbar>
    <BackToWindowsButton />
  </TopToolbar>
);

export const HolidayList = () => (
  <List
    actions={<ListActions />}
    perPage={50}
    sort={{ field: 'date', order: 'ASC' }}
    empty={false}
  >
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        {HOLIDAY_HELP}
      </Alert>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <DateField source="date" label="Date" />
        <TextField source="name" label="Holiday" />
      </Datagrid>
    </>
  </List>
);

export const HolidayCreate = () => (
  <Create redirect="list" actions={<FormActions />}>
    <SimpleForm>
      <Alert severity="info" sx={{ mb: 2 }}>
        {HOLIDAY_HELP}
      </Alert>
      <DateInput source="date" label="Date" validate={required()} />
      <TextInput
        source="name"
        label="Holiday name"
        validate={required()}
        helperText="e.g. Implantação da República"
      />
    </SimpleForm>
  </Create>
);

export const HolidayEdit = () => (
  <Edit redirect="list" actions={<FormActions />}>
    <SimpleForm>
      <DateInput source="date" label="Date" validate={required()} />
      <TextInput source="name" label="Holiday name" validate={required()} />
    </SimpleForm>
  </Edit>
);
