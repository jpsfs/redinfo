import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CertificationType, User } from '@redinfo/shared';
import { MyProfilePage } from './MyProfilePage';
import { apiFetch, apiUpload } from '../api';

vi.mock('../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn(), apiUpload: vi.fn() }));

// react-admin's <Title> needs no store here; it renders into a portal target
// that does not exist in the test DOM, which is harmless — same stub used by
// the other personal pages' tests.
const mockNotify = vi.fn();
vi.mock('react-admin', () => ({ Title: () => null, useNotify: () => mockNotify }));

const mockApiFetch = apiFetch as unknown as Mock;
const mockApiUpload = apiUpload as unknown as Mock;

const profile = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    email: 'ana.silva@example.test',
    firstName: 'Ana',
    lastName: 'Silva',
    role: 'EMERGENCY_OPERATIONAL',
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
});
