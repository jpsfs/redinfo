import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderMobile } from '../../test/renderMobile';
import { LiveTopBar } from './LiveTopBar';
import { emptyRun } from './liveRun';
import type { SyncState } from './liveRunSync';

const noop = () => undefined;

const renderBar = (sync: SyncState) =>
  renderMobile(
    <LiveTopBar
      run={emptyRun('r1')}
      sync={sync}
      screen="intake"
      onJump={noop}
      onBack={noop}
      onCorrectTimes={noop}
      onAbandon={vi.fn()}
    />,
  );

describe('the sync indicator', () => {
  it('stays off the clock when there is nothing to worry about', () => {
    renderBar('synced');
    expect(screen.queryByTestId('CheckCircleIcon')).not.toBeInTheDocument();
  });

  it('says nothing for a resting, unsynced state — nothing is at risk yet', () => {
    renderBar('saved');
    expect(screen.queryByTestId('SmartphoneIcon')).not.toBeInTheDocument();
  });

  it('puts an icon next to the clock once the network is the problem', () => {
    renderBar('offline');
    expect(screen.getByTestId('CloudOffIcon')).toBeInTheDocument();
  });

  it('puts an icon next to the clock once sending has actually failed', () => {
    renderBar('failed');
    expect(screen.getByTestId('ErrorOutlineIcon')).toBeInTheDocument();
  });

  it('is no longer its own row — the status is announced, not displayed as a chip', () => {
    renderBar('failed');

    const region = screen.getByText('Falha ao sincronizar');
    // The old chip's text now lives in a screen-reader-only live region: still
    // announced, but clipped to nothing on screen rather than its own row.
    expect(region.closest('[aria-live="polite"]')).not.toBeNull();
    expect(region.closest('.MuiChip-root')).toBeNull();
    expect(region).toHaveStyle({ overflow: 'hidden' });
  });
});
