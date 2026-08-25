import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  CERTIFICATION_LABEL,
  CERTIFICATION_TYPES,
  CertificationType,
  formatRoleCapacity,
  MAX_ROLE_NAME_LENGTH,
  MAX_ROLE_PEOPLE,
  MAX_ROLES_PER_WINDOW,
  roleRequiresDriverCertification,
  UNLIMITED_ROLE_PEOPLE,
  validateWindowRoles,
  WindowRoleSpec,
} from '@redinfo/shared';

/** The select's own value space: unset (suggestion), explicitly none, or a type. */
const NONE = 'NONE' as const;
type CertSelectValue = '' | typeof NONE | CertificationType;

function toSelectValue(requiredCertification: CertificationType | null | undefined): CertSelectValue {
  if (requiredCertification === undefined) return '';
  if (requiredCertification === null) return NONE;
  return requiredCertification;
}

function fromSelectValue(value: string): CertificationType | null | undefined {
  if (value === '') return undefined;
  if (value === NONE) return null;
  return value as CertificationType;
}

/**
 * The roles a window's schedule will be built from.
 *
 * Deliberately absent from the availability screens: a volunteer says when they
 * can be there and nothing else — the coordinator assigns roles later, when
 * building the schedule — so this editor only ever appears when a window is
 * being defined.
 */
export const WindowRoleEditor = ({
  roles,
  onChange,
  disabled = false,
}: {
  roles: WindowRoleSpec[];
  onChange: (roles: WindowRoleSpec[]) => void;
  disabled?: boolean;
}) => {
  const error = validateWindowRoles(roles);

  const updateRole = (index: number, changes: Partial<WindowRoleSpec>) => {
    onChange(
      roles.map((role, position) =>
        position === index ? { ...role, ...changes } : role,
      ),
    );
  };

  return (
    <Box>
      {roles.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          No roles — people will be scheduled onto this window without one.
        </Typography>
      ) : (
        <Stack spacing={1} sx={{ mb: 1 }}>
          {roles.map((role, index) => {
            const suggested = roleRequiresDriverCertification(role.name)
              ? CertificationType.DRIVER
              : null;
            return (
              <Paper
                // Index-keyed on purpose: a row's identity here is its position,
                // and the name is the very thing being edited.
                key={index}
                variant="outlined"
                sx={{ p: 1 }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="flex-start"
                  flexWrap="wrap"
                  useFlexGap
                >
                  <TextField
                    size="small"
                    label={`Role ${index + 1}`}
                    value={role.name}
                    disabled={disabled}
                    onChange={(event) => updateRole(index, { name: event.target.value })}
                    inputProps={{
                      'aria-label': `Role ${index + 1} name`,
                      maxLength: MAX_ROLE_NAME_LENGTH,
                    }}
                    sx={{ flex: 1, minWidth: 180 }}
                  />
                  <TextField
                    type="number"
                    size="small"
                    label="People"
                    value={role.maxPeople}
                    disabled={disabled}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      if (!Number.isFinite(parsed)) return;
                      updateRole(index, {
                        maxPeople: Math.max(
                          0,
                          Math.min(MAX_ROLE_PEOPLE, Math.trunc(parsed)),
                        ),
                      });
                    }}
                    inputProps={{
                      'aria-label': `Role ${index + 1} people`,
                      min: 0,
                      max: MAX_ROLE_PEOPLE,
                      step: 1,
                    }}
                    helperText={formatRoleCapacity(role.maxPeople)}
                    sx={{ width: 110 }}
                  />
                  <TextField
                    select
                    size="small"
                    label="Requires"
                    value={toSelectValue(role.requiredCertification)}
                    disabled={disabled}
                    onChange={(event) =>
                      updateRole(index, { requiredCertification: fromSelectValue(event.target.value) })
                    }
                    inputProps={{ 'aria-label': `Role ${index + 1} required certification` }}
                    helperText={
                      role.requiredCertification === undefined
                        ? suggested
                          ? `Suggested from the name: ${CERTIFICATION_LABEL[suggested]}`
                          : 'No suggestion'
                        : "Coordinator's choice"
                    }
                    sx={{ width: 200 }}
                  >
                    <MenuItem value="">
                      <em>{suggested ? `Suggested: ${CERTIFICATION_LABEL[suggested]}` : 'Unset'}</em>
                    </MenuItem>
                    <MenuItem value={NONE}>No requirement</MenuItem>
                    {CERTIFICATION_TYPES.map((type) => (
                      <MenuItem key={type} value={type}>
                        {CERTIFICATION_LABEL[type]}
                      </MenuItem>
                    ))}
                  </TextField>
                  <IconButton
                    size="small"
                    disabled={disabled}
                    aria-label={`Remove role ${index + 1}`}
                    onClick={() =>
                      onChange(roles.filter((_, position) => position !== index))
                    }
                    sx={{ mt: 0.5 }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button
          size="small"
          startIcon={<AddIcon />}
          disabled={disabled || roles.length >= MAX_ROLES_PER_WINDOW}
          onClick={() =>
            onChange([...roles, { name: '', maxPeople: 1, requiredCertification: undefined }])
          }
        >
          Add role
        </Button>
        <Typography variant="caption" color="text.secondary">
          {`People is the most the schedule may put in a role on one shift; ` +
            `${UNLIMITED_ROLE_PEOPLE} means unlimited. A required certification is ` +
            `enforceable but not absolute — a coordinator may still assign someone ` +
            `who lacks it, with a reason.`}
        </Typography>
      </Stack>

      {error && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
};
