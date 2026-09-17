import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderMobile } from '../../test/renderMobile';
import { LiveEntryPage } from './LiveEntryPage';
import { listOutbox, resetLiveRunDb } from './liveRunDb';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetLiveRunDb();
  window.localStorage.clear();
});

const renderEntry = () =>
  renderMobile(
    <Routes>
      <Route path="/live-runs" element={<LiveEntryPage />} />
      <Route path="/live/:runId/:screen" element={<div>O ECRÃ DA CORRIDA</div>} />
    </Routes>,
    { route: '/live-runs' },
  );

describe('starting a run', () => {
  /**
   * Regression: `start` used to write the fresh run straight to IndexedDB and
   * skip the outbox. A run abandoned before its first stamp or edit — the
   * crew misdials, or the call is stood down before intake — would then sit
   * on the device forever, invisible to the coordinator board, because
   * nothing had ever queued it for sync.
   */
  it('enqueues the new run for sync, not just saves it locally', async () => {
    const user = userEvent.setup();
    renderEntry();

    await user.click(await screen.findByRole('button', { name: 'Nova ocorrência' }));

    await waitFor(async () => expect(await listOutbox()).toHaveLength(1));
    expect(await screen.findByText('O ECRÃ DA CORRIDA')).toBeInTheDocument();
  });
});
