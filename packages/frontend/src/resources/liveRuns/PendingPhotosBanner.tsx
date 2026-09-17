import { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress } from '@mui/material';
import { useT } from '../../i18n/useT';
import { StoredPhoto, listPendingPhotos } from './liveRunDb';
import { usePhotoQueue } from './usePhotoQueue';

/**
 * "3 fotografias por enviar — Tentar agora", on the report's own page.
 *
 * The photo queue outlives the live screens, and this is why: a crew that closed
 * a run in a dead spot has photographs on the phone and a report on the server,
 * and the two only meet when there is a signal. Mounting the queue here means
 * the report page finishes the job hours later without anybody going back into
 * live mode.
 *
 * Renders nothing at all when there is nothing to send — a banner that is always
 * there is a banner nobody reads.
 */
export const PendingPhotosBanner = ({
  reportId,
  liveRunId,
}: {
  reportId: string;
  /** The run the report came from. Absent on a post-hoc report, which has none. */
  liveRunId?: string | null;
}) => {
  const [known, setKnown] = useState<StoredPhoto[] | null>(null);

  // Read once before mounting the queue, so a report with no photographs on this
  // device does not start a queue at all.
  useEffect(() => {
    if (!liveRunId) {
      setKnown([]);
      return;
    }
    void listPendingPhotos(liveRunId).then(setKnown);
  }, [liveRunId]);

  if (!liveRunId || !known || known.length === 0) return null;
  return <Banner runId={liveRunId} reportId={reportId} />;
};

const Banner = ({ runId, reportId }: { runId: string; reportId: string }) => {
  const t = useT();
  const queue = usePhotoQueue({ runId, reportId });

  if (queue.pending.length === 0) return null;

  return (
    <Alert
      severity="info"
      icon={queue.uploading ? <CircularProgress size={18} /> : undefined}
      action={
        <Button size="small" onClick={queue.flush} sx={{ fontWeight: 700 }}>
          {t('sync.retry')}
        </Button>
      }
    >
      {queue.uploading
        ? t('live.photosUploading')
        : queue.pending.length === 1
          ? t('live.photoPending')
          : `${queue.pending.length} ${t('live.photosPending')}`}
    </Alert>
  );
};
