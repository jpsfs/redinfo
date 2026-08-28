import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AdminContext,
  ResourceContextProvider,
  ResourceDefinitionContextProvider,
  testDataProvider,
} from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { messages } from '../../i18n/i18nProvider';
import { WindowListActions } from './AvailabilityWindowList';
import { apiFetch } from '../../api';
import { renderMobile } from '../../test/renderMobile';

vi.mock('../../api', () => ({
  apiFetch: vi.fn(),
  apiDownload: vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;

// This screen has not gone through #180 phase 3 yet — English by convention.
const i18nProvider = polyglotI18nProvider(messages, 'en');

const RESOURCE_DEFINITIONS = {
  'availability-windows': {
    name: 'availability-windows',
    hasList: true,
    hasCreate: true,
    hasShow: true,
  },
};

/** The toolbar needs the resource to exist for its Create button. */
function renderActions() {
  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <ResourceDefinitionContextProvider definitions={RESOURCE_DEFINITIONS}>
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

  it('says the emergency shortcut is for the Emergency rota', async () => {
    renderActions();

    await userEvent.click(
      screen.getByRole('button', { name: 'New Emergency Availability' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Emergency');
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

describe('WindowListActions — mobile', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(null);
  });

  it('wraps its three actions instead of running them off the toolbar', () => {
    renderMobile(
      <ResourceDefinitionContextProvider definitions={RESOURCE_DEFINITIONS}>
        <ResourceContextProvider value="availability-windows">
          <WindowListActions />
        </ResourceContextProvider>
      </ResourceDefinitionContextProvider>,
      { locale: 'en' },
    );

    expect(
      screen.getByRole('button', { name: 'New Emergency Availability' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Manage holidays')).toBeInTheDocument();
    // A plain Link button, not react-admin's <CreateButton> — that component
    // collapses to a detached, position:fixed floating FAB below `md`, which
    // would float off away from the other two buttons instead of wrapping
    // alongside them.
    expect(screen.getByText('New availability window').closest('a')).toHaveAttribute(
      'href',
      '/availability-windows/create',
    );
  });
});
