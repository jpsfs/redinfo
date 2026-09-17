import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, ListContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { messages } from '../../i18n/i18nProvider';
import { ScheduleFilterBar } from './ScheduleList';

const i18nProvider = polyglotI18nProvider(messages, 'en');

/** Enough of `useListController`'s result for `ScheduleFilterBar` to read and call. */
type PartialListContext = Parameters<typeof ListContextProvider>[0]['value'];

function renderFilterBar(filterValues: Record<string, unknown> = {}) {
  const setFilters = vi.fn();
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <ListContextProvider
        value={
          { filterValues, setFilters, displayedFilters: {} } as unknown as PartialListContext
        }
      >
        <ScheduleFilterBar />
      </ListContextProvider>
    </AdminContext>,
  );
  return { setFilters };
}

describe('ScheduleFilterBar', () => {
  it('shows All as selected when no status filter has been set', () => {
    renderFilterBar({});
    expect(screen.getByRole('button', { name: 'All' })).toHaveClass('MuiChip-filled');
    expect(screen.getByRole('button', { name: 'Draft' })).toHaveClass('MuiChip-outlined');
    expect(screen.getByRole('button', { name: 'Published' })).toHaveClass('MuiChip-outlined');
  });

  it('switches to Published without dropping the category filter', async () => {
    const { setFilters } = renderFilterBar({ category: 'EMERGENCY' });

    await userEvent.click(screen.getByRole('button', { name: 'Published' }));

    expect(setFilters).toHaveBeenCalledWith(
      { category: 'EMERGENCY', status: 'PUBLISHED' },
      {},
    );
  });

  it('sets an empty status rather than removing it, so All does not get stuck', async () => {
    const { setFilters } = renderFilterBar({ status: 'PUBLISHED' });

    await userEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(setFilters).toHaveBeenCalledWith({ status: '' }, {});
  });

  it('picking a category preserves the status filter', async () => {
    const { setFilters } = renderFilterBar({ status: 'DRAFT' });

    await userEvent.click(screen.getByRole('button', { name: 'Emergency' }));

    expect(setFilters).toHaveBeenCalledWith({ status: 'DRAFT', category: 'EMERGENCY' }, {});
  });

  it('clearing the category keeps the rest of the filters', async () => {
    const { setFilters } = renderFilterBar({ status: 'DRAFT', category: 'EMERGENCY' });

    await userEvent.click(screen.getByRole('button', { name: 'All categories' }));

    expect(setFilters).toHaveBeenCalledWith({ status: 'DRAFT' }, {});
  });
});
