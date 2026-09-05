import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CertificationType, User, UserRole } from '@redinfo/shared';
import { UserShow } from './UserShow';
import { apiDownload, apiFetch, apiUpload } from '../../api';
import { messages } from '../../i18n/i18nProvider';

vi.mock('../../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn(), apiUpload: vi.fn() }));

// This screen has not gone through #180 phase 3's Portuguese rollout yet —
// its tests still read in English, so a real i18nProvider is pinned to 'en'
// rather than left unset (see `MyDutiesPage.test.tsx` for the same pattern).
const i18nProvider = polyglotI18nProvider(messages, 'en');

const mockApiFetch = apiFetch as unknown as Mock;
const mockApiUpload = apiUpload as unknown as Mock;
const mockApiDownload = apiDownload as unknown as Mock;

const person = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    email: 'ana.silva@example.test',
    firstName: 'Ana',
    lastName: 'Silva',
    roles: [UserRole.EMERGENCY_OPERATIONAL],
    provider: 'LOCAL',
    isActive: true,
    isDriver: false,
    isActiveEmergencyOperational: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    certifications: [
      {
        id: 'cert-tas',
        userId: 'u-1',
        type: CertificationType.TAS,
        validUntil: '2029-03-14',
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

function renderShow(record: User, roles: UserRole[] = [UserRole.EMERGENCY_COORDINATOR]) {
  const dataProvider = testDataProvider({
    getOne: vi.fn(() => Promise.resolve({ data: record })) as never,
  });
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(roles),
  };

  render(
    <MemoryRouter initialEntries={[`/users/${record.id}/show`]}>
      <AdminContext dataProvider={dataProvider} authProvider={authProvider} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="users">
          <Routes>
            <Route path="/users/:id/show" element={<UserShow />} />
          </Routes>
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

// ── A person's record — the certifications panel a coordinator maintains ──────

describe('UserShow', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiUpload.mockReset();
    mockApiDownload.mockReset();
  });

  it('shows the held certification and the ones it grants', async () => {
    renderShow(person());

    await waitFor(() => expect(screen.getAllByText('TAS').length).toBeGreaterThan(0));
    // TAS is held directly; TAT and SBV appear as granted by it.
    expect(screen.getByText(/Also granted by the above/)).toBeInTheDocument();
    expect(screen.getByText(/^TAT/)).toBeInTheDocument();
    expect(screen.getByText(/^SBV/)).toBeInTheDocument();
  });

  it('shows the administrative full name without replacing the first/last name header', async () => {
    renderShow(person({ fullName: 'Ana Maria Silva Ferreira' }));

    expect(await screen.findByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Ana Maria Silva Ferreira')).toBeInTheDocument();
  });

  it('says so when nobody has recorded anything', async () => {
    renderShow(person({ certifications: [] }));
    expect(await screen.findByText('No certifications on file.')).toBeInTheDocument();
  });

  it('offers Add/Edit/Remove to a coordinator', async () => {
    renderShow(person(), [UserRole.EMERGENCY_COORDINATOR]);

    expect(await screen.findByRole('button', { name: /add certification/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
  });

  it('hides certification management from someone without MANAGE_PERSONNEL', async () => {
    renderShow(person(), [UserRole.EMERGENCY_OPERATIONAL]);

    await waitFor(() => expect(screen.getAllByText('TAS').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /add certification/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it('opens the add-certification dialog offering only types not already held', async () => {
    const user = userEvent.setup();
    renderShow(person());

    await user.click(await screen.findByRole('button', { name: /add certification/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Add certification')).toBeInTheDocument();
    // TAS is already held, so it must not be offered again for a new record.
    await user.click(within(dialog).getByRole('combobox', { name: 'Certification' }));
    expect(screen.queryByRole('option', { name: 'TAS' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Driver' })).toBeInTheDocument();
  });

  it('removes a certification after confirming', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApiFetch.mockResolvedValue(undefined);
    renderShow(person());

    await user.click(await screen.findByRole('button', { name: /^remove$/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/users/u-1/certifications/cert-tas', {
        method: 'DELETE',
      }),
    );
  });

  it('marks someone with no valid TAT/TAS as not operational', async () => {
    renderShow(person({ isActiveEmergencyOperational: false, certifications: [] }));
    expect(await screen.findByText('Not operational')).toBeInTheDocument();
  });
});

// ── Photo — a coordinator manages someone else's from their record ────────────

describe('UserShow — photo', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiUpload.mockReset();
  });

  it('offers a coordinator a way to change or remove the photo', async () => {
    renderShow(person());
    expect(await screen.findByRole('button', { name: 'Change photo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
  });

  it('offers Remove once a photo is on file', async () => {
    renderShow(person({ hasPhoto: true }));
    expect(await screen.findByRole('button', { name: 'Remove photo' })).toBeInTheDocument();
  });

  it('hides photo management from someone without MANAGE_PERSONNEL', async () => {
    renderShow(person(), [UserRole.EMERGENCY_OPERATIONAL]);
    await screen.findByText('Ana Silva');
    expect(screen.queryByRole('button', { name: 'Change photo' })).not.toBeInTheDocument();
  });

  it("uploads a chosen photo to the person's record", async () => {
    const user = userEvent.setup();
    mockApiUpload.mockResolvedValue(person({ hasPhoto: true }));
    renderShow(person());

    const file = new File(['bytes'], 'ana.jpg', { type: 'image/jpeg' });
    await user.upload(await screen.findByTestId('photo-input'), file);

    await waitFor(() => expect(mockApiUpload).toHaveBeenCalledWith('/users/u-1/photo', file));
  });

  it('removes the photo on file', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(person({ hasPhoto: false }));
    renderShow(person({ hasPhoto: true }));

    await user.click(await screen.findByRole('button', { name: 'Remove photo' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/users/u-1/photo', { method: 'DELETE' }),
    );
  });
});

// ── Certification document — attached, replaced, downloaded, removed ──────────

describe('UserShow — certification document', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiUpload.mockReset();
    mockApiDownload.mockReset();
  });

  it('offers a coordinator a way to attach a document to a bare certification', async () => {
    renderShow(person());
    expect(await screen.findByRole('button', { name: /attach document/i })).toBeInTheDocument();
  });

  it('hides the attach control from someone without MANAGE_PERSONNEL, since there is nothing to open', async () => {
    renderShow(person(), [UserRole.EMERGENCY_OPERATIONAL]);
    await waitFor(() => expect(screen.getAllByText('TAS').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /attach document/i })).not.toBeInTheDocument();
  });

  it('uploads the chosen document to the right certification', async () => {
    const user = userEvent.setup();
    const record = person();
    mockApiUpload.mockResolvedValue(record.certifications![0]);
    renderShow(record);

    await screen.findByRole('button', { name: /attach document/i });
    const file = new File(['bytes'], 'certificado.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByTestId('certification-document-input-cert-tas'), file);

    await waitFor(() =>
      expect(mockApiUpload).toHaveBeenCalledWith('/users/u-1/certifications/cert-tas/document', file),
    );
  });

  it('offers Open, Replace and Remove document once one is attached', async () => {
    const record = person({
      certifications: [
        {
          id: 'cert-tas',
          userId: 'u-1',
          type: CertificationType.TAS,
          validUntil: '2029-03-14',
          issuedOn: null,
          notes: null,
          hasDocument: true,
          filename: 'certificado.pdf',
          createdById: 'u-coord',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    renderShow(record);

    expect(await screen.findByRole('button', { name: 'certificado.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove document' })).toBeInTheDocument();
  });

  it('downloads the document via the authenticated endpoint', async () => {
    const user = userEvent.setup();
    const record = person({
      certifications: [
        {
          id: 'cert-tas',
          userId: 'u-1',
          type: CertificationType.TAS,
          validUntil: '2029-03-14',
          issuedOn: null,
          notes: null,
          hasDocument: true,
          filename: 'certificado.pdf',
          createdById: 'u-coord',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    renderShow(record);

    await user.click(await screen.findByRole('button', { name: 'certificado.pdf' }));

    expect(mockApiDownload).toHaveBeenCalledWith(
      '/users/u-1/certifications/cert-tas/document',
      'certificado.pdf',
    );
  });

  it('removes just the document, not the certification', async () => {
    const user = userEvent.setup();
    const record = person({
      certifications: [
        {
          id: 'cert-tas',
          userId: 'u-1',
          type: CertificationType.TAS,
          validUntil: '2029-03-14',
          issuedOn: null,
          notes: null,
          hasDocument: true,
          filename: 'certificado.pdf',
          createdById: 'u-coord',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    mockApiFetch.mockResolvedValue({ ...record.certifications![0], hasDocument: false });
    renderShow(record);

    await user.click(await screen.findByRole('button', { name: 'Remove document' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/users/u-1/certifications/cert-tas/document', {
        method: 'DELETE',
      }),
    );
  });

  it('lets someone without MANAGE_PERSONNEL still open an attached document', async () => {
    const record = person({
      certifications: [
        {
          id: 'cert-tas',
          userId: 'u-1',
          type: CertificationType.TAS,
          validUntil: '2029-03-14',
          issuedOn: null,
          notes: null,
          hasDocument: true,
          filename: 'certificado.pdf',
          createdById: 'u-coord',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    renderShow(record, [UserRole.EMERGENCY_OPERATIONAL]);

    expect(await screen.findByRole('button', { name: 'certificado.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove document' })).not.toBeInTheDocument();
  });
});
