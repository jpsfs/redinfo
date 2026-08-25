import { useRef, useState } from 'react';
import {
  DateField,
  EmailField,
  RaRecord,
  Show,
  useNotify,
  usePermissions,
  useRecordContext,
  useRefresh,
} from 'react-admin';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import {
  Action,
  BLOOD_TYPE_LABEL,
  CERTIFICATION_LABEL,
  CERTIFICATION_TYPES,
  effectiveCertifications,
  hasPermission,
  User,
  UserCertification,
  UserRole,
} from '@redinfo/shared';
import { apiDownload, apiFetch, apiUpload } from '../../api';
import { CertificationBadge } from '../../components/CertificationBadge';
import { PersonAvatar } from '../../components/PersonAvatar';
import { PhotoUploadControl } from '../../components/PhotoUploadControl';
import { toIsoDate } from '../../utils/dates';
import { CertificationDialog } from './CertificationDialog';

const InfoRow = ({ label, value }: { label: string; value?: string | null }) => (
  <Box sx={{ display: 'flex', gap: 2, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
    <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 500 }}>
      {value || '—'}
    </Typography>
  </Box>
);

/**
 * Attach, replace, download or remove the scanned certificate for one held
 * certification. `CertificationDialog` deliberately ships without a file
 * picker — see its doc comment — so this lives on the certification's own row
 * instead, gated the same way editing the record is: `MANAGE_PERSONNEL`.
 * Downloading, though, follows the backend's own read rule (self, or
 * `VIEW_USERS`/`MANAGE_PERSONNEL`) rather than `canManage` — anyone who can
 * see this page at all may open an attached document.
 */
