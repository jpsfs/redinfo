import { EventReportAttachment, EventReportAttachmentKind } from '@redinfo/shared';
import { getAccessToken } from '../../authProvider';
import { refreshAccessToken } from '../../authRefresh';

/**
 * Uploads one attachment.
 *
 * `apiFetch` sends JSON; a file has to go as multipart, which means building the
 * request by hand. `fetch` sets its own boundary when handed a `FormData`, so the
 * content type is deliberately not set.
 *
 * Its own file because two callers need it now: the report editor, which uploads
 * what the crew attached when saving, and the live run's photo queue, which
 * uploads in the background hours later once there is a signal. One function, so
 * a fix to the auth header or the error message reaches both.
 *
 * "Hours later" is exactly when the access token (15 min) has gone stale
 * without anything having refreshed it — so this retries once against a
 * freshly refreshed token on a 401 rather than losing the photo. See
 * `authRefresh`'s doc comment.
 */
export async function uploadAttachment(
  reportId: string,
  file: File | Blob,
  options: { kind?: EventReportAttachmentKind; filename?: string } = {},
): Promise<EventReportAttachment> {
  const body = new FormData();
  const filename = options.filename ?? (file instanceof File ? file.name : 'anexo');
  body.append('file', file, filename);

  // The kind rides on the query string rather than the form: a retry from the
  // photo queue rebuilds the body from a stored blob, and one fewer field to
  // remember to re-append is one fewer way to lose a Verbete into the photo pile.
  const query = options.kind ? `?kind=${encodeURIComponent(options.kind)}` : '';
  const url = `${import.meta.env.VITE_API_URL ?? ''}/event-reports/${reportId}/attachments${query}`;

  const attempt = (token: string | null) =>
    fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });

  let response = await attempt(getAccessToken());
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await attempt(refreshed);
  }

  if (!response.ok) {
    throw new Error(`${filename}: ${response.statusText}`);
  }
  return (await response.json()) as EventReportAttachment;
}
