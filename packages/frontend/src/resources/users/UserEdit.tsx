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
  const bloodTypeChoices = Object.values(BloodType).map((type) => ({
    id: type,
    name: BLOOD_TYPE_LABEL[type],
  }));

  return (
    <Edit>
      <SimpleForm>
        <Typography variant="subtitle2">{t('userForm.accountSection')}</Typography>
        <TextInput source="firstName" validate={required()} />
        <TextInput source="lastName" validate={required()} />
        {canManageAccount ? (
          <>
            <TextInput source="email" validate={[required(), email()]} />
            <SelectInput source="role" choices={roleChoices} validate={required()} />
            <PasswordInput source="password" helperText={t('userForm.newPasswordHint')} />
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {t('userForm.adminOnlyFields')}
          </Typography>
        )}

        {canManagePersonnel && (
          <>
            <Divider sx={{ width: '100%', my: 2 }} />
            <Typography variant="subtitle2">{t('userForm.personnelSection')}</Typography>
            <BooleanInput source="isActive" />
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
          </>
        )}
      </SimpleForm>
    </Edit>
  );
};
