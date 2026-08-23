import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { EventReportAttachmentKind } from '@redinfo/shared';
import { t } from '../../i18n/labels';
import { StoredPhoto, photoBlob } from './liveRunDb';
import { PhotoQueueHandle } from './usePhotoQueue';

/**
 * A thumbnail from bytes already on the device.
 *
 * The object URL is revoked on unmount, which matters more here than usual: a
 * long run with twenty photographs would otherwise pin twenty full-size images
 * in memory on a phone that is also running Maps.
 */
const useObjectUrl = (photo: StoredPhoto): string | null => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photo.mimeType.startsWith('image/')) return undefined;
    const created = URL.createObjectURL(photoBlob(photo));
    setUrl(created);
    return () => {
      URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [photo]);

  return url;
};

const Thumbnail = ({
  photo,
  onRemove,
}: {
  photo: StoredPhoto;
  onRemove: () => void;
}) => {
  const url = useObjectUrl(photo);

  return (
    <Box sx={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
      <Paper
        variant="outlined"
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: 2,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'grey.100',
        }}
      >
        {url ? (
          <Box
            component="img"
            src={url}
            alt={photo.filename}
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <DescriptionIcon color="disabled" />
        )}
      </Paper>

      {photo.uploadedAt ? (
        <Chip
          size="small"
          icon={<CheckIcon />}
          label=""
          sx={{
            position: 'absolute',
            bottom: 4,
            left: 4,
            height: 22,
            bgcolor: 'success.main',
            color: '#fff',
            '& .MuiChip-icon': { color: '#fff', ml: 0.75, mr: -0.5 },
          }}
        />
      ) : null}

      <IconButton
        size="small"
        aria-label={`${t('action.remove')} ${photo.filename}`}
        onClick={onRemove}
        sx={{
          position: 'absolute',
          top: -8,
          right: -8,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          '&:hover': { bgcolor: 'background.paper' },
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  );
};

export interface PhotoTrayProps {
  queue: PhotoQueueHandle;
  /** Shown as a warning when a file is refused before it leaves the phone. */
  onRefused?: (messages: string[]) => void;
}

/**
 * Photographs taken during the run.
 *
 * `capture="environment"` so the camera opens straight onto the rear lens — a
 * crew photographing a medication box does not want a selfie viewfinder and a
 * tap to switch.
 *
 * Nothing here ever blocks. The bytes are on the device the moment the shutter
 * closes; the upload happens later, once there is a report to hang them off and
 * a network to carry them.
 */
export const PhotoTray = ({ queue, onRefused }: PhotoTrayProps) => {
  const input = useRef<HTMLInputElement | null>(null);

  const photos = useMemo(
    () => queue.photos.filter((photo) => photo.kind !== EventReportAttachmentKind.VERBETE),
    [queue.photos],
  );

  const choose = async (files: FileList | null) => {
    if (!files?.length) return;
    const refused = await queue.add(Array.from(files));
    if (refused.length) onRefused?.(refused);
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography sx={{ fontWeight: 700, flex: 1 }}>{t('live.photos')}</Typography>
        {queue.uploading && <CircularProgress size={16} />}
      </Stack>

      {photos.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pt: 1, pb: 0.5 }}>
          {photos.map((photo) => (
            <Thumbnail
              key={photo.id}
              photo={photo}
              onRemove={() => void queue.remove(photo.id)}
            />
          ))}
        </Box>
      )}

      <Button
        variant="outlined"
        startIcon={<PhotoCameraIcon />}
        onClick={() => input.current?.click()}
        sx={{ minHeight: 56, fontWeight: 700 }}
      >
        {t('live.addPhoto')}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(event) => {
          void choose(event.target.files);
          // Cleared so photographing the same thing twice fires a change event
          // the second time too.
          event.target.value = '';
        }}
      />
    </Stack>
  );
};
