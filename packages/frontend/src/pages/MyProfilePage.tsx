import { useCallback, useEffect, useState } from 'react';
import { Title, useLocaleState, useNotify } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { effectiveCertifications, Locale, User } from '@redinfo/shared';
import { apiFetch, apiUpload } from '../api';
import { NotificationSettingsCard } from '../components/NotificationSettingsCard';
import { PersonAvatar } from '../components/PersonAvatar';
import { PhotoUploadControl } from '../components/PhotoUploadControl';
import { certificationLabel, bloodTypeLabel } from '../i18n/labels';
import { AVAILABLE_LOCALES } from '../i18n/i18nProvider';
import { useT } from '../i18n/useT';
import { toIsoDate } from '../utils/dates';

/** Whole days between two ISO dates — local mirror of the shared server-side helper. */
function daysBetween(from: string, to: string): number {
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((toMs - fromMs) / 86_400_000);
}

const StatusPill = ({ label, ok }: { label: string; ok: boolean }) => (
  <Chip
    size="small"
    color={ok ? 'success' : 'default'}
    variant={ok ? 'filled' : 'outlined'}
    label={label}
  />
);

const ReadOnlyRow = ({ label, value }: { label: string; value?: string | null }) => {
  const t = useT();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, minHeight: 44 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {value || `— (${t('profile.notSet')})`}
        </Typography>
      </Box>
    </Box>
  );
};

/**
 * The switcher, its own card, outside the Edit/Save block — #180's decision:
 * changing language must not require entering edit mode. PATCHes first,
 * *then* switches: `setLocale` remounts the whole tree (react-admin's
 * `I18nContextProvider` re-keys on locale change), which would destroy this
 * component before a `.then(notify)` chained off the switch ever fired. A
 * failed PATCH still switches, for this session, with a warning.
 */
const LanguageCard = () => {
  const t = useT();
  const notify = useNotify();
  const [locale, setLocale] = useLocaleState();

  const choose = async (next: Locale) => {
    if (next === locale) return;
    try {
      await apiFetch<User>('/users/me/profile', { method: 'PATCH', body: { locale: next } });
    } catch {
      notify(t('profile.languageSaveFailed'), { type: 'warning' });
    }
    setLocale(next);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {t('profile.language')}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {t('profile.languageHint')}
      </Typography>
      <Stack direction="row" spacing={1}>
        {AVAILABLE_LOCALES.map((option) => (
          <Button
            key={option.locale}
            variant={locale === option.locale ? 'contained' : 'outlined'}
            size="small"
            onClick={() => void choose(option.locale)}
          >
            {option.name}
          </Button>
        ))}
      </Stack>
    </Paper>
  );
};

