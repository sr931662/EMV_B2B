import { formatCurrency } from '../../lib/format';

/**
 * Live "your profit" calculation — the emotional core of the quote form. Client-side only for
 * display; the server recomputes and owns the real sellingPrice, using the exact same formula
 * (adults × adultRawPrice + children × childRawPrice + markup) so this preview never disagrees
 * with what the quote actually saves as.
 */
function PriceCalcPanel({ adultRawPrice, childRawPrice, adults, childCount: childCountProp, markupAmount }) {
  const adultRate = Number(adultRawPrice) || 0;
  const childRate = Number(childRawPrice) || 0;
  const adultCount = Number(adults) || 0;
  const childCount = Number(childCountProp) || 0;
  const markup = Number(markupAmount) || 0;

  const wholesale = adultRate * adultCount + childRate * childCount;
  const total = wholesale + markup;

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
