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
  useListContext,
  usePermissions,
} from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Box, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { Action, CERTIFICATION_TYPES, User, UserRole, hasPermission } from '@redinfo/shared';
import { CertificationBadge } from '../../components/CertificationBadge';
import { useIsMobile } from '../../hooks/useIsMobile';
import { accountRoleLabel, certificationLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { PersonCard } from './PersonCard';

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
 * Active/all toggle, chip-style like `WindowFilterBar` in the availability
 * screens — replaces the `isActive` dropdown filter so "show everyone" is
 * one tap away instead of buried in "Add filter". `<List>` defaults to
 * active-only via `filterDefaultValues`; someone who left keeps their
 * record, just out of sight until asked for.
 */
const ActiveFilterBar = () => {
  const t = useT();
  const { filterValues, setFilters, displayedFilters } = useListContext();
  const showingAll = filterValues.isActive === undefined;

  const showActiveOnly = () => setFilters({ ...filterValues, isActive: 'true' }, displayedFilters);
  const showAll = () => {
    const { isActive: _dropped, ...rest } = filterValues;
    setFilters(rest, displayedFilters);
  };

  return (
    <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
      <Chip
        label={t('personnelList.active')}
        color={showingAll ? 'default' : 'primary'}
        variant={showingAll ? 'outlined' : 'filled'}
        onClick={showActiveOnly}
        sx={{ fontWeight: 600, cursor: 'pointer' }}
      />
      <Chip
        label={t('personnelList.showAll')}
        color={showingAll ? 'primary' : 'default'}
        variant={showingAll ? 'filled' : 'outlined'}
        onClick={showAll}
        sx={{ fontWeight: 600, cursor: 'pointer' }}
      />
    </Stack>
  );
};

/** Stacked cards instead of a table — the mobile replacement for `Datagrid`. */
const MobileUserList = () => {
  const { data, isLoading } = useListContext<User>();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Stack spacing={1.5}>
      {(data ?? []).map((person) => (
        <PersonCard key={person.id} person={person} onOpen={() => navigate(`/users/${person.id}/show`)} />
      ))}
    </Stack>
  );
};

/**
 * The personnel registry: everyone at the delegation, searchable and
 * filterable by role, active status, and operational readiness — a derived
 * flag (valid TAT or TAS), not a column a coordinator sets directly. Active
 * members only by default (`ActiveFilterBar`); a stacked-card layout replaces
 * the table below the `sm` breakpoint so the roster is usable from a phone.
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
  const userFilters = [
    <SearchInput
      source="q"
      alwaysOn
      key="q"
      placeholder={t('personnelList.searchPlaceholder')}
    />,
    <SelectInput source="role" key="role" choices={roleChoices} />,
    <SelectInput source="readiness" key="readiness" choices={readinessChoices} />,
    <SelectInput source="certification" key="certification" choices={certificationChoices} />,
    <SelectInput
      source="certificationStatus"
      key="certificationStatus"
      choices={certificationStatusChoices}
    />,
  ];
  const isMobile = useIsMobile();

  return (
    <List
      filters={userFilters}
      actions={<ListActions />}
      perPage={25}
      filterDefaultValues={{ isActive: 'true' }}
    >
      <ActiveFilterBar />
      {isMobile ? (
        <MobileUserList />
      ) : (
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
      )}
    </List>
  );
};
