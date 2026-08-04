import { formatCurrency } from '../../lib/format';

/**
 * Live "adults x adult fee + children x child fee + markup" calculation — visa's equivalent of
 * quotes' PriceCalcPanel.
 *
 * Client-side only for display; the server recomputes and owns the real sellingPrice, from the
 * fees frozen onto the request rather than from anything sent by the browser.
 */
function VisaPriceCalcPanel({ adultFee, childFee, adultCount, childCount, markupAmount }) {
  const adultRate = Number(adultFee) || 0;
  const childRate = Number(childFee) || 0;
  const adults = Number(adultCount) || 0;
  const children = Number(childCount) || 0;
  const markup = Number(markupAmount) || 0;
  const visaCost = adultRate * adults + childRate * children;
  const total = visaCost + markup;

  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
      <div className="grid grid-cols-2 items-center gap-3 text-center sm:grid-cols-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Visa Fee</p>
          <p className="mt-1 text-sm font-semibold text-neutral-900">
            {formatCurrency(adultRate)} &times; {adults} adult{adults === 1 ? '' : 's'}
          </p>
          {children > 0 && (
            <p className="text-sm font-semibold text-neutral-900">
              {formatCurrency(childRate)} &times; {children} child{children === 1 ? '' : 'ren'}
            </p>
          )}
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