interface ProfileFormState {
  phone: string;
  birthDate: string;
  addressLine: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

const toFormState = (profile: User): ProfileFormState => ({
  phone: profile.phone ?? '',
  birthDate: profile.birthDate ?? '',
  addressLine: profile.addressLine ?? '',
  postalCode: profile.postalCode ?? '',
  emergencyContactName: profile.emergencyContactName ?? '',
  emergencyContactPhone: profile.emergencyContactPhone ?? '',
});

/**
 * A volunteer's own record: their certifications (read-only — a coordinator
 * maintains those) and the contact details they keep current themselves.
 * Portuguese throughout, per the app's rule for crew-facing screens.
 */
export const MyProfilePage = () => {
  const t = useT();
  const notify = useNotify();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<User>('/users/me/profile');
      setProfile(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadPhoto = async (file: File) => {
    try {
      const updated = await apiUpload<User>('/users/me/photo', file);
      setProfile(updated);
      notify(t('profile.photoUpdated'), { type: 'success' });
    } catch (e) {
      notify(e instanceof Error ? e.message : t('profile.photoUpdateFailed'), { type: 'warning' });
    }
  };

  const removePhoto = async () => {
    try {
      const updated = await apiFetch<User>('/users/me/photo', { method: 'DELETE' });
      setProfile(updated);
      notify(t('profile.photoRemoved'), { type: 'info' });
    } catch (e) {
      notify(e instanceof Error ? e.message : t('profile.photoRemoveFailed'), { type: 'warning' });
    }
  };

  const startEditing = () => {
    if (!profile) return;
    setForm(toFormState(profile));
    setEditing(true);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await apiFetch<User>('/users/me/profile', {
        method: 'PATCH',
        body: form,
      });
      setProfile(updated);
      setEditing(false);
      notify(t('profile.saved'), { type: 'success' });
    } catch (e) {
      notify(e instanceof Error ? e.message : t('profile.saveFailed'), { type: 'warning' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={24} />
      </Container>
    );
  }

  if (error || !profile) {
    return (
      <Container maxWidth="sm" sx={{ py: 2 }}>
        <Title title={t('profile.title')} />
        <Alert severity="warning">{error ?? 'Could not load your profile.'}</Alert>
      </Container>
    );
  }

  const today = toIsoDate(new Date());
  const held = profile.certifications ?? [];
  const effective = effectiveCertifications(held, today);
  const initials = `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase();

  const expiringSoon = effective.find((cert) => cert.status === 'EXPIRING');
  const expiredAlready = effective.find((cert) => cert.status === 'EXPIRED');

  return (
    <Container maxWidth="sm" sx={{ py: 2, pb: 6 }}>
      <Title title={t('profile.title')} />

      <LanguageCard />

      <NotificationSettingsCard />

      <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <PersonAvatar userId={profile.id} hasPhoto={Boolean(profile.hasPhoto)} initials={initials} />
        <PhotoUploadControl
          hasPhoto={Boolean(profile.hasPhoto)}
          onUpload={uploadPhoto}
          onRemove={removePhoto}
          changeLabel={t('profile.changePhoto')}
          removeLabel={t('profile.removePhoto')}
        />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {profile.firstName} {profile.lastName}
        </Typography>
        <StatusPill
          label={profile.isActiveEmergencyOperational ? t('profile.operational') : t('profile.notOperational')}
          ok={profile.isActiveEmergencyOperational}
        />
        <Typography variant="caption" color="text.disabled">
          {[profile.redCrossNumber, profile.volunteerNumber && `Vol. ${profile.volunteerNumber}`]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
      </Paper>

      {(expiredAlready || expiringSoon) && (
        <Alert severity={expiredAlready ? 'error' : 'warning'} sx={{ mb: 2 }}>
          {expiredAlready
            ? `${certificationLabel(t, expiredAlready.type)} — ${t('profile.lapsedKeepsAccess')}`
            : expiringSoon &&
              expiringSoon.validUntil &&
              `${certificationLabel(t, expiringSoon.type)} ${t('profile.expiresIn')} ${daysBetween(
                today,
                expiringSoon.validUntil,
              )} ${t('profile.days')}`}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          {t('profile.myCertifications')}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {t('profile.certificationsHint')}
        </Typography>

        {effective.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('profile.noCertifications')}
          </Typography>
        )}

        <Stack spacing={1}>
          {effective.map((cert) => (
            <Box
              key={cert.type}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.25 }}
            >
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {certificationLabel(t, cert.type)}
                </Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  color={cert.status === 'VALID' ? 'success' : cert.status === 'EXPIRING' ? 'warning' : 'error'}
                  label={cert.validUntil ? cert.validUntil : t('profile.noExpiryOnFile')}
                />
              </Stack>
              {cert.grantedBy !== cert.type && (
                <Typography variant="caption" color="text.disabled">
                  {t('profile.grantedBy')} {certificationLabel(t, cert.grantedBy)}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h6">{t('profile.personalData')}</Typography>
          {!editing && (
            <Button size="small" onClick={startEditing}>
              {t('profile.edit')}
            </Button>
          )}
        </Stack>

        {editing && form ? (
          <Stack spacing={2}>
            <TextField
              label={t('profile.phone')}
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              fullWidth
            />
            <TextField
              label={t('profile.address')}
              value={form.addressLine}
              onChange={(event) => setForm({ ...form, addressLine: event.target.value })}
              fullWidth
            />
            <TextField
              label={t('profile.postalCode')}
              value={form.postalCode}
              onChange={(event) => setForm({ ...form, postalCode: event.target.value })}
              fullWidth
            />
            <TextField
              label={t('profile.birthDate')}
              type="date"
              value={form.birthDate}
              onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label={t('profile.emergencyContact')}
              value={form.emergencyContactName}
              onChange={(event) => setForm({ ...form, emergencyContactName: event.target.value })}
              fullWidth
            />
            <TextField
              label={t('profile.emergencyContactPhone')}
              value={form.emergencyContactPhone}
              onChange={(event) => setForm({ ...form, emergencyContactPhone: event.target.value })}
              fullWidth
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(false)} disabled={saving}>
                {t('profile.cancel')}
              </Button>
              <Button variant="contained" onClick={() => void save()} disabled={saving}>
                {t('profile.save')}
              </Button>
            </Stack>
          </Stack>
        ) : (
          <>
            <ReadOnlyRow label={t('profile.phone')} value={profile.phone} />
            <ReadOnlyRow label={t('profile.address')} value={profile.addressLine} />
            <ReadOnlyRow label={t('profile.postalCode')} value={profile.postalCode} />
            <ReadOnlyRow label={t('profile.birthDate')} value={profile.birthDate} />
            <ReadOnlyRow label={t('profile.emergencyContact')} value={profile.emergencyContactName} />
            <ReadOnlyRow label={t('profile.emergencyContactPhone')} value={profile.emergencyContactPhone} />
          </>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          {t('profile.identification')}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {t('profile.identificationHint')}
        </Typography>
        <ReadOnlyRow label={t('profile.redCrossNumber')} value={profile.redCrossNumber} />
        <ReadOnlyRow label={t('profile.volunteerNumber')} value={profile.volunteerNumber} />
        <ReadOnlyRow label={t('profile.joinedOn')} value={profile.joinedOn} />
        <ReadOnlyRow
          label={t('profile.bloodType')}
          value={profile.bloodType ? bloodTypeLabel(t, profile.bloodType) : null}
        />
        <ReadOnlyRow label={t('profile.nif')} value={profile.nif} />
        <ReadOnlyRow label={t('profile.citizenCard')} value={profile.citizenCardNumber} />
      </Paper>
    </Container>
  );
};
