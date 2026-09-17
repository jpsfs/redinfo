import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { CompensationOfferKind } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { CompensationOfferLine } from './CompensationOfferLine';

const i18nProvider = polyglotI18nProvider(messages, 'en');

function renderLine(offer: Parameters<typeof CompensationOfferLine>[0]['offer']) {
  return render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <CompensationOfferLine offer={offer} />
    </AdminContext>,
  );
}

describe('CompensationOfferLine', () => {
  it('renders nothing when there is no offer', () => {
    const { container } = renderLine(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the offer is undefined', () => {
    const { container } = renderLine(undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an hourly offer as a rate', () => {
    renderLine({ kind: CompensationOfferKind.HOURLY, rateCents: 500, amountCents: null });
    expect(screen.getByText('€5.00 / hour')).toBeInTheDocument();
  });

  it('renders a fixed offer as a per-person, per-shift amount', () => {
    renderLine({ kind: CompensationOfferKind.FIXED, rateCents: null, amountCents: 2500 });
    expect(screen.getByText('€25.00, per person, per shift')).toBeInTheDocument();
  });
});
