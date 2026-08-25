import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LiveRunsPage } from './LiveRunsPage';
import { apiFetch } from '../api';
import { LIVE_RUN_BOARD_ENTRY } from '../test/fixtures';

vi.mock('../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn(), apiUpload: vi.fn() }));
vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-admin')>()),
  Title: () => null,
}));

const mockApiFetch = apiFetch as unknown as Mock;

describe('LiveRunsPage', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('renders a run the API returns', async () => {
    mockApiFetch.mockResolvedValue([LIVE_RUN_BOARD_ENTRY]);
    render(<LiveRunsPage />);

    expect(await screen.findByText(LIVE_RUN_BOARD_ENTRY.chiefComplaint!)).toBeInTheDocument();
    expect(screen.queryByText('No emergency is being run right now.')).not.toBeInTheDocument();
  });

  it('shows the calm empty state when there are no open runs', async () => {
    mockApiFetch.mockResolvedValue([]);
    render(<LiveRunsPage />);

    expect(await screen.findByText('No emergency is being run right now.')).toBeInTheDocument();
  });

  it('shows the empty state, not a crash or a blank page, when the call fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Forbidden'));
    render(<LiveRunsPage />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(await screen.findByText('No emergency is being run right now.')).toBeInTheDocument();
  });
});
