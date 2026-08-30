import { EventReportAttachmentKind, LiveRunInput, MaterialItem } from '@redinfo/shared';

/**
 * The device's own copy of every live run — IndexedDB, not `localStorage`.
 *
 * `localStorage` is out for two reasons and both are fatal here: it is
 * synchronous (so writing a run on every keystroke janks the main thread while a
 * crew is typing one-handed), and it cannot hold a `Blob` (so photographs would
 * have to be base64'd into a string, inflating a 4 MB photo to 5.4 MB of a ~5 MB
 * quota).
 *
 * **The device is the source of truth.** Everything here has to work with the
 * radio off, in a valley, for an hour — so every entry point is try/catch
 * wrapped and degrades to "nothing stored" rather than taking the screen down,
 * exactly as `loadDraft`/`saveDraft` do. A crew mid-call must never see a
 * database error.
 */

export const DB_NAME = 'redinfo-live';
export const DB_VERSION = 2;

export const RUNS_STORE = 'runs';
export const PHOTOS_STORE = 'photos';
export const OUTBOX_STORE = 'outbox';
export const MATERIAL_FAVOURITES_STORE = 'materialFavourites';

/** A photograph waiting to be uploaded, with the bytes still on the device. */
export interface StoredPhoto {
  id: string;
  runId: string;
  /** Set once the run has become a report; until then there is nowhere to send it. */
  reportId?: string | null;
  filename: string;
  mimeType: string;
  byteSize: number;
  kind: EventReportAttachmentKind;
  /**
   * The bytes, as an `ArrayBuffer` rather than a `Blob`.
   *
   * A `Blob` is the obvious thing to store and the wrong one: several WebView
   * and Safari builds fail to structured-clone it into IndexedDB, and the
   * failure mode is a record that reads back as `{}` — a photograph silently
   * emptied, which is the worst possible way to lose one. An `ArrayBuffer`
   * clones everywhere, and `photoBlob` puts the type back on.
   */
  bytes: ArrayBuffer;
  createdAt: string;
  /** How many upload attempts have failed, for the backoff. */
  attempts: number;
  /** The last failure, shown in the pending-upload banner. */
  lastError?: string | null;
  uploadedAt?: string | null;
}

/**
 * One queued sync, keyed by `runId`.
 *
 * **Keyed by the run and not auto-incremented, on purpose.** The mirror is a
 * whole-document idempotent PUT, so a newer mutation *supersedes* the queued one
 * rather than queueing behind it. That single decision removes ordering, dedup
 * and partial-apply from the problem entirely — there is never a queue of
 * seventeen field edits to replay in the right sequence.
 */
export interface OutboxEntry {
  runId: string;
  revision: number;
  queuedAt: string;
  attempts: number;
  lastError?: string | null;
  /** When the backoff allows another attempt. */
  nextAttemptAt?: string | null;
}

/** A run as it is stored, with when the device last wrote it. */
export interface StoredRun {
  run: LiveRunInput;
  savedAt: string;
  /** Set once closing has produced a report, so the photo queue knows where to send. */
  reportId?: string | null;
}

let handle: Promise<IDBDatabase | null> | null = null;

/**
 * Opens the database, once.
 *
 * Returns null rather than throwing where there is no IndexedDB at all —
 * private browsing on some builds, or a WebView with storage disabled. Live mode
 * still runs from memory in that case; it just cannot survive a reload, and the
 * screens say so rather than pretending.
 */
function open(): Promise<IDBDatabase | null> {
  if (handle) return handle;

  handle = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RUNS_STORE)) {
          db.createObjectStore(RUNS_STORE, { keyPath: 'run.id' });
        }
        if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
          const photos = db.createObjectStore(PHOTOS_STORE, { keyPath: 'id' });
          photos.createIndex('runId', 'runId');
        }
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          db.createObjectStore(OUTBOX_STORE, { keyPath: 'runId' });
        }
        if (!db.objectStoreNames.contains(MATERIAL_FAVOURITES_STORE)) {
          db.createObjectStore(MATERIAL_FAVOURITES_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return handle;
}

/** Forgets the cached handle. For tests, and for a reopened tab after a wipe. */
export function resetLiveRunDb(): void {
  handle = null;
}

/** Wraps one request in a promise, resolving to `fallback` on any failure. */
function ask<T>(request: IDBRequest<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result ?? fallback);
    request.onerror = () => resolve(fallback);
  });
}