const CertificationDocumentRow = ({
  userId,
  certification,
  canManage,
}: {
  userId: string;
  certification: UserCertification;
  canManage: boolean;
}) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const documentPath = `/users/${userId}/certifications/${certification.id}/document`;

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await apiUpload(documentPath, file);
      notify('Document saved', { type: 'success' });
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not upload the document.', { type: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  const removeDocument = async () => {
    setBusy(true);
    try {
      await apiFetch(documentPath, { method: 'DELETE' });
      notify('Document removed', { type: 'info' });
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not remove the document.', { type: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  if (!certification.hasDocument && !canManage) return null;

  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
      {certification.hasDocument ? (
        <>
          <Button
            size="small"
            startIcon={<DownloadIcon fontSize="small" />}
            onClick={() => void apiDownload(documentPath, certification.filename ?? 'certificado')}
          >
            {certification.filename ?? 'Open'}
          </Button>
          {canManage && (
            <>
              <Button size="small" disabled={busy} onClick={() => input.current?.click()}>
                Replace
              </Button>
              <Button size="small" color="error" disabled={busy} onClick={() => void removeDocument()}>
                Remove document
              </Button>
            </>
          )}
        </>
      ) : (
        canManage && (
          <Button
            size="small"
            startIcon={<UploadFileIcon fontSize="small" />}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            Attach document
          </Button>
        )
      )}
      {canManage && (
        <input
          ref={input}
          type="file"
          hidden
          data-testid={`certification-document-input-${certification.id}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void upload(file);
          }}
        />
      )}
    </Stack>
  );
};

/** A coordinator's control over the person's photo — self-service lives on `MyProfilePage` instead. */
const PhotoPanel = () => {
  const record = useRecordContext<User>();
  const { permissions } = usePermissions<UserRole>();
  const notify = useNotify();
  const refresh = useRefresh();
  const canManage = Boolean(permissions && hasPermission(permissions, Action.MANAGE_PERSONNEL));

  if (!record) return null;
  const initials = `${record.firstName[0] ?? ''}${record.lastName[0] ?? ''}`.toUpperCase();
  const photoPath = `/users/${record.id}/photo`;

  const uploadPhoto = async (file: File) => {
    try {
      await apiUpload(photoPath, file);
      notify('Photo updated', { type: 'success' });
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not upload the photo.', { type: 'warning' });
    }
  };

  const removePhoto = async () => {
    try {
      await apiFetch(photoPath, { method: 'DELETE' });
      notify('Photo removed', { type: 'info' });
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not remove the photo.', { type: 'warning' });
    }
  };

  return (
    <Stack alignItems="center" spacing={1}>
      <PersonAvatar userId={record.id} hasPhoto={Boolean(record.hasPhoto)} initials={initials} size={64} />
      {canManage && (
        <PhotoUploadControl
          hasPhoto={Boolean(record.hasPhoto)}
          onUpload={uploadPhoto}
          onRemove={removePhoto}
          changeLabel="Change photo"
          removeLabel="Remove photo"
        />
      )}
    </Stack>
  );
};

const CertificationsPanel = () => {
  const record = useRecordContext<User>();
  const { permissions } = usePermissions<UserRole>();
  const notify = useNotify();
  const refresh = useRefresh();
  const canManage = Boolean(permissions && hasPermission(permissions, Action.MANAGE_PERSONNEL));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserCertification | null>(null);

  if (!record) return null;
  const held = record.certifications ?? [];
  const today = toIsoDate(new Date());
  const effective = effectiveCertifications(held, today);
  const grantedOnly = effective.filter(
    (entry) => entry.grantedBy !== entry.type && !held.some((h) => h.type === entry.type),
  );
  const heldTypes = new Set(held.map((cert) => cert.type));
  const availableTypes = CERTIFICATION_TYPES.filter((type) => !heldTypes.has(type));

  const remove = async (certification: UserCertification) => {
    if (!window.confirm(`Remove the ${CERTIFICATION_LABEL[certification.type]} certification?`)) return;
    try {
      await apiFetch(`/users/${record.id}/certifications/${certification.id}`, { method: 'DELETE' });
      notify('Certification removed', { type: 'info' });
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not remove that certification.', { type: 'warning' });
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6">Certifications</Typography>
        {canManage && (
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            disabled={availableTypes.length === 0}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Add certification
          </Button>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        Only certifications actually awarded are recorded here. TAS grants TAT and SBV, and TAT
        grants SBV — those are shown below as granted, not stored.
      </Typography>

      {held.length === 0 && grantedOnly.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No certifications on file.
        </Typography>
      )}

      <Stack spacing={1}>
        {held.map((cert) => (
          <Stack
            key={cert.id}
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {CERTIFICATION_LABEL[cert.type]}
                </Typography>
                <CertificationBadge type={cert.type} validUntil={cert.validUntil} today={today} />
              </Stack>
              {cert.notes && (
                <Typography variant="caption" color="text.secondary">
                  {cert.notes}
                </Typography>
              )}
              <CertificationDocumentRow userId={record.id} certification={cert} canManage={canManage} />
            </Box>
            {canManage && (
              <>
                <Button
                  size="small"
                  startIcon={<EditOutlinedIcon fontSize="small" />}
                  onClick={() => {
                    setEditing(cert);
                    setDialogOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  color="error"
                  startIcon={<DeleteOutlineIcon fontSize="small" />}
                  onClick={() => void remove(cert)}
                >
                  Remove
                </Button>
              </>
            )}
          </Stack>
        ))}
      </Stack>

      {grantedOnly.length > 0 && (
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 2, pt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
            Also granted by the above
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {grantedOnly.map((entry) => (
              <CertificationBadge
                key={entry.type}
                type={entry.type}
                validUntil={entry.validUntil}
                grantedBy={entry.grantedBy}
                today={today}
              />
            ))}
          </Stack>
        </Box>
      )}

      <CertificationDialog
        open={dialogOpen}
        userId={record.id}
        certification={editing}
        availableTypes={availableTypes}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          notify('Certification saved', { type: 'success' });
          refresh();
        }}
      />
    </Paper>
  );
};

const ReadinessChip = () => {
  const record = useRecordContext<User>();
  if (!record) return null;
  return (
    <Chip
      size="small"
      color={record.isActiveEmergencyOperational ? 'success' : 'default'}
      variant={record.isActiveEmergencyOperational ? 'filled' : 'outlined'}
      label={record.isActiveEmergencyOperational ? 'Operational' : 'Not operational'}
    />
  );
};

/** A person's full record — profile, identity, and their certifications. */
export const UserShow = () => (
  <Show>
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <PhotoPanel />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              <ShowRecordName />
              <ReadinessChip />
              <ActiveChip />
            </Stack>
            <EmailField source="email" />
          </Box>
        </Stack>

        <Stack direction="row" spacing={4} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
          <Box sx={{ minWidth: 280, flex: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Contact
            </Typography>
            <FieldRow source="phone" label="Phone" />
            <FieldRow source="addressLine" label="Address" />
            <FieldRow source="postalCode" label="Postal code" />
          </Box>
          <Box sx={{ minWidth: 280, flex: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Identification
            </Typography>
            <FieldRow source="redCrossNumber" label="Red Cross national no." />
            <FieldRow source="volunteerNumber" label="Volunteer no." />
            <FieldRow source="nif" label="NIF" />
            <FieldRow source="citizenCardNumber" label="Citizen card" />
            <BloodTypeRow />
            <FieldRow source="joinedOn" label="Joined on" />
          </Box>
          <Box sx={{ minWidth: 280, flex: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Personal
            </Typography>
            <FieldRow source="birthDate" label="Date of birth" />
            <FieldRow source="emergencyContactName" label="Emergency contact" />
            <FieldRow source="emergencyContactPhone" label="Emergency contact phone" />
          </Box>
        </Stack>
      </Paper>

      <CertificationsPanel />

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Record
        </Typography>
        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Created
            </Typography>
            <DateField source="createdAt" showTime />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Updated
            </Typography>
            <DateField source="updatedAt" showTime />
          </Box>
        </Box>
      </Paper>
    </Box>
  </Show>
);

const ShowRecordName = () => {
  const record = useRecordContext<User>();
  if (!record) return null;
  return (
    <Typography variant="h5" sx={{ fontWeight: 700 }}>
      {record.firstName} {record.lastName}
    </Typography>
  );
};

const ActiveChip = () => {
  const record = useRecordContext<User>();
  if (!record) return null;
  return (
    <Chip
      size="small"
      color={record.isActive ? 'default' : 'error'}
      variant="outlined"
      label={record.isActive ? 'Active' : 'Inactive'}
    />
  );
};

const FieldRow = ({ source, label }: { source: keyof User; label: string }) => {
  const record = useRecordContext<RaRecord & User>();
  const value = record?.[source];
  return <InfoRow label={label} value={typeof value === 'string' ? value : null} />;
};

const BloodTypeRow = () => {
  const record = useRecordContext<User>();
  return (
    <InfoRow
      label="Blood type"
      value={record?.bloodType ? BLOOD_TYPE_LABEL[record.bloodType] : null}
    />
  );
};
