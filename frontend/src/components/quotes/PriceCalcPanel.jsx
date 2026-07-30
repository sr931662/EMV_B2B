import { formatCurrency } from '../../lib/format';

/** Live "your profit" calculation — the emotional core of the quote form. Client-side only for
 * display; the server recomputes and owns the real sellingPrice. */
function PriceCalcPanel({ rawPrice, markupAmount }) {
  const raw = Number(rawPrice) || 0;
  const markup = Number(markupAmount) || 0;
  const total = raw + markup;

  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
      <div className="grid grid-cols-3 items-center gap-2 text-center sm:gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">TravNexa Cost</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{formatCurrency(raw)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            + Your Markup
          </p>
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

export default PriceCalcPanel;