async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T> | T,
  fallback: T,
): Promise<T> {
  const db = await open();
  if (!db) return fallback;
  try {
    const transaction = db.transaction(store, mode);
    return await work(transaction.objectStore(store));
  } catch {
    return fallback;
  }
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export function saveRun(
  run: LiveRunInput,
  extra: { reportId?: string | null } = {},
  now: Date = new Date(),
): Promise<void> {
  return withStore(
    RUNS_STORE,
    'readwrite',
    async (store) => {
      const existing = await ask<StoredRun | undefined>(store.get(run.id), undefined);
      const payload: StoredRun = {
        run,
        savedAt: now.toISOString(),
        reportId: extra.reportId ?? existing?.reportId ?? null,
      };
      await ask(store.put(payload) as IDBRequest<IDBValidKey>, run.id);
    },
    undefined,
  );
}

export function loadRun(id: string): Promise<StoredRun | null> {
  return withStore(
    RUNS_STORE,
    'readonly',
    async (store) => (await ask<StoredRun | undefined>(store.get(id), undefined)) ?? null,
    null,
  );
}

/** Every run the device still holds, newest first. */
export function listRuns(): Promise<StoredRun[]> {
  return withStore(
    RUNS_STORE,
    'readonly',
    async (store) => {
      const all = await ask<StoredRun[]>(store.getAll() as IDBRequest<StoredRun[]>, []);
      return [...all].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    },
    [],
  );
}

export function deleteRun(id: string): Promise<void> {
  return withStore(
    RUNS_STORE,
    'readwrite',
    async (store) => {
      await ask(store.delete(id) as IDBRequest<undefined>, undefined);
    },
    undefined,
  );
}

// ── Outbox ────────────────────────────────────────────────────────────────────

/**
 * Queues a run for sync, replacing whatever was queued for it.
 *
 * `put` and not `add`, which is the whole point of keying by `runId`: the newest
 * document is the only one worth sending, so a burst of edits collapses into one
 * request rather than a stack of them.
 */
export function enqueue(runId: string, revision: number, now: Date = new Date()): Promise<void> {
  return withStore(
    OUTBOX_STORE,
    'readwrite',
    async (store) => {
      const existing = await ask<OutboxEntry | undefined>(store.get(runId), undefined);
      const entry: OutboxEntry = {
        runId,
        revision,
        queuedAt: now.toISOString(),
        // A new edit resets the backoff: the previous failure was about a
        // document that no longer exists, and the crew is waiting on this one.
        attempts: existing && existing.revision === revision ? existing.attempts : 0,
        nextAttemptAt: null,
        lastError: null,
      };
      await ask(store.put(entry) as IDBRequest<IDBValidKey>, runId);
    },
    undefined,
  );
}

export function listOutbox(): Promise<OutboxEntry[]> {
  return withStore(
    OUTBOX_STORE,
    'readonly',
    async (store) => {
      const all = await ask<OutboxEntry[]>(store.getAll() as IDBRequest<OutboxEntry[]>, []);
      return [...all].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
    },
    [],
  );
}

/** Drops the entry, but only if it is still the revision that was sent. */
export function dequeue(runId: string, revision: number): Promise<void> {
  return withStore(
    OUTBOX_STORE,
    'readwrite',
    async (store) => {
      const existing = await ask<OutboxEntry | undefined>(store.get(runId), undefined);
      // A newer revision was queued while the request was in flight. Leaving it
      // is what makes "the last edit always reaches the server" true.
      if (!existing || existing.revision !== revision) return;
      await ask(store.delete(runId) as IDBRequest<undefined>, undefined);
    },
    undefined,
  );
}

export function markOutboxFailure(
  runId: string,
  error: string,
  nextAttemptAt: Date,
): Promise<void> {
  return withStore(
    OUTBOX_STORE,
    'readwrite',
    async (store) => {
      const existing = await ask<OutboxEntry | undefined>(store.get(runId), undefined);
      if (!existing) return;
      await ask(
        store.put({
          ...existing,
          attempts: existing.attempts + 1,
          lastError: error,
          nextAttemptAt: nextAttemptAt.toISOString(),
        }) as IDBRequest<IDBValidKey>,
        runId,
      );
    },
    undefined,
  );
}

// ── Photos ────────────────────────────────────────────────────────────────────

/** The bytes back as something `FormData` can upload. */
export function photoBlob(photo: Pick<StoredPhoto, 'bytes' | 'mimeType'>): Blob {
  return new Blob([photo.bytes], { type: photo.mimeType });
}

/**
 * Stores a photograph's bytes.
 *
 * They live here and **never** in the run record or a PUT body: a 4 MB
 * photograph in the synced document would make every keystroke's mirror a
 * multi-megabyte upload, and closing a run would block on it.
 */
export function savePhoto(photo: StoredPhoto): Promise<void> {
  return withStore(
    PHOTOS_STORE,
    'readwrite',
    async (store) => {
      await ask(store.put(photo) as IDBRequest<IDBValidKey>, photo.id);
    },
    undefined,
  );
}

export function listPhotos(runId?: string): Promise<StoredPhoto[]> {
  return withStore(
    PHOTOS_STORE,
    'readonly',
    async (store) => {
      const all = await ask<StoredPhoto[]>(store.getAll() as IDBRequest<StoredPhoto[]>, []);
      const scoped = runId ? all.filter((photo) => photo.runId === runId) : all;
      return scoped.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    [],
  );
}

/** The photographs still to go up — the ones the banner counts. */
export async function listPendingPhotos(runId?: string): Promise<StoredPhoto[]> {
  const all = await listPhotos(runId);
  return all.filter((photo) => !photo.uploadedAt);
}

export function updatePhoto(id: string, changes: Partial<StoredPhoto>): Promise<void> {
  return withStore(
    PHOTOS_STORE,
    'readwrite',
    async (store) => {
      const existing = await ask<StoredPhoto | undefined>(store.get(id), undefined);
      if (!existing) return;
      await ask(store.put({ ...existing, ...changes }) as IDBRequest<IDBValidKey>, id);
    },
    undefined,
  );
}

export function deletePhoto(id: string): Promise<void> {
  return withStore(
    PHOTOS_STORE,
    'readwrite',
    async (store) => {
      await ask(store.delete(id) as IDBRequest<undefined>, undefined);
    },
    undefined,
  );
}

/**
 * Stamps every photograph of a run with the report it now belongs to.
 *
 * Called once, at close. Until a run has a report there is nowhere to upload to,
 * so the queue simply waits — which is also what makes a run closed in a dead
 * spot lose nothing.
 */
export async function attachPhotosToReport(runId: string, reportId: string): Promise<void> {
  const photos = await listPhotos(runId);
  for (const photo of photos) {
    if (photo.reportId === reportId) continue;
    await updatePhoto(photo.id, { reportId });
  }
}

// ── Material favourites (offline catalogue for #209) ────────────────────────

/**
 * Replaces the cached favourites with the catalogue's current pinned set.
 *
 * Cleared and rewritten whole rather than merged: a favourite unpinned since
 * the last refresh must actually disappear from the grid, and there are never
 * more than a couple hundred of these, so a full replace costs nothing a
 * merge would have saved.
 */
export function saveMaterialFavourites(items: MaterialItem[]): Promise<void> {
  return withStore(
    MATERIAL_FAVOURITES_STORE,
    'readwrite',
    async (store) => {
      await ask(store.clear() as IDBRequest<undefined>, undefined);
      for (const item of items) {
        await ask(store.put(item) as IDBRequest<IDBValidKey>, item.id);
      }
    },
    undefined,
  );
}

/**
 * The favourites as they were last seen online, ordered the way the
 * catalogue endpoint orders them — so a dead spot's grid looks exactly like
 * the connected one, just possibly a refresh behind.
 */
export function listMaterialFavourites(): Promise<MaterialItem[]> {
  return withStore(
    MATERIAL_FAVOURITES_STORE,
    'readonly',
    async (store) => {
      const all = await ask<MaterialItem[]>(store.getAll() as IDBRequest<MaterialItem[]>, []);
      return [...all].sort(
        (a, b) => a.frequentOrder - b.frequentOrder || a.namePt.localeCompare(b.namePt),
      );
    },
    [],
  );
}
