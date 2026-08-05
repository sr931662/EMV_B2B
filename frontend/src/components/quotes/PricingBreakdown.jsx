import { formatCurrency } from '../../lib/format';

/** Authoritative pricing record from the server — unlike PriceCalcPanel, this never recomputes. */
function PricingBreakdown({
  rawPriceAtQuote,
  childRawPriceAtQuote,
  adults,
  childCount: childCountProp,
  markupAmount,
  sellingPrice,
}) {
  const adultRate = Number(rawPriceAtQuote) || 0;
  const childRate = Number(childRawPriceAtQuote) || 0;
  const adultCount = Number(adults) || 0;
  const childCount = Number(childCountProp) || 0;

  const wholesale = adultRate * adultCount + childRate * childCount;

  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
      {(adultCount > 0 || childCount > 0) && (
        <p className="mb-3 text-center text-[12px] text-neutral-500">
          {adultCount} adult{adultCount === 1 ? '' : 's'} × {formatCurrency(adultRate)}
          {childCount > 0 && ` + ${childCount} child${childCount === 1 ? '' : 'ren'} × ${formatCurrency(childRate)}`}
        </p>
      )}
      <div className="grid grid-cols-3 items-center gap-2 text-center sm:gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">TravNexa Cost</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{formatCurrency(wholesale)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            + Your Markup
          </p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{formatCurrency(markupAmount)}</p>
        </div>
        <div className="rounded-lg bg-primary-600 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-100">
            = Customer Price
          </p>
          <p className="mt-1 text-lg font-bold text-white">{formatCurrency(sellingPrice)}</p>
        </div>
      </div>
    </div>
  );
}

export default PricingBreakdown;
