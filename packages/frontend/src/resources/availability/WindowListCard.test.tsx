import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { AvailabilityWindow, AvailabilityWindowCategory, AvailabilityWindowStatus } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { WindowListCard } from './WindowListCard';

// This screen has not gone through #180 phase 3 yet — English by convention.
const i18nProvider = polyglotI18nProvider(messages, 'en');

const OPEN_WINDOW: AvailabilityWindow = {
  id: 'w1',
  startDate: '2026-10-01',
  endDate: '2026-10-14',
  category: AvailabilityWindowCategory.EMERGENCY,
  name: 'Emergency - October',
  status: AvailabilityWindowStatus.OPEN,
  openedById: 'u1',
  openedBy: { id: 'u1', firstName: 'Ana', lastName: 'Silva' },
  openedAt: '2026-09-20T10:00:00.000Z',
  closedById: null,
  closedBy: null,
  closedAt: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

function renderCard(window: AvailabilityWindow, onOpen = vi.fn()) {
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <WindowListCard window={window} onOpen={onOpen} />
    </AdminContext>,
  );
  return { onOpen };
}

describe('WindowListCard', () => {
  it('shows the category, name, status and date range', () => {
    renderCard(OPEN_WINDOW);

    expect(screen.getByText('Emergency')).toBeInTheDocument();
    expect(screen.getByText('Emergency - October')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText(/1 Oct 2026/)).toBeInTheDocument();
  });

  it('says who opened it and when', () => {
    renderCard(OPEN_WINDOW);

    expect(screen.getByText(/Opened by: Ana Silva/)).toBeInTheDocument();
  });

  it('omits the closed line for a still-open window', () => {
    renderCard(OPEN_WINDOW);

    expect(screen.queryByText(/Closed by/)).not.toBeInTheDocument();
  });

  it('says who closed it and when, once closed', () => {
    renderCard({
      ...OPEN_WINDOW,
      status: AvailabilityWindowStatus.CLOSED,
      closedById: 'u2',
      closedBy: { id: 'u2', firstName: 'Bruno', lastName: 'Alves' },
      closedAt: '2026-10-15T09:00:00.000Z',
    });

    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText(/Closed by: Bruno Alves/)).toBeInTheDocument();
  });

  it('opens the window on click', () => {
    const { onOpen } = renderCard(OPEN_WINDOW);

    fireEvent.click(screen.getByText('Emergency - October'));

    expect(onOpen).toHaveBeenCalled();
  });
});
