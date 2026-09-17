import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { INEMUnit } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { SetUnitStatusDialog } from './SetUnitStatusDialog';

const i18nProvider = polyglotI18nProvider(messages, 'en');

const unit = (overrides: Partial<INEMUnit> = {}): INEMUnit => ({
  unitId: 'CVCAMPO1',
  station: 'CVCAMPO',
  carId: '12-AB-34',
  unitType: 'AMBULANCE',
  desiredInopCode: '00',
  reportedInopCode: '00',
  reportedActive: null,
  lastSyncedAt: null,
  lastError: null,
  vehicle: { id: 'veh-1', licensePlate: '12-AB-34', numeroCauda: 'CV1' },
  ...overrides,
});

const renderDialog = (props: Partial<ComponentProps<typeof SetUnitStatusDialog>> = {}) => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <SetUnitStatusDialog
        unit={unit()}
        reasons={{ TEPH_Falta: 'Sem Tripulação' }}
        saving={false}
        onConfirm={onConfirm}
        onClose={onClose}
        {...props}
      />
    </AdminContext>,
  );
  return { ...utils, onConfirm, onClose };
};

describe('SetUnitStatusDialog', () => {
  it('renders nothing when there is no unit — the closed state', () => {
    renderDialog({ unit: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('titles itself with the vehicle, not the fleet, so scope is never ambiguous', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toHaveTextContent('Change status — 12-AB-34 – CV1');
  });

  it("keeps a staged edit intact across a re-render for the same unit (e.g. the page's own poll landing mid-edit)", async () => {
    const user = userEvent.setup();
    const { rerender, onConfirm } = renderDialog();

    await user.click(screen.getByRole('checkbox', { name: 'Available' }));
    await user.click(screen.getByLabelText('Reason'));
    await user.click(await screen.findByRole('option', { name: 'No crew' }));

    // A re-render with a *new* object for the *same* unit — e.g. a poll
    // response landing while the crew member is still editing — must not
    // wipe what they've staged.
    rerender(
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <SetUnitStatusDialog
          unit={unit({ desiredInopCode: '00' })}
          reasons={{ TEPH_Falta: 'Sem Tripulação' }}
          saving={false}
          onConfirm={onConfirm}
          onClose={vi.fn()}
        />
      </AdminContext>,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onConfirm).toHaveBeenCalledWith('CVCAMPO1', 'TEPH_Falta');
  });

  it('re-seeds from the new unit once a genuinely different unit opens', () => {
    const { rerender } = renderDialog({ unit: unit({ unitId: 'CVCAMPO1', desiredInopCode: '00' }) });
    expect(screen.getByRole('checkbox', { name: 'Available' })).toBeChecked();

    rerender(
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <SetUnitStatusDialog
          unit={unit({ unitId: 'CVCAMPO2', desiredInopCode: 'TEPH_Falta' })}
          reasons={{ TEPH_Falta: 'Sem Tripulação' }}
          saving={false}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      </AdminContext>,
    );

    expect(screen.getByRole('checkbox', { name: 'Available' })).not.toBeChecked();
  });

  it('disables Cancel and Save while a save is in flight', () => {
    renderDialog({ saving: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
