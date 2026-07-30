import { formatCurrency } from '../../lib/format';

/** Live "fee x passengers + markup" calculation — visa's equivalent of quotes' PriceCalcPanel.
 * Client-side only for display; the server recomputes and owns the real sellingPrice. */
function VisaPriceCalcPanel({ baseFee, passengerCount, markupAmount }) {
  const fee = Number(baseFee) || 0;
  const count = Number(passengerCount) || 0;
  const markup = Number(markupAmount) || 0;
  const visaCost = fee * count;
  const total = visaCost + markup;

  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
      <div className="grid grid-cols-2 items-center gap-3 text-center sm:grid-cols-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Visa Fee</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">
            {formatCurrency(fee)} &times; {count}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Visa Cost</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{formatCurrency(visaCost)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">+ Your Markup</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{formatCurrency(markup)}</p>
        </div>
        <div className="rounded-lg bg-primary-600 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-100">
            = Customer Pays
          </p>
          <p className="mt-1 text-lg font-bold text-white">{formatCurrency(total)}</p>
        </div>
      </div>
    </div>
  );
}

export default VisaPriceCalcPanel;
