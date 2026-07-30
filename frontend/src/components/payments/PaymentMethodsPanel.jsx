import { Card } from '../ui';
import { formatCurrency } from '../../lib/format';

// TODO: there is no backend endpoint for the wholesaler's receiving payment details yet — these
// are placeholder values. Once a system-settings screen exists, fetch them from there instead of
// hardcoding here.
const PAYMENT_METHODS = {
  upiId: 'travnexaglobal@upi',
  bankAccountName: 'TravNexa Global Pvt Ltd',
  bankAccountNumber: '000123456789',
  bankIfsc: 'HDFC0001234',
  bankName: 'HDFC Bank, Mumbai',
};

/** The wholesaler's "how to pay" reference block — UPI + bank transfer details, with an optional
 * amount-due headline (visa payments have no fixed reference price, unlike package quotes). */
function PaymentMethodsPanel({ amountDue }) {
  return (
    <Card>
      {amountDue != null && (
        <div className="mb-4 text-center">
          <p className="text-sm text-neutral-500">Pay the amount below to the account details shown</p>
          <p className="mt-1 text-3xl font-bold text-neutral-900">{formatCurrency(amountDue)}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col items-center gap-3 rounded-lg border border-neutral-200 p-4">
          <div
            aria-label="Sample payment QR code"
            className="flex h-32 w-32 items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 text-center text-xs text-neutral-400"
          >
            Sample QR
            <br />
            (placeholder)
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">UPI ID</p>
            <p className="font-mono text-sm font-medium text-neutral-900">{PAYMENT_METHODS.upiId}</p>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-2 rounded-lg border border-neutral-200 p-4 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Bank transfer
          </p>
          <div className="flex justify-between gap-2">
            <span className="text-neutral-500">Account name</span>
            <span className="font-medium text-neutral-900">{PAYMENT_METHODS.bankAccountName}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-neutral-500">Account number</span>
            <span className="font-mono font-medium text-neutral-900">
              {PAYMENT_METHODS.bankAccountNumber}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-neutral-500">IFSC</span>
            <span className="font-mono font-medium text-neutral-900">{PAYMENT_METHODS.bankIfsc}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-neutral-500">Bank</span>
            <span className="font-medium text-neutral-900">{PAYMENT_METHODS.bankName}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default PaymentMethodsPanel;
