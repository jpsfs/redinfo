import { Typography } from '@mui/material';
import { CompensationOfferKind, ResolvedCompensationOffer } from '@redinfo/shared';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import { useT } from '../../i18n/useT';
import { formatEuroCents } from '../../utils/money';

/**
 * The one discreet line money is ever allowed to appear as (#246 Stage 2):
 * volunteering is the norm, so this renders **only** when an offer actually
 * resolves — never a badge, a column, a highlight, or an empty state, and
 * never any money-adjacent wording ("unpaid", "voluntário") when there is
 * none. See this component's own tests, and the callers' regression tests,
 * for the guard on that requirement.
 */
export const CompensationOfferLine = ({
  offer,
  variant = 'body2',
}: {
  offer: ResolvedCompensationOffer | null | undefined;
  variant?: 'body2' | 'caption';
}) => {
  const t = useT();
  const intlLocale = useIntlLocale();
  if (!offer) return null;

  const text =
    offer.kind === CompensationOfferKind.HOURLY
      ? t('compensationOffer.hourly', { amount: formatEuroCents(intlLocale, offer.rateCents ?? 0) })
      : t('compensationOffer.fixed', { amount: formatEuroCents(intlLocale, offer.amountCents ?? 0) });

  return (
    <Typography variant={variant} color="text.secondary" display="block">
      {text}
    </Typography>
  );
};
