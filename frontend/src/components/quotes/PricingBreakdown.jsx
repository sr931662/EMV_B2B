import { formatCurrency } from '../../lib/format';

/** Authoritative pricing record from the server — unlike PriceCalcPanel, this never recomputes. */
function PricingBreakdown({ rawPriceAtQuote, markupAmount, sellingPrice }) {
  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
      <div className="grid grid-cols-3 items-center gap-2 text-center sm:gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">TravNexa Cost</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{formatCurrency(rawPriceAtQuote)}</p>
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
