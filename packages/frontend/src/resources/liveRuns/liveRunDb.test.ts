// The one file that needs a real IndexedDB. jsdom has none, and hand-writing a
// fake is two hundred lines of exactly the place a bug would hide — a `put` that
// silently does not overwrite would make every assertion here pass and the
// feature lose runs.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { EventReportAttachmentKind, InventoryItemType, MaterialItem } from '@redinfo/shared';
import { emptyRun } from './liveRun';
import {
  StoredPhoto,
  photoBlob,
  attachPhotosToReport,
  deletePhoto,
  deleteRun,
  dequeue,
  enqueue,
  listMaterialFavourites,
  listOutbox,
  listPendingPhotos,
  listPhotos,
  listRuns,
  loadRun,
  markOutboxFailure,
  resetLiveRunDb,
  saveMaterialFavourites,
  saveRun,
  savePhoto,
  updatePhoto,
} from './liveRunDb';

const NOW = new Date('2026-08-22T20:14:00.000Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const photo = (overrides: Partial<StoredPhoto> = {}): StoredPhoto => ({
  id: 'photo-1',
  runId: 'run-1',
  reportId: null,
  filename: 'foto.jpg',
  mimeType: 'image/jpeg',
  byteSize: 5,
  kind: EventReportAttachmentKind.GENERAL,
  bytes: new TextEncoder().encode('bytes').buffer,
  createdAt: NOW.toISOString(),
  attempts: 0,
  ...overrides,
});

beforeEach(() => {
  // A fresh factory per test rather than deleting stores: the database is the
  // thing under test, and a leftover schema would make an ordering bug look
  // like a passing suite.
  globalThis.indexedDB = new IDBFactory();
  resetLiveRunDb();
});

describe('runs', () => {
  it('round-trips a run through the device’s own store', async () => {
    const run = emptyRun('run-1', NOW);
    await saveRun(run, {}, NOW);

    const stored = await loadRun('run-1');
    expect(stored?.run).toEqual(run);
    expect(stored?.savedAt).toBe(NOW.toISOString());
  });

  it('is null for a run this device has never seen', async () => {
    expect(await loadRun('run-nobody')).toBeNull();
  });

  it('overwrites rather than accumulating, so there is one truth per run', async () => {
    await saveRun(emptyRun('run-1', NOW), {}, NOW);
    await saveRun({ ...emptyRun('run-1', NOW), revision: 4 }, {}, later(1));

    expect((await loadRun('run-1'))?.run.revision).toBe(4);
    expect(await listRuns()).toHaveLength(1);
  });

  it('keeps the report id once closing has produced one', async () => {
    await saveRun(emptyRun('run-1', NOW), { reportId: 'rep-9' }, NOW);
    // And a later save that knows nothing about the report must not erase it —
    // the photo queue reads it to know where to upload.
    await saveRun({ ...emptyRun('run-1', NOW), revision: 2 }, {}, later(1));

    expect((await loadRun('run-1'))?.reportId).toBe('rep-9');
  });

  it('lists runs newest-first, which is the order the entry page offers them', async () => {
    await saveRun(emptyRun('run-old', NOW), {}, NOW);
    await saveRun(emptyRun('run-new', NOW), {}, later(30));

    expect((await listRuns()).map((entry) => entry.run.id)).toEqual(['run-new', 'run-old']);
  });

  it('forgets a run it is told to', async () => {
    await saveRun(emptyRun('run-1', NOW), {}, NOW);
    await deleteRun('run-1');
    expect(await loadRun('run-1')).toBeNull();
  });
});

describe('the outbox', () => {
  it('holds one entry per run, however many edits arrive', async () => {
    // Keyed by run id on purpose: the mirror is a whole-document PUT, so the
    // newest document supersedes the queued one. Seventeen keystrokes are one
    // request, not seventeen.
    await enqueue('run-1', 1, NOW);
    await enqueue('run-1', 2, later(1));
    await enqueue('run-1', 3, later(2));

    const queue = await listOutbox();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ runId: 'run-1', revision: 3 });
  });

  it('keeps runs apart', async () => {
    await enqueue('run-1', 1, NOW);
    await enqueue('run-2', 1, later(1));
    expect((await listOutbox()).map((entry) => entry.runId)).toEqual(['run-1', 'run-2']);
  });

  it('clears the entry once the revision that was sent lands', async () => {
    await enqueue('run-1', 4, NOW);
    await dequeue('run-1', 4);
    expect(await listOutbox()).toEqual([]);
  });

  it('keeps a newer revision queued when an older request lands', async () => {
    // The crew edited a field while the request was in flight. Dropping the
    // entry here is how the last edit never reaches the server.
    await enqueue('run-1', 4, NOW);
    await enqueue('run-1', 5, later(1));

    await dequeue('run-1', 4);

    expect((await listOutbox())[0]).toMatchObject({ revision: 5 });
  });

  it('counts failures and remembers when to try again', async () => {
    await enqueue('run-1', 1, NOW);
    await markOutboxFailure('run-1', 'Failed to fetch', later(1));

    expect((await listOutbox())[0]).toMatchObject({
      attempts: 1,
      lastError: 'Failed to fetch',
      nextAttemptAt: later(1).toISOString(),
    });
  });

  it('resets the backoff when the crew edits again', async () => {
    await enqueue('run-1', 1, NOW);
    await markOutboxFailure('run-1', 'Failed to fetch', later(1));

    await enqueue('run-1', 2, later(2));

    // The previous failure was about a document that no longer exists, and the
    // crew is waiting on this one — so it goes out now rather than in 30s.
    expect((await listOutbox())[0]).toMatchObject({ attempts: 0, nextAttemptAt: null });
  });

  it('does nothing when told about a failure it has no record of', async () => {
    await markOutboxFailure('run-gone', 'boom', later(1));
    expect(await listOutbox()).toEqual([]);
  });
});

