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
import { useT } from '../../i18n/useT';

/**
 * Holidays have no menu entry of their own — they are reached from Availability
 * Windows — so every holiday screen carries its own way back.
 */
const BackToWindowsButton = () => {
  const t = useT();
  return (
    <Button
      component={Link}
      to="/availability-windows"
      size="small"
      startIcon={<ChevronLeftIcon />}
    >
      {t('holidayList.backToWindows')}
    </Button>
  );
};

const ListActions = () => {
  const t = useT();
  return (
    <TopToolbar>
      <BackToWindowsButton />
      <CreateButton label={t('holidayList.addHoliday')} />
      <ExportButton />
    </TopToolbar>
  );
};

const FormActions = () => (
  <TopToolbar>
    <BackToWindowsButton />
  </TopToolbar>
);

export const HolidayList = () => {
  const t = useT();
  return (
    <List
      actions={<ListActions />}
      perPage={50}
      sort={{ field: 'date', order: 'ASC' }}
      empty={false}
    >
      <>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('holidayList.help')}
        </Alert>
        <Datagrid rowClick="edit" bulkActionButtons={false}>
          <DateField source="date" />
          <TextField source="name" />
        </Datagrid>
      </>
    </List>
  );
};

export const HolidayCreate = () => {
  const t = useT();
  return (
    <Create redirect="list" actions={<FormActions />}>
      <SimpleForm>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('holidayList.help')}
        </Alert>
        <DateInput source="date" validate={required()} />
        <TextInput
          source="name"
          validate={required()}
          helperText={t('holidayList.nameHelp')}
        />
      </SimpleForm>
    </Create>
  );
};

export const HolidayEdit = () => (
  <Edit redirect="list" actions={<FormActions />}>
    <SimpleForm>
      <DateInput source="date" validate={required()} />
      <TextInput source="name" validate={required()} />
    </SimpleForm>
  </Edit>
);
