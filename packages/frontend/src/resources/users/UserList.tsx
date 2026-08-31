import {
  BooleanField,
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
import { Chip, Stack, Typography } from '@mui/material';
import { Action, CERTIFICATION_TYPES, User, UserRole, hasPermission } from '@redinfo/shared';
import { CertificationBadge } from '../../components/CertificationBadge';
import { accountRoleLabel, certificationLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';

const ListActions = () => {
  const { permissions } = usePermissions<UserRole[]>();
  if (!permissions || !hasPermission(permissions, Action.MANAGE_USERS)) return <TopToolbar />;
  return (
    <TopToolbar>
      <CreateButton />
      <ExportButton />
    </TopToolbar>
  );
};

const ReadinessField = ({ record }: { record?: User }) => {
  const t = useT();
  if (!record) return null;
  return (
    <Typography
      variant="body2"
      sx={{ color: record.isActiveEmergencyOperational ? 'success.dark' : 'text.secondary', fontWeight: 600 }}
    >
      {record.isActiveEmergencyOperational ? t('profile.operational') : t('profile.notOperational')}
    </Typography>
  );
};

/** Every role this person holds (#multi-role) — one chip each, unordered. */
const RolesField = ({ record }: { record?: User }) => {
  const t = useT();
  if (!record || !record.roles || record.roles.length === 0) return null;
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
      {record.roles.map((role) => (
        <Chip key={role} size="small" label={accountRoleLabel(t, role)} />
      ))}
    </Stack>
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
export const UserList = () => {
  const t = useT();
  const roleChoices = Object.values(UserRole).map((role) => ({
    id: role,
    name: accountRoleLabel(t, role),
  }));
  const readinessChoices = [
    { id: 'OPERATIONAL', name: t('profile.operational') },
    { id: 'NOT_OPERATIONAL', name: t('profile.notOperational') },
  ];
  const certificationChoices = CERTIFICATION_TYPES.map((type) => ({
    id: type,
    name: certificationLabel(t, type),
  }));
  const certificationStatusChoices = [
    { id: 'EXPIRING', name: t('personnelList.certStatusExpiring') },
    { id: 'EXPIRED', name: t('personnelList.certStatusExpired') },
  ];
  const activeChoices = [
    { id: 'true', name: t('personnelList.active') },
    { id: 'false', name: t('personnelList.inactive') },
  ];
  const userFilters = [
    <SearchInput
      source="q"
      alwaysOn
      key="q"
      placeholder={t('personnelList.searchPlaceholder')}
    />,
    <SelectInput source="role" key="role" choices={roleChoices} />,
    <SelectInput source="isActive" key="isActive" choices={activeChoices} />,
    <SelectInput source="readiness" key="readiness" choices={readinessChoices} />,
    <SelectInput source="certification" key="certification" choices={certificationChoices} />,
    <SelectInput
      source="certificationStatus"
      key="certificationStatus"
      choices={certificationStatusChoices}
    />,
  ];

  return (
    <List filters={userFilters} actions={<ListActions />} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <FunctionField
          label={t('personnelList.nameColumn')}
          render={(record: User) => (
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {record.firstName} {record.lastName}
            </Typography>
          )}
        />
        <FunctionField label={t('personnelList.roleColumn')} render={(record: User) => <RolesField record={record} />} />
        <FunctionField source="readiness" render={(record: User) => <ReadinessField record={record} />} />
        <FunctionField
          source="certifications"
          render={(record: User) => <CertificationsField record={record} />}
        />
        <BooleanField source="isActive" />
        <TextField source="redCrossNumber" emptyText="—" />
        <TextField source="volunteerNumber" emptyText="—" />
      </Datagrid>
    </List>
  );
};
