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
import { BLOOD_TYPE_LABEL, BloodType, ROLE_METADATA, UserRole } from '@redinfo/shared';

const roleChoices = Object.values(UserRole).map((role) => ({
  id: role,
  name: ROLE_METADATA[role].displayName,
}));

const bloodTypeChoices = Object.values(BloodType).map((type) => ({
  id: type,
  name: BLOOD_TYPE_LABEL[type],
}));

/**
 * Account creation is administrator-only (`Action.MANAGE_USERS`) — the route
 * is gated the same way, so unlike `UserEdit` this form does not need to hide
 * fields by permission. Certifications are added afterwards, from the
 * person's own record: driving is a certification, not a flag set here.
 */
export const UserCreate = () => (
  <Create>
    <SimpleForm>
      <Typography variant="subtitle2">Account</Typography>
      <TextInput source="firstName" label="First Name" validate={required()} />
      <TextInput source="lastName" label="Last Name" validate={required()} />
      <TextInput source="email" validate={[required(), email()]} />
      <PasswordInput source="password" validate={[required(), minLength(8)]} />
      <SelectInput
        source="role"
        choices={roleChoices}
        defaultValue="EMERGENCY_OPERATIONAL"
        validate={required()}
      />

      <Divider sx={{ width: '100%', my: 2 }} />
      <Typography variant="subtitle2">Personnel (optional — can be filled in later)</Typography>
      <TextInput source="phone" label="Phone" />
      <TextInput source="birthDate" label="Date of birth" type="date" InputLabelProps={{ shrink: true }} />
      <TextInput source="joinedOn" label="Joined on" type="date" InputLabelProps={{ shrink: true }} />
      <TextInput source="addressLine" label="Address" />
      <TextInput source="postalCode" label="Postal code" />
      <TextInput source="redCrossNumber" label="Red Cross national no." />
      <TextInput source="volunteerNumber" label="Volunteer no." helperText="Optional, manually assigned." />
      <TextInput source="nif" label="NIF" />
      <TextInput source="citizenCardNumber" label="Citizen card" />
      <SelectInput source="bloodType" choices={bloodTypeChoices} label="Blood type" />
      <TextInput source="emergencyContactName" label="Emergency contact name" />
      <TextInput source="emergencyContactPhone" label="Emergency contact phone" />
    </SimpleForm>
  </Create>
);
