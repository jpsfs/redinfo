import {
  Create,
  SelectInput,
  SimpleForm,
  TextInput,
  PasswordInput,
  required,
  email,
  minLength,
} from 'react-admin';
import { Divider, Typography } from '@mui/material';
import { BLOOD_TYPE_LABEL, BloodType, UserRole } from '@redinfo/shared';
import { accountRoleLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';

/**
 * Account creation is administrator-only (`Action.MANAGE_USERS`) — the route
 * is gated the same way, so unlike `UserEdit` this form does not need to hide
 * fields by permission. Certifications are added afterwards, from the
 * person's own record: driving is a certification, not a flag set here.
 */
export const UserCreate = () => {
  const t = useT();
  const roleChoices = Object.values(UserRole).map((role) => ({
    id: role,
    name: accountRoleLabel(t, role),
  }));
  const bloodTypeChoices = Object.values(BloodType).map((type) => ({
    id: type,
    name: BLOOD_TYPE_LABEL[type],
  }));

  return (
    <Create>
      <SimpleForm>
        <Typography variant="subtitle2">{t('userForm.accountSection')}</Typography>
        <TextInput source="firstName" validate={required()} />
        <TextInput source="lastName" validate={required()} />
        <TextInput source="email" validate={[required(), email()]} />
        <PasswordInput source="password" validate={[required(), minLength(8)]} />
        <SelectInput
          source="role"
          choices={roleChoices}
          defaultValue="EMERGENCY_OPERATIONAL"
          validate={required()}
        />

        <Divider sx={{ width: '100%', my: 2 }} />
        <Typography variant="subtitle2">{t('userForm.personnelSectionOptional')}</Typography>
        <TextInput source="phone" />
        <TextInput source="birthDate" type="date" InputLabelProps={{ shrink: true }} />
        <TextInput source="joinedOn" type="date" InputLabelProps={{ shrink: true }} />
        <TextInput source="addressLine" />
        <TextInput source="postalCode" />
        <TextInput source="redCrossNumber" />
        <TextInput source="volunteerNumber" helperText={t('userForm.volunteerNumberHint')} />
        <TextInput source="nif" />
        <TextInput source="citizenCardNumber" />
        <SelectInput source="bloodType" choices={bloodTypeChoices} />
        <TextInput source="emergencyContactName" />
        <TextInput source="emergencyContactPhone" />
      </SimpleForm>
    </Create>
  );
};
