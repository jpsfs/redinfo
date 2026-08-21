import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AdminContext,
  ResourceContextProvider,
  ResourceDefinitionContextProvider,
  testDataProvider,
} from 'react-admin';
import { MemoryRouter } from 'react-router-dom';
import { WindowListActions } from './AvailabilityWindowList';
import { apiFetch } from '../../api';

vi.mock('../../api', () => ({
  apiFetch: vi.fn(),
  apiDownload: vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;

/** The toolbar needs the resource to exist for its Create button. */
function renderActions() {
  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()}>
        <ResourceDefinitionContextProvider
          definitions={{
            'availability-windows': {
              name: 'availability-windows',
              hasList: true,
              hasCreate: true,
              hasShow: true,
            },
          }}
        >
          <ResourceContextProvider value="availability-windows">
            <WindowListActions />
          </ResourceContextProvider>
        </ResourceDefinitionContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

describe('WindowListActions', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(null);
  });

  it('offers both ways to open a window, plus the holiday list', () => {
    renderActions();

    expect(
      screen.getByRole('button', { name: 'New Emergency Availability' }),
    ).toBeInTheDocument();
    expect(screen.getByText('New availability window')).toBeInTheDocument();
    expect(screen.getByText('Manage holidays')).toBeInTheDocument();
  });

  it('links the full editor to the create route', () => {
    renderActions();

    expect(screen.getByText('New availability window').closest('a')).toHaveAttribute(
      'href',
      '/availability-windows/create',
    );
  });

  it('opens the month shortcut in a dialog, without navigating', async () => {
    renderActions();

    await userEvent.click(
      screen.getByRole('button', { name: 'New Emergency Availability' }),
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('New emergency availability')).toBeInTheDocument();
    expect(screen.getByLabelText('Month')).toBeInTheDocument();
  });

  it('closes the dialog on cancel', async () => {
    renderActions();

    await userEvent.click(
      screen.getByRole('button', { name: 'New Emergency Availability' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    // The dialog unmounts after its exit transition.
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'));
  });
});
