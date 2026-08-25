import {
  BooleanField,
  ChipField,
  Datagrid,
  FunctionField,
  List,
  SearchInput,
  SelectInput,
  TextField,
  TopToolbar,
  CreateButton,
  ExportButton,
  usePermissions,
} from 'react-admin';
import { Stack, Typography } from '@mui/material';
import {
  Action,
  CERTIFICATION_LABEL,
  CERTIFICATION_TYPES,
  ROLE_METADATA,
  User,
  UserRole,
  hasPermission,
} from '@redinfo/shared';
import { CertificationBadge } from '../../components/CertificationBadge';

const roleChoices = Object.values(UserRole).map((role) => ({
  id: role,
  name: ROLE_METADATA[role].displayName,
}));

const readinessChoices = [
  { id: 'OPERATIONAL', name: 'Operational' },
  { id: 'NOT_OPERATIONAL', name: 'Not operational' },
];

const certificationChoices = CERTIFICATION_TYPES.map((type) => ({
  id: type,
  name: CERTIFICATION_LABEL[type],
}));

const certificationStatusChoices = [
  { id: 'EXPIRING', name: 'Expiring within 6 months' },
  { id: 'EXPIRED', name: 'Expired' },
];

const activeChoices = [
  { id: 'true', name: 'Active' },
  { id: 'false', name: 'Inactive' },
];

const userFilters = [
  <SearchInput source="q" alwaysOn key="q" placeholder="Search name or number" />,
  <SelectInput source="role" key="role" choices={roleChoices} />,
  <SelectInput source="isActive" key="isActive" choices={activeChoices} label="Status" />,
  <SelectInput source="readiness" key="readiness" choices={readinessChoices} label="Readiness" />,
  <SelectInput
    source="certification"
    key="certification"
    choices={certificationChoices}
    label="Holds certification"
  />,
  <SelectInput
    source="certificationStatus"
    key="certificationStatus"
    choices={certificationStatusChoices}
    label="Certification status"
  />,
];

const ListActions = () => {
  const { permissions } = usePermissions<UserRole>();
  if (!permissions || !hasPermission(permissions, Action.MANAGE_USERS)) return <TopToolbar />;
  return (
    <TopToolbar>
      <CreateButton />
      <ExportButton />
    </TopToolbar>
  );
};

const ReadinessField = ({ record }: { record?: User }) => {
  if (!record) return null;
  return (
    <Typography
      variant="body2"
      sx={{ color: record.isActiveEmergencyOperational ? 'success.dark' : 'text.secondary', fontWeight: 600 }}
    >
      {record.isActiveEmergencyOperational ? 'Operational' : 'Not operational'}
    </Typography>
  );
};

const CertificationsField = ({ record }: { record?: User }) => {
  if (!record || !record.certifications || record.certifications.length === 0) {
    return (
      <Typography variant="caption" color="text.disabled">
        —
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ maxWidth: 260 }}>
      {record.certifications.map((cert) => (
        <CertificationBadge key={cert.id} type={cert.type} validUntil={cert.validUntil} />
      ))}
    </Stack>
  );
};

/**
 * The personnel registry: everyone at the delegation, searchable and
 * filterable by role, active status, and operational readiness — a derived
 * flag (valid TAT or TAS), not a column a coordinator sets directly.
 */
export const UserList = () => (
  <List filters={userFilters} actions={<ListActions />} perPage={25}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <FunctionField
        label="Name"
        render={(record: User) => (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {record.firstName} {record.lastName}
          </Typography>
        )}
      />
      <ChipField source="role" />
      <FunctionField label="Readiness" render={(record: User) => <ReadinessField record={record} />} />
      <FunctionField
        label="Certifications"
        render={(record: User) => <CertificationsField record={record} />}
      />
      <BooleanField source="isActive" label="Active" />
      <TextField source="redCrossNumber" label="CVP no." emptyText="—" />
      <TextField source="volunteerNumber" label="Vol. no." emptyText="—" />
    </Datagrid>
  </List>
);
