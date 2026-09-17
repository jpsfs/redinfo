import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { AvailabilityWindowCategory } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
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

// This screen has not gone through #180 phase 3 yet — it is still English by
// convention, so a real i18nProvider is pinned to 'en' rather than left
// unset. Unset would fall back to react-admin's own default translate
// (the raw key), which is what `windowCategoryLabel` (used to render a
// duty's window category, e.g. "Emergency") would otherwise render as.
const i18nProvider = polyglotI18nProvider(messages, 'en');
const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <MyDutiesPage />
      </AdminContext>
    </MemoryRouter>,
  );

describe('MyDutiesPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ upcoming: [MY_DUTY], past: [] });
  });

  it('reads the signed-in person own duties', async () => {
    renderPage();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/schedules/me'));
  });

  // AC: "Published schedule is visible to assigned personnel in their personal
  // view, labelled with the window it belongs to and with the role each person
  // is assigned to."
  it('labels a duty with its date, hours, role and window', async () => {
    renderPage();

    expect(await screen.findByText('08:00–16:00')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();
    expect(screen.getByText('Emergency')).toBeInTheDocument();
    expect(screen.getByText('Emergency - October')).toBeInTheDocument();
    // Rendered "Sat" and uppercased by CSS, so the DOM text is the short form.
    expect(screen.getByText('Sat')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Oct 2026')).toBeInTheDocument();
  });

  it('lets you jump from a duty to the schedule it belongs to', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'Emergency - October' });
    expect(link).toHaveAttribute('href', `/schedules/${MY_DUTY.scheduleId}/show`);
  });

  it('names whoever else is on the same shift', async () => {
    mockApiFetch.mockResolvedValue({
      upcoming: [
        { ...MY_DUTY, crewmates: [{ firstName: 'Bruno', lastName: 'Costa', roleName: 'Team Member' }] },
      ],
      past: [],
    });
    renderPage();

    expect(await screen.findByText('With: Bruno Costa')).toBeInTheDocument();
  });

  it('flags a duty whose shift has not reached its minimum crew', async () => {
    mockApiFetch.mockResolvedValue({
      upcoming: [{ ...MY_DUTY, quorumMet: false }],
      past: [],
    });
    renderPage();

    expect(await screen.findByText('Understaffed')).toBeInTheDocument();
  });

  it('does not flag a fully-crewed duty', async () => {
    renderPage();

    expect(await screen.findByText('08:00–16:00')).toBeInTheDocument();
    expect(screen.queryByText('Understaffed')).not.toBeInTheDocument();
  });

  it('shows a duty with no role at all, for a window that defines none', async () => {
    mockApiFetch.mockResolvedValue({
      upcoming: [
        {
          ...MY_DUTY,
          roleName: null,
          windowCategory: AvailabilityWindowCategory.CNE_SUPPORT,
          windowLabel: 'Rally Serra da Estrela',
        },
      ],
      past: [],
    });
    renderPage();

    expect(await screen.findByText('Rally Serra da Estrela')).toBeInTheDocument();
    expect(screen.queryByText('Driver')).not.toBeInTheDocument();
  });

  it('keeps past duties folded away until asked for', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({
      upcoming: [],
      past: [{ ...MY_DUTY, id: 'old-1', date: '2026-09-05', label: '20:00–24:00' }],
    });
    renderPage();

    expect(await screen.findByText('Past duties')).toBeInTheDocument();
    expect(screen.queryByText('20:00–24:00')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /past duties/i }));

    expect(screen.getByText('20:00–24:00')).toBeInTheDocument();
  });

  it('says so plainly when nothing is scheduled yet', async () => {
    mockApiFetch.mockResolvedValue({ upcoming: [], past: [] });
    renderPage();

    expect(await screen.findByText(/No duties scheduled yet/)).toBeInTheDocument();
  });

  it('reports a failure to load', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network unavailable'));
    renderPage();

    expect(await screen.findByText('Network unavailable')).toBeInTheDocument();
  });
});
