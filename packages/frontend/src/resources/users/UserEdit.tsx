import {
  BooleanInput,
  Edit,
  PasswordInput,
  SelectInput,
  SimpleForm,
  TextInput,
  email,
  required,
  usePermissions,
} from 'react-admin';
import { Divider, Typography } from '@mui/material';
import { Action, BLOOD_TYPE_LABEL, BloodType, UserRole, hasPermission } from '@redinfo/shared';
import { accountRoleLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';

const bloodTypeChoices = Object.values(BloodType).map((type) => ({
  id: type,
  name: BLOOD_TYPE_LABEL[type],
}));

/**
 * One PATCH endpoint serves both an admin and a coordinator — the API enforces
 * which fields each may change (`MANAGE_USERS` for account fields,
 * `MANAGE_PERSONNEL` for everything else), and this form matches that by only
 * rendering the fields the viewer may submit. A field never rendered is never
 * part of the submission, so a coordinator's save never touches email, role
 * or password.
 */
export const UserEdit = () => {
  const t = useT();
  const { permissions } = usePermissions<UserRole>();
  const canManageAccount = Boolean(permissions && hasPermission(permissions, Action.MANAGE_USERS));
  const canManagePersonnel = Boolean(permissions && hasPermission(permissions, Action.MANAGE_PERSONNEL));
  const roleChoices = Object.values(UserRole).map((role) => ({
    id: role,
    name: accountRoleLabel(t, role),
  }));

  return (
    <Edit>
      <SimpleForm>
        <Typography variant="subtitle2">Account</Typography>
        <TextInput source="firstName" label="First Name" validate={required()} />
        <TextInput source="lastName" label="Last Name" validate={required()} />
        {canManageAccount ? (
          <>
            <TextInput source="email" validate={[required(), email()]} />
            <SelectInput source="role" choices={roleChoices} validate={required()} />
            <PasswordInput source="password" label="New Password (leave blank to keep)" />
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Email, role and password are administrator-only. Ask an admin to change them.
          </Typography>
        )}

        {canManagePersonnel && (
          <>
            <Divider sx={{ width: '100%', my: 2 }} />
            <Typography variant="subtitle2">Personnel</Typography>
            <BooleanInput source="isActive" label="Active" />
            <TextInput source="phone" label="Phone" />
            <TextInput source="birthDate" label="Date of birth" type="date" InputLabelProps={{ shrink: true }} />
            <TextInput source="joinedOn" label="Joined on" type="date" InputLabelProps={{ shrink: true }} />
            <TextInput source="addressLine" label="Address" />
            <TextInput source="postalCode" label="Postal code" />
            <TextInput source="redCrossNumber" label="Red Cross national no." />
            <TextInput
              source="volunteerNumber"
              label="Volunteer no."
              helperText="Optional, manually assigned."
            />
            <TextInput source="nif" label="NIF" />
            <TextInput source="citizenCardNumber" label="Citizen card" />
            <SelectInput source="bloodType" choices={bloodTypeChoices} label="Blood type" />
            <TextInput source="emergencyContactName" label="Emergency contact name" />
            <TextInput source="emergencyContactPhone" label="Emergency contact phone" />
          </>
        )}
      </SimpleForm>
    </Edit>
  );
};
