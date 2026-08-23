import { useCallback, useEffect, useState } from 'react';
import { EventReportAttachmentKind, validateAttachment } from '@redinfo/shared';
import { useOnline } from '../../hooks/useOnline';
import { uploadAttachment } from '../eventReports/uploadAttachment';
import { newRunId } from './liveRun';
import {
  StoredPhoto,
  deletePhoto,
  listPhotos,
  photoBlob,
  savePhoto,
  updatePhoto,
} from './liveRunDb';

export interface PhotoQueueHandle {
  photos: StoredPhoto[];
  pending: StoredPhoto[];
  /** True while a file is going up, for the tray's spinner. */
  uploading: boolean;
  /** Adds files, refusing what the server would refuse anyway. */
  add: (files: File[], kind?: EventReportAttachmentKind) => Promise<string[]>;
  remove: (id: string) => Promise<void>;
  /** Try the queue now — the banner's "Tentar agora". */
  flush: () => void;
  refresh: () => void;
}

export interface UsePhotoQueueOptions {
  runId: string;
  /** Set once the run has become a report. Until then there is nowhere to send. */
  reportId?: string | null;
  enabled?: boolean;
}

/**
 * The photograph queue, which outlives the live screens.
 *
 * Photographs are stored on the device the moment they are taken and uploaded
 * **serially, only once a `reportId` exists** — a run has no report until it is
 * closed, so until then the queue simply waits. That is what makes a run closed
 * in a dead spot lose nothing: the report page mounts this same queue and
 * finishes the job hours later.
 *
 * Closing never blocks on a 20 MB upload, and neither does anything else here.
 */
export function usePhotoQueue(options: UsePhotoQueueOptions): PhotoQueueHandle {
  const { runId, reportId = null, enabled = true } = options;
  const online = useOnline();

  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(() => {
    void listPhotos(runId).then(setPhotos);
  }, [runId]);

  useEffect(refresh, [refresh]);

  const add = useCallback(
    async (files: File[], kind = EventReportAttachmentKind.GENERAL): Promise<string[]> => {
      const refused: string[] = [];

      for (const file of files) {
        // Checked here as well as server-side, so a 20 MB photo is refused
        // before it is carried over a mobile connection.
        const error = validateAttachment({
          filename: file.name,
          mimeType: file.type,
          byteSize: file.size,
        });
        if (error) {
          refused.push(`${file.name}: ${error}`);
          continue;
        }

        await savePhoto({
          id: newRunId(),
          runId,
          reportId,
          filename: file.name,
          mimeType: file.type,
          byteSize: file.size,
          kind,
          bytes: await file.arrayBuffer(),
          createdAt: new Date().toISOString(),
          attempts: 0,
        });
      }

      refresh();
      return refused;
    },
    [refresh, reportId, runId],
  );

  const remove = useCallback(
    async (id: string) => {
      await deletePhoto(id);
      refresh();
    },
    [refresh],
  );

  /**
   * Uploads one at a time.
   *
   * Serial and not parallel, deliberately: four photographs at once on a 3G
   * uplink means four slow requests and four timeouts, where one at a time means
   * the first one is safely on the server before the tunnel.
   */
  const flush = useCallback(() => {
    if (!enabled || !reportId || !online) return;

    void (async () => {
      setUploading(true);
      try {
        const queue = (await listPhotos(runId)).filter((photo) => !photo.uploadedAt);
        for (const photo of queue) {
          try {
            await uploadAttachment(reportId, photoBlob(photo), {
              kind: photo.kind,
              filename: photo.filename,
            });
            await updatePhoto(photo.id, {
              uploadedAt: new Date().toISOString(),
              lastError: null,
            });
          } catch (cause) {
            await updatePhoto(photo.id, {
              attempts: photo.attempts + 1,
              lastError: cause instanceof Error ? cause.message : 'Upload failed',
            });
            // Stop on the first failure rather than hammering the rest: whatever
            // broke this one is almost certainly about to break the next.
            break;
          }
        }
      } finally {
        setUploading(false);
        refresh();
      }
    })();
  }, [enabled, online, refresh, reportId, runId]);

  /** A report id arriving, or the network coming back, is the cue to try. */
  useEffect(() => {
    if (!reportId || !online) return;
    flush();
  }, [flush, online, reportId]);

  return {
    photos,
    pending: photos.filter((photo) => !photo.uploadedAt),
    uploading,
    add,
    remove,
    flush,
    refresh,
  };
}
