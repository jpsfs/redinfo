import { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import {
  CERTIFICATION_LABEL,
  CERTIFICATION_TYPES,
  CertificationType,
  UserCertification,
} from '@redinfo/shared';
import { apiFetch } from '../../api';

export interface CertificationDialogProps {
  open: boolean;
  userId: string;
  /** Present when editing; absent when adding a new one. */
  certification?: UserCertification | null;
  /** Types the person does not already hold — only offered when adding. */
  availableTypes: CertificationType[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Add or edit one certification a coordinator maintains for a person.
 *
 * `type` is fixed once created — it identifies the record — so editing offers
 * only the date fields and notes. There is deliberately no file upload here:
 * a document is attached afterwards, from the certification's own row.
 */
export const CertificationDialog = ({
  open,
  userId,
  certification,
  availableTypes,
  onClose,
  onSaved,
}: CertificationDialogProps) => {
  const isEdit = Boolean(certification);
  const [type, setType] = useState<CertificationType | ''>(certification?.type ?? '');
  const [validUntil, setValidUntil] = useState(certification?.validUntil ?? '');
  const [noExpiry, setNoExpiry] = useState(certification ? certification.validUntil === null : false);
  const [issuedOn, setIssuedOn] = useState(certification?.issuedOn ?? '');
  const [notes, setNotes] = useState(certification?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setType(certification?.type ?? '');
    setValidUntil(certification?.validUntil ?? '');
    setNoExpiry(certification ? certification.validUntil === null : false);
    setIssuedOn(certification?.issuedOn ?? '');
    setNotes(certification?.notes ?? '');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const save = async () => {
    if (!type) {
      setError('Choose which certification this is.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...(isEdit ? {} : { type }),
        validUntil: noExpiry ? null : validUntil || null,
        issuedOn: issuedOn || null,
        notes: notes || undefined,
      };
      if (isEdit && certification) {
        await apiFetch(`/users/${userId}/certifications/${certification.id}`, {
          method: 'PATCH',
          body,
        });
      } else {
        await apiFetch(`/users/${userId}/certifications`, { method: 'POST', body });
      }
      onSaved();
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this certification.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isEdit ? 'Edit certification' : 'Add certification'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="warning">{error}</Alert>}

          <TextField
            select
            label="Certification"
            value={type}
            disabled={isEdit}
            onChange={(event) => setType(event.target.value as CertificationType)}
            fullWidth
            required
          >
            {(isEdit ? CERTIFICATION_TYPES : availableTypes).map((t) => (
              <MenuItem key={t} value={t}>
                {CERTIFICATION_LABEL[t]}
              </MenuItem>
            ))}
          </TextField>

          <Stack direction="row" spacing={2}>
            <TextField
              label="Issued on"
              type="date"
              value={issuedOn}
              onChange={(event) => setIssuedOn(event.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Valid until"
              type="date"
              value={validUntil}
              disabled={noExpiry}
              onChange={(event) => setValidUntil(event.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>

          <FormControlLabel
            control={
              <Checkbox
                checked={noExpiry}
                onChange={(event) => setNoExpiry(event.target.checked)}
              />
            }
            label="The certificate carries no expiry date"
          />

          <TextField
            label="Notes (optional)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={busy}>
          Save certification
        </Button>
      </DialogActions>
    </Dialog>
  );
};
