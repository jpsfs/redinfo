import { useRef, useState } from 'react';
import { Button, CircularProgress, Stack } from '@mui/material';

export interface PhotoUploadControlProps {
  hasPhoto: boolean;
  /** Expected to handle its own errors (e.g. via `notify`) — never lets one bubble here. */
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  changeLabel: string;
  removeLabel: string;
}

/**
 * Hidden `<input type="file">` behind a visible MUI button, resetting
 * `event.target.value` after each pick — the same interaction as the event
 * report Verbete slot (`ReportSections.tsx`), reused here for a person's
 * photo, whether self-service or coordinator-managed.
 */
export const PhotoUploadControl = ({
  hasPhoto,
  onUpload,
  onRemove,
  changeLabel,
  removeLabel,
}: PhotoUploadControlProps) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File) => {
    setBusy(true);
    try {
      await onUpload(file);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await onRemove();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Button size="small" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <CircularProgress size={16} /> : changeLabel}
      </Button>
      {hasPhoto && (
        <Button size="small" color="error" disabled={busy} onClick={() => void remove()}>
          {removeLabel}
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        data-testid="photo-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void pick(file);
        }}
      />
    </Stack>
  );
};
