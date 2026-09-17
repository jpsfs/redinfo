import {
  BooleanInput,
  Edit,
  FormDataConsumer,
  PasswordInput,
  SelectArrayInput,
  SelectInput,
  SimpleForm,
  TextInput,
  email,
  required,
  usePermissions,
} from 'react-admin';
import { Divider, Typography } from '@mui/material';
import { Action, AuthProvider, BLOOD_TYPE_LABEL, BloodType, UserRole, hasPermission } from '@redinfo/shared';
import { accountRoleLabel, authProviderLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';

/**
 * One PATCH endpoint serves both an admin and a coordinator — the API enforces
 * which fields each may change (`MANAGE_USERS` for account fields,
 * `MANAGE_PERSONNEL` for everything else), and this form matches that by only
 * rendering the fields the viewer may submit. This does *not* by itself keep
 * a coordinator's save from touching email/roles/password, though — the
 * fields are hidden, but react-admin still submits every field the loaded
 * record carries (see `dataProvider.update`'s doc comment); it's the diff
 * against `previousData` there, plus `UsersService.update` comparing against
 * the stored row, that actually enforces it.
 */
export const UserEdit = () => {
  const t = useT();
  const { permissions } = usePermissions<UserRole[]>();
  const canManageAccount = Boolean(permissions && hasPermission(permissions, Action.MANAGE_USERS));
  const canManagePersonnel = Boolean(permissions && hasPermission(permissions, Action.MANAGE_PERSONNEL));
  const roleChoices = Object.values(UserRole).map((role) => ({
    id: role,
    name: accountRoleLabel(t, role),
  }));
  const providerChoices = Object.values(AuthProvider).map((provider) => ({
    id: provider,
    name: authProviderLabel(t, provider),
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
            <SelectArrayInput source="roles" choices={roleChoices} validate={required()} />
            <SelectInput
              source="provider"
              choices={providerChoices}
              helperText={t('userForm.providerHint')}
              validate={required()}
            />
            {/* A GOOGLE/MICROSOFT account keeps no password — see `UsersService.update`. */}
            <FormDataConsumer>
              {({ formData }) =>
                (formData.provider ?? AuthProvider.LOCAL) === AuthProvider.LOCAL && (
                  <PasswordInput source="password" helperText={t('userForm.newPasswordHint')} />
                )
              }
            </FormDataConsumer>
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
            <TextInput source="fullName" helperText={t('userForm.fullNameHint')} />
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
