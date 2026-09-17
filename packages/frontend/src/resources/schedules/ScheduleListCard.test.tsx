import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import {
  AvailabilityWindowCategory,
  AvailabilityWindowStatus,
  Schedule,
  ScheduleStatus,
} from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { ScheduleListCard } from './ScheduleListCard';

const i18nProvider = polyglotI18nProvider(messages, 'en');

const DRAFT_SCHEDULE: Schedule = {
  id: 's1',
  windowId: 'w1',
  window: {
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
  },
  status: ScheduleStatus.DRAFT,
  createdById: 'u1',
  createdBy: { id: 'u1', firstName: 'Ana', lastName: 'Silva' },
  createdAt: '2026-09-20T10:00:00.000Z',
  publishedById: null,
  publishedBy: null,
  publishedAt: null,
  updatedAt: '2026-09-20T10:00:00.000Z',
  stats: {
    requiredSlots: 10,
    filledSlots: 4,
    shiftsWithGaps: 3,
    overrideCount: 0,
    certificationExceptionCount: 0,
    lapsedCertificationCount: 0,
  },
};

function renderCard(schedule: Schedule, onOpen = vi.fn()) {
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <ScheduleListCard schedule={schedule} onOpen={onOpen} />
    </AdminContext>,
  );
  return { onOpen };
}

describe('ScheduleListCard', () => {
  it('shows the category, window name, status and date range', () => {
    renderCard(DRAFT_SCHEDULE);

    expect(screen.getByText('Emergency')).toBeInTheDocument();
    expect(screen.getByText('Emergency - October')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText(/1 Oct 2026/)).toBeInTheDocument();
  });

  it('shows the fill count and gap flags', () => {
    renderCard(DRAFT_SCHEDULE);

    expect(screen.getByText('4 / 10')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('omits the published line for a draft', () => {
    renderCard(DRAFT_SCHEDULE);

    expect(screen.queryByText(/Published by/)).not.toBeInTheDocument();
  });

  it('says who published it and when, once published', () => {
    renderCard({
      ...DRAFT_SCHEDULE,
      status: ScheduleStatus.PUBLISHED,
      publishedById: 'u2',
      publishedBy: { id: 'u2', firstName: 'Bruno', lastName: 'Alves' },
      publishedAt: '2026-09-25T09:00:00.000Z',
    });

    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText(/Published by: Bruno Alves/)).toBeInTheDocument();
  });

  it('opens the schedule on click', () => {
    const { onOpen } = renderCard(DRAFT_SCHEDULE);

    fireEvent.click(screen.getByText('Emergency - October'));

    expect(onOpen).toHaveBeenCalled();
  });
});
