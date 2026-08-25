import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvailabilityWindowCategory } from '@redinfo/shared';
import { MyDutiesPage } from './MyDutiesPage';
import { apiFetch } from '../api';
import { MY_DUTY } from '../test/fixtures';

vi.mock('../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn() }));

// react-admin's <Title> needs no store here; it renders into a portal target
// that does not exist in the test DOM, which is harmless.
vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-admin')>()),
  Title: () => null,
}));

const mockApiFetch = apiFetch as unknown as Mock;

describe('MyDutiesPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ upcoming: [MY_DUTY], past: [] });
  });

  it('reads the signed-in person own duties', async () => {
    render(<MyDutiesPage />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/schedules/me'));
  });

  // AC: "Published schedule is visible to assigned personnel in their personal
  // view, labelled with the window it belongs to and with the role each person
  // is assigned to."
  it('labels a duty with its date, hours, role and window', async () => {
    render(<MyDutiesPage />);

    expect(await screen.findByText('08:00–16:00')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();
    expect(screen.getByText('Emergency')).toBeInTheDocument();
    expect(screen.getByText('Emergency - October')).toBeInTheDocument();
    // Rendered "Sat" and uppercased by CSS, so the DOM text is the short form.
    expect(screen.getByText('Sat')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Oct 2026')).toBeInTheDocument();
  });

  it('says how many vehicles the shift crews', async () => {
    render(<MyDutiesPage />);

    expect(await screen.findByText('2 vehicles')).toBeInTheDocument();
  });

  it('shows a duty with no role at all, for a window that defines none', async () => {
    mockApiFetch.mockResolvedValue({
      upcoming: [
        {
          ...MY_DUTY,
          roleName: null,
          windowCategory: AvailabilityWindowCategory.SALOP_SUPPORT,
          windowLabel: 'Rally Serra da Estrela',
        },
      ],
      past: [],
    });
    render(<MyDutiesPage />);

    expect(await screen.findByText('Rally Serra da Estrela')).toBeInTheDocument();
    expect(screen.queryByText('Driver')).not.toBeInTheDocument();
  });

  it('keeps past duties folded away until asked for', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({
      upcoming: [],
      past: [{ ...MY_DUTY, id: 'old-1', date: '2026-09-05', label: '20:00–24:00' }],
    });
    render(<MyDutiesPage />);

    expect(await screen.findByText('Past duties')).toBeInTheDocument();
    expect(screen.queryByText('20:00–24:00')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /past duties/i }));

    expect(screen.getByText('20:00–24:00')).toBeInTheDocument();
  });

  it('says so plainly when nothing is scheduled yet', async () => {
    mockApiFetch.mockResolvedValue({ upcoming: [], past: [] });
    render(<MyDutiesPage />);

    expect(await screen.findByText(/No duties scheduled yet/)).toBeInTheDocument();
  });

  it('reports a failure to load', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network unavailable'));
    render(<MyDutiesPage />);

    expect(await screen.findByText('Network unavailable')).toBeInTheDocument();
  });
});