describe('photos', () => {
  it('stores the bytes, and gives them back as something uploadable', async () => {
    await savePhoto(photo());

    const [stored] = await listPhotos('run-1');
    // The bytes themselves, not a `Blob` that reads back as `{}` — which is
    // exactly what storing a Blob here would have produced.
    expect(new TextDecoder().decode(stored.bytes)).toBe('bytes');

    const blob = photoBlob(stored);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(5);
  });

  it('scopes to one run, and lists oldest-first', async () => {
    await savePhoto(photo({ id: 'p2', createdAt: later(2).toISOString() }));
    await savePhoto(photo({ id: 'p1', createdAt: NOW.toISOString() }));
    await savePhoto(photo({ id: 'p3', runId: 'run-2' }));

    expect((await listPhotos('run-1')).map((entry) => entry.id)).toEqual(['p1', 'p2']);
    expect(await listPhotos()).toHaveLength(3);
  });

  it('counts only what has not gone up yet', async () => {
    await savePhoto(photo({ id: 'p1' }));
    await savePhoto(photo({ id: 'p2', uploadedAt: NOW.toISOString() }));

    expect((await listPendingPhotos('run-1')).map((entry) => entry.id)).toEqual(['p1']);
  });

  it('records an upload without touching the bytes', async () => {
    await savePhoto(photo());
    await updatePhoto('photo-1', { uploadedAt: later(90).toISOString(), attempts: 2 });

    const [stored] = await listPhotos('run-1');
    expect(stored.uploadedAt).toBe(later(90).toISOString());
    expect(new TextDecoder().decode(stored.bytes)).toBe('bytes');
  });

  it('ignores an update to a photograph that has been removed', async () => {
    await updatePhoto('photo-gone', { uploadedAt: NOW.toISOString() });
    expect(await listPhotos()).toEqual([]);
  });

  it('deletes one', async () => {
    await savePhoto(photo());
    await deletePhoto('photo-1');
    expect(await listPhotos()).toEqual([]);
  });

  it('points a run’s photographs at the report it became', async () => {
    // Until a run has a report there is nowhere to upload to, so the queue waits
    // — which is what makes a run closed in a dead spot lose nothing.
    await savePhoto(photo({ id: 'p1' }));
    await savePhoto(photo({ id: 'p2', kind: EventReportAttachmentKind.VERBETE }));
    await savePhoto(photo({ id: 'p3', runId: 'run-2' }));

    await attachPhotosToReport('run-1', 'rep-9');

    const mine = await listPhotos('run-1');
    expect(mine.map((entry) => entry.reportId)).toEqual(['rep-9', 'rep-9']);
    expect((await listPhotos('run-2'))[0].reportId).toBeNull();
  });
});

const materialItem = (overrides: Partial<MaterialItem> = {}): MaterialItem => ({
  id: 'mat-gloves',
  namePt: 'Luvas',
  nameEn: 'Gloves',
  unit: 'pcs',
  type: InventoryItemType.COUNTABLE,
  notes: null,
  isFrequent: true,
  frequentOrder: 0,
  isDeleted: false,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...overrides,
});

describe('material favourites — the offline catalogue for #209', () => {
  it('round-trips the pinned set', async () => {
    const gloves = materialItem();
    const oxygen = materialItem({ id: 'mat-oxygen', namePt: 'Oxigénio', frequentOrder: 1 });
    await saveMaterialFavourites([gloves, oxygen]);

    expect(await listMaterialFavourites()).toEqual([gloves, oxygen]);
  });

  it('orders by frequentOrder, then name — the catalogue endpoint’s own order', async () => {
    const oxygen = materialItem({ id: 'mat-oxygen', namePt: 'Oxigénio', frequentOrder: 1 });
    const gloves = materialItem({ frequentOrder: 0 });
    await saveMaterialFavourites([oxygen, gloves]);

    expect((await listMaterialFavourites()).map((item) => item.id)).toEqual([
      'mat-gloves',
      'mat-oxygen',
    ]);
  });

  it('replaces rather than accumulates, so an unpinned favourite actually disappears', async () => {
    await saveMaterialFavourites([materialItem(), materialItem({ id: 'mat-oxygen' })]);
    await saveMaterialFavourites([materialItem()]);

    expect(await listMaterialFavourites()).toHaveLength(1);
  });

  it('is empty until the device has ever cached one', async () => {
    expect(await listMaterialFavourites()).toEqual([]);
  });
});

describe('when there is no IndexedDB at all', () => {
  it('degrades to "nothing stored" rather than taking the screen down', async () => {
    // Private browsing on some builds, or a WebView with storage disabled. Live
    // mode still runs from memory; it just cannot survive a reload.
    resetLiveRunDb();
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;

    await expect(saveRun(emptyRun('run-1', NOW), {}, NOW)).resolves.toBeUndefined();
    await expect(loadRun('run-1')).resolves.toBeNull();
    await expect(listRuns()).resolves.toEqual([]);
    await expect(listOutbox()).resolves.toEqual([]);
    await expect(listPhotos()).resolves.toEqual([]);
    await expect(listMaterialFavourites()).resolves.toEqual([]);
    await expect(saveMaterialFavourites([materialItem()])).resolves.toBeUndefined();
  });
});
