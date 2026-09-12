import { describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { AuthProvider, User } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { BulkHoursDialog } from './BulkHoursDialog';
import { apiFetch } from '../../api';

vi.mock('../../api', () => ({ apiFetch: vi.fn() }));

const mockApiFetch = apiFetch as unknown as Mock;
const i18nProvider = polyglotI18nProvider(messages, 'en');

const person = (overrides: Partial<User>): User =>
  ({
    id: 'u-x',
    email: 'x@example.test',
    firstName: 'X',
    lastName: 'Y',
    roles: [],
    provider: AuthProvider.LOCAL,
    isActive: true,
    isPaidStaff: false,
    isDriver: false,
    isActiveEmergencyOperational: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as User;

const renderDialog = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <BulkHoursDialog open onClose={() => {}} onSuccess={() => {}} />
    </AdminContext>,
  );

// #245 — a paid staffer can still volunteer off the clock, so the picker
// must not hide them by a blanket isPaidStaff rule (that would just be
// #223's superseded assumption re-appearing in the UI).
describe('BulkHoursDialog — volunteer picker (#245)', () => {
  it('offers a paid staff member alongside a volunteer, not just the volunteer', async () => {
    mockApiFetch.mockResolvedValue({
      data: [
        person({ id: 'u-paid', firstName: 'Paula', lastName: 'Paid', isPaidStaff: true }),
        person({ id: 'u-vol', firstName: 'Vera', lastName: 'Volunteer', isPaidStaff: false }),
      ],
      total: 2,
    });

    renderDialog();

    await waitFor(() => expect(screen.getByText('Vera Volunteer')).toBeInTheDocument());
    expect(screen.getByText('Paula Paid')).toBeInTheDocument();
  });
});
