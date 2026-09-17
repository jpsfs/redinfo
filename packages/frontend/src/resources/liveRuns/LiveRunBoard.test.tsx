import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderMobile } from '../../test/renderMobile';
import { apiFetch } from '../../api';
import { LIVE_RUN_BOARD_ENTRY } from '../../test/fixtures';
import { LiveRunBoard } from './LiveRunBoard';
import { writeCurrentRunId } from './liveRun';

vi.mock('../../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn() }));

const mockApiFetch = apiFetch as unknown as Mock;

const renderBoard = () =>
  renderMobile(
    <Routes>
      <Route path="/" element={<LiveRunBoard />} />
      <Route path="/live/:id" element={<div>A OCORRÊNCIA EM DIRETO</div>} />
    </Routes>,
  );

describe('LiveRunBoard', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    window.localStorage.clear();
  });

  /**
   * Oversight into someone else's call must stay read-only — a coordinator's
   * desk editing a phone's local truth would break the revision contract the
   * whole sync rests on (see the component's own doc comment).
   */
  it('offers no way into a run this device did not start', async () => {
    mockApiFetch.mockResolvedValue([LIVE_RUN_BOARD_ENTRY]);
    renderBoard();

    await screen.findByText(LIVE_RUN_BOARD_ENTRY.chiefComplaint!);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  /**
   * The one exception: the row for the run this very phone already has open.
   * That is the crew jumping back into their own call, same as the resume
   * tile on `/my-reports` — not a desk reaching into somebody else's run.
   */
  it("jumps straight back into this device's own open run", async () => {
    const user = userEvent.setup();
    writeCurrentRunId(LIVE_RUN_BOARD_ENTRY.id);
    mockApiFetch.mockResolvedValue([LIVE_RUN_BOARD_ENTRY]);
    renderBoard();

    const row = await screen.findByRole('button');
    await user.click(row);

    expect(await screen.findByText('A OCORRÊNCIA EM DIRETO')).toBeInTheDocument();
  });
});
