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
import { certificationLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
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
  const t = useT();
  const notify = useNotify();
  const refresh = useRefresh();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const documentPath = `/users/${userId}/certifications/${certification.id}/document`;

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await apiUpload(documentPath, file);
      notify(t('userShow.documentSaved'), { type: 'success' });
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : t('userShow.documentUploadFailed'), { type: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  const removeDocument = async () => {
    setBusy(true);
    try {
      await apiFetch(documentPath, { method: 'DELETE' });
      notify(t('userShow.documentRemoved'), { type: 'info' });
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : t('userShow.documentRemoveFailed'), { type: 'warning' });
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
            {certification.filename ?? t('field.verbeteOpen')}
          </Button>
          {canManage && (
            <>
              <Button size="small" disabled={busy} onClick={() => input.current?.click()}>
                {t('field.verbeteReplace')}
              </Button>
              <Button size="small" color="error" disabled={busy} onClick={() => void removeDocument()}>
                {t('userShow.removeDocument')}
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
            {t('userShow.attachDocument')}
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
  const t = useT();
  const record = useRecordContext<User>();
  const { permissions } = usePermissions<UserRole[]>();
  const notify = useNotify();
  const refresh = useRefresh();
  const canManage = Boolean(permissions && hasPermission(permissions, Action.MANAGE_PERSONNEL));

  if (!record) return null;
  const initials = `${record.firstName[0] ?? ''}${record.lastName[0] ?? ''}`.toUpperCase();
  const photoPath = `/users/${record.id}/photo`;

  const uploadPhoto = async (file: File) => {
    try {
      await apiUpload(photoPath, file);
      notify(t('profile.photoUpdated'), { type: 'success' });
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : t('profile.photoUpdateFailed'), { type: 'warning' });
    }
  };

  const removePhoto = async () => {
    try {
      await apiFetch(photoPath, { method: 'DELETE' });
      notify(t('profile.photoRemoved'), { type: 'info' });
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : t('profile.photoRemoveFailed'), { type: 'warning' });
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
          changeLabel={t('profile.changePhoto')}
          removeLabel={t('userShow.removePhotoButton')}
        />
      )}
    </Stack>
  );
};

const CertificationsPanel = () => {
  const t = useT();
  const record = useRecordContext<User>();
  const { permissions } = usePermissions<UserRole[]>();
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
    const confirmMessage =
      t('userShow.removeCertConfirmPrefix') +
      certificationLabel(t, certification.type) +
      t('userShow.removeCertConfirmSuffix');
    if (!window.confirm(confirmMessage)) return;
    try {
      await apiFetch(`/users/${record.id}/certifications/${certification.id}`, { method: 'DELETE' });
      notify(t('userShow.certificationRemoved'), { type: 'info' });
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : t('userShow.certificationRemoveFailed'), { type: 'warning' });
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6">{t('userShow.certificationsHeading')}</Typography>
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
            {t('certificationDialog.add')}
          </Button>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {t('userShow.certificationsHint')}
      </Typography>

      {held.length === 0 && grantedOnly.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('userShow.noCertifications')}
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
                  {certificationLabel(t, cert.type)}
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
                  {t('action.edit')}
                </Button>
                <Button
                  size="small"
                  color="error"
                  startIcon={<DeleteOutlineIcon fontSize="small" />}
                  onClick={() => void remove(cert)}
                >
                  {t('action.remove')}
                </Button>
              </>
            )}
          </Stack>
        ))}
      </Stack>

      {grantedOnly.length > 0 && (
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 2, pt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
            {t('userShow.alsoGrantedByAbove')}
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
          notify(t('userShow.certificationSaved'), { type: 'success' });
          refresh();
        }}
      />
    </Paper>
  );
};

const ReadinessChip = () => {
  const t = useT();
  const record = useRecordContext<User>();
  if (!record) return null;
  return (
    <Chip
      size="small"
      color={record.isActiveEmergencyOperational ? 'success' : 'default'}
      variant={record.isActiveEmergencyOperational ? 'filled' : 'outlined'}
      label={record.isActiveEmergencyOperational ? t('profile.operational') : t('profile.notOperational')}
    />
  );
};

/** A person's full record — profile, identity, and their certifications. */
export const UserShow = () => {
  const t = useT();
  return (
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
                {t('userShow.contactHeading')}
              </Typography>
              <FieldRow source="phone" />
              <FieldRow source="addressLine" />
              <FieldRow source="postalCode" />
            </Box>
            <Box sx={{ minWidth: 280, flex: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('profile.identification')}
              </Typography>
              <FieldRow source="redCrossNumber" />
              <FieldRow source="volunteerNumber" />
              <FieldRow source="nif" />
              <FieldRow source="citizenCardNumber" />
              <BloodTypeRow />
              <FieldRow source="joinedOn" />
            </Box>
            <Box sx={{ minWidth: 280, flex: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('userShow.personalHeading')}
              </Typography>
              <FieldRow source="birthDate" />
              <FieldRow source="emergencyContactName" />
              <FieldRow source="emergencyContactPhone" />
            </Box>
          </Stack>
        </Paper>

        <CertificationsPanel />

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('userShow.recordHeading')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {t('userShow.createdLabel')}
              </Typography>
              <DateField source="createdAt" showTime />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {t('userShow.updatedLabel')}
              </Typography>
              <DateField source="updatedAt" showTime />
            </Box>
          </Box>
        </Paper>
      </Box>
    </Show>
  );
};

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
  const t = useT();
  const record = useRecordContext<User>();
  if (!record) return null;
  return (
    <Chip
      size="small"
      color={record.isActive ? 'default' : 'error'}
      variant="outlined"
      label={record.isActive ? t('personnelList.active') : t('personnelList.inactive')}
    />
  );
};

const FieldRow = ({ source }: { source: keyof User }) => {
  const t = useT();
  const record = useRecordContext<RaRecord & User>();
  const value = record?.[source];
  return (
    <InfoRow
      label={t(`resources.users.fields.${source}`)}
      value={typeof value === 'string' ? value : null}
    />
  );
};

const BloodTypeRow = () => {
  const t = useT();
  const record = useRecordContext<User>();
  return (
    <InfoRow
      label={t('resources.users.fields.bloodType')}
      value={record?.bloodType ? BLOOD_TYPE_LABEL[record.bloodType] : null}
    />
  );
};
