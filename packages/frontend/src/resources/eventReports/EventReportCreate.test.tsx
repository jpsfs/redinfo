import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { EventReportType } from '@redinfo/shared';
import { EventReportCreate } from './EventReportCreate';
import { apiFetch } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { messages } from '../../i18n/i18nProvider';
import { emptyDraft, loadDraft, saveDraft } from './reportDraft';

vi.mock('../../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn() }));
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: vi.fn(() => true) }));

// Pinned to 'pt' rather than the app's own locale-detecting singleton: jsdom
// reports `en-US`, which would otherwise render this screen in English and
// break every Portuguese assertion below.
const i18nProvider = polyglotI18nProvider(messages, 'pt');

const mockApiFetch = apiFetch as unknown as Mock;

function renderCreate() {
  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <EventReportCreate />
      </AdminContext>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  (useIsMobile as unknown as Mock).mockReturnValue(true);
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/event-reports/crew-candidates')) return Promise.resolve([]);
    if (path.startsWith('/event-reports/crew-suggestion')) {
      return Promise.resolve({ suggested: null, recent: [] });
    }
    if (path.startsWith('/vehicles')) return Promise.resolve({ data: [] });
    if (path.startsWith('/hospitals/picker')) return Promise.resolve([]);
    return Promise.resolve({});
  });
});

// ── Choosing what kind of report this is ───────────────────────────────────────
//
// A screen of its own, because the answer changes what the form *is* — how many
// steps, whether it asks for a chronology, how many vehicles. Asking first
// means fields never appear and disappear underneath the crew.

describe('the type chooser', () => {
  it('offers all three kinds, each with a one-line explanation', () => {
    renderCreate();

    expect(screen.getByText('Emergência')).toBeInTheDocument();
    expect(screen.getByText('Apoio Local')).toBeInTheDocument();
    expect(screen.getByText('Apoio SALOP')).toBeInTheDocument();
    expect(screen.getByText('Ocorrência com número CODU')).toBeInTheDocument();
  });

  it('opens the form on the type that was chosen', async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.click(screen.getByTestId(`choose-${EventReportType.LOCAL_SUPPORT}`));

    // The form's own chrome, and the step count that belongs to this type.
    expect(await screen.findByText('Quando e onde')).toBeInTheDocument();
    expect(screen.getByText('1 de 7')).toBeInTheDocument();
  });

  it('opens an emergency with its ten steps', async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.click(screen.getByTestId(`choose-${EventReportType.EMERGENCY}`));

    expect(await screen.findByText('1 de 10')).toBeInTheDocument();
  });

  it('does not offer a draft when there is none', () => {
    renderCreate();
    expect(screen.queryByText(/rascunho por terminar/i)).not.toBeInTheDocument();
  });
});

describe('an unfinished draft', () => {
  beforeEach(() => {
    saveDraft(
      { ...emptyDraft(EventReportType.LOCAL_SUPPORT), localityId: 'loc-resumed' },
      'vehicles',
    );
  });

  it('is offered rather than silently resumed', () => {
    // The crew may have moved on to a different call; quietly reopening
    // yesterday's half-report would be worse than asking.
    renderCreate();

    const banner = screen.getByText(/rascunho por terminar/i).closest('.MuiAlert-root');
    expect(banner).toBeInTheDocument();
    // The banner names the kind of report, so the crew knows what they would
    // be going back to. ("Apoio Local" also appears as a chooser tile.)
    expect(banner).toHaveTextContent('Apoio Local');
    expect(screen.getByRole('button', { name: /continuar/i })).toBeInTheDocument();
  });

  it('picks up where it was left, on the same step', async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.click(screen.getByRole('button', { name: /continuar/i }));

    expect(await screen.findByText('Viaturas e quilómetros')).toBeInTheDocument();
    expect(screen.getByText('3 de 7')).toBeInTheDocument();
  });

  it('can be thrown away, leaving the chooser', async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.click(screen.getByRole('button', { name: /apagar rascunho/i }));

    expect(loadDraft()).toBeNull();
    expect(screen.queryByText(/rascunho por terminar/i)).not.toBeInTheDocument();
    // Still on the chooser, ready to start something else.
    expect(screen.getByText('Emergência')).toBeInTheDocument();
  });

  it('starting a fresh report of another type does not resume it', async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.click(screen.getByTestId(`choose-${EventReportType.EMERGENCY}`));

    expect(await screen.findByText('1 de 10')).toBeInTheDocument();
  });
});
