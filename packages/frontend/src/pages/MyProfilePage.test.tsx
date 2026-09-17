import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CertificationType, User } from '@redinfo/shared';
import { renderMobile } from '../test/renderMobile';
import { MyProfilePage } from './MyProfilePage';
import { apiFetch, apiUpload } from '../api';

vi.mock('../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn(), apiUpload: vi.fn() }));

// A partial mock — real `useTranslate`/`useLocaleState` come through
// (`renderMobile` wires up a real i18nProvider, which the language-switcher
// test below needs), just `Title` and `useNotify` are overridden. `<Title>`
// needs no store here; it renders into a portal target that does not exist
// in the test DOM, which is harmless — same stub used by the other personal
// pages' tests. `useNotify` is a spy so tests can assert on it.
const mockNotify = vi.fn();
vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-admin')>()),
  Title: () => null,
  useNotify: () => mockNotify,
}));

const render = (ui: Parameters<typeof renderMobile>[0]) => renderMobile(ui);

const mockApiFetch = apiFetch as unknown as Mock;
const mockApiUpload = apiUpload as unknown as Mock;

const profile = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    email: 'ana.silva@example.test',
    firstName: 'Ana',
    lastName: 'Silva',
    roles: ['EMERGENCY_OPERATIONAL'],
    isActive: true,
    isDriver: false,
    isActiveEmergencyOperational: true,
    redCrossNumber: '118342',
    volunteerNumber: '27',
    hasPhoto: false,
    phone: null,
    addressLine: null,
    postalCode: null,
    birthDate: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    certifications: [
      {
        id: 'cert-tat',
        userId: 'u-1',
        type: CertificationType.TAT,
        validUntil: '2029-01-01',
        issuedOn: null,
        notes: null,
        hasDocument: false,
        createdById: 'u-coord',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  }) as User;

describe('MyProfilePage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiUpload.mockReset();
    mockNotify.mockReset();
  });

  it('reads the signed-in person own profile', async () => {
    mockApiFetch.mockResolvedValue(profile());
    render(<MyProfilePage />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/users/me/profile'));
    expect(await screen.findByText('Ana Silva')).toBeInTheDocument();
  });

  it('shows a held certification and what it grants, as read-only', async () => {
    mockApiFetch.mockResolvedValue(profile());
    render(<MyProfilePage />);

    expect(await screen.findByText('TAT')).toBeInTheDocument();
    // SBV is granted by the held TAT — shown, but there is no edit control on
    // this page at all: certifications are coordinator-maintained.
    expect(screen.getByText('SBV')).toBeInTheDocument();
    // No add/edit/remove for certifications here — only personal data is
    // self-editable; certifications stay coordinator-maintained.
    const certificationsSection = screen.getByText('As minhas certificações').closest('div');
    expect(certificationsSection).not.toBeNull();
    expect(
      within(certificationsSection as HTMLElement).queryByRole('button'),
    ).not.toBeInTheDocument();
  });

  it('warns about a certification that has already lapsed', async () => {
    mockApiFetch.mockResolvedValue(
      profile({
        isActiveEmergencyOperational: false,
        certifications: [
          {
            id: 'cert-tat',
            userId: 'u-1',
            type: CertificationType.TAT,
            validUntil: '2020-01-01',
            issuedOn: null,
            notes: null,
            hasDocument: false,
            createdById: 'u-coord',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );
    render(<MyProfilePage />);

    expect(await screen.findByText('Não operacional')).toBeInTheDocument();
    expect(screen.getByText(/Continua a ter acesso/i)).toBeInTheDocument();
  });

  it('says why when the profile cannot be loaded', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    render(<MyProfilePage />);

    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });

  it('lets the person edit and save their own contact details', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(profile());
    render(<MyProfilePage />);

    await user.click(await screen.findByRole('button', { name: /editar|edit/i }));

    const phoneField = screen.getByLabelText(/^telefone$|^phone$/i);
    await user.clear(phoneField);
    await user.type(phoneField, '912345678');

    mockApiFetch.mockResolvedValueOnce(profile({ phone: '912345678' }));
    await user.click(screen.getByRole('button', { name: /guardar|save/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/users/me/profile',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ phone: '912345678' }),
        }),
      ),
    );
    expect(await screen.findByText('912345678')).toBeInTheDocument();
  });

  it('uploads a chosen photo to their own profile', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(profile());
    render(<MyProfilePage />);
    await screen.findByText('Ana Silva');

    mockApiUpload.mockResolvedValueOnce(profile({ hasPhoto: true }));
    const file = new File(['bytes'], 'ana.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByTestId('photo-input'), file);

    await waitFor(() => expect(mockApiUpload).toHaveBeenCalledWith('/users/me/photo', file));
    expect(mockNotify).toHaveBeenCalledWith('Foto atualizada', { type: 'success' });
  });

  it('removes their own photo', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(profile({ hasPhoto: true }));
    render(<MyProfilePage />);
    await screen.findByText('Ana Silva');

    mockApiFetch.mockResolvedValueOnce(profile({ hasPhoto: false }));
    await user.click(screen.getByRole('button', { name: 'Remover' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/users/me/photo', { method: 'DELETE' }),
    );
    expect(mockNotify).toHaveBeenCalledWith('Foto removida', { type: 'info' });
  });

  describe('the language switcher', () => {
    it('PATCHes the choice and switches immediately, with no reload', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce(profile());
      render(<MyProfilePage />);
      await screen.findByText('As minhas certificações');

      // The PATCH, then — because `setLocale` re-keys `I18nContextProvider`
      // and remounts the whole tree — a second `load()` from the remounted
      // page's own `useEffect`.
      mockApiFetch.mockResolvedValueOnce(profile({ locale: 'en' }));
      mockApiFetch.mockResolvedValueOnce(profile({ locale: 'en' }));
      await user.click(screen.getByRole('button', { name: 'English' }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/users/me/profile',
          expect.objectContaining({ method: 'PATCH', body: { locale: 'en' } }),
        ),
      );
      // The whole tree re-renders in the new language — not just the switcher.
      expect(await screen.findByText('My certifications')).toBeInTheDocument();
    });

    it('still switches for this session when the PATCH fails, with a warning', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce(profile());
      render(<MyProfilePage />);
      await screen.findByText('As minhas certificações');

      mockApiFetch.mockRejectedValueOnce(new Error('Network error'));
      // The remount's own re-fetch, after the switch goes ahead anyway.
      mockApiFetch.mockResolvedValueOnce(profile());
      await user.click(screen.getByRole('button', { name: 'English' }));

      expect(await screen.findByText('My certifications')).toBeInTheDocument();
      expect(mockNotify).toHaveBeenCalledWith(
        'Não foi possível guardar a preferência, mas o idioma muda nesta sessão.',
        { type: 'warning' },
      );
    });
  });
});
