import { useEffect, useState } from 'react';
import { Alert, Button, Icon, Input, Select, Spinner, Switch, useToast } from '../ui';
import LibraryPicker from './LibraryPicker';
import { apiGet, apiPut, ApiError } from '../../api/client';

/**
 * An activity's prices.
 *
 * Several per activity, because an adult ticket, a child ticket, a seat-in-coach transfer and a
 * private one are four different numbers for the same experience — and each is valid for its own
 * season. One "price" column on the activity would force a choice between them and make the other
 * three someone's mental arithmetic.
 */

const PAX_TYPES = [
  { value: 'ADULT', label: 'Adult' },
  { value: 'CHILD', label: 'Child' },
  { value: 'INFANT', label: 'Infant' },
  { value: 'GROUP', label: 'Group (flat)' },
];

const TRANSFERS = [
  { value: 'SIC', label: 'Seat in coach' },
  { value: 'PRIVATE', label: 'Private' },
  { value: 'NONE', label: 'No transfer' },
];

const isoDate = (value) => (value ? String(value).slice(0, 10) : '');

function ActivityRateEditor({ activityId, onClose }) {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    setLoading(true);
    apiGet(`/api/rates/activities/${activityId}/rates`)
      .then((res) =>
        setRates(
          res.rates.map((r) => ({
            paxType: r.paxType,
            transfer: r.transfer,
            validFrom: isoDate(r.validFrom),
            validTo: isoDate(r.validTo),
            amount: r.amount,
            currencyCode: r.currencyCode ?? '',
            minPax: r.minPax ?? '',
            maxPax: r.maxPax ?? '',
            vendorId: r.vendorId ?? '',
            isPublished: r.isPublished,
          }))
        )
      )
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load rates.'))
      .finally(() => setLoading(false));
  }, [activityId]);

  const setRate = (i, patch) => setRates((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRate = (i) => setRates((prev) => prev.filter((_, idx) => idx !== i));

  const addRate = () =>
    setRates((prev) => {
      const previous = prev[prev.length - 1];
      return [
        ...prev,
        {
          paxType: 'ADULT',
          transfer: previous?.transfer ?? 'SIC',
          validFrom: previous?.validFrom ?? '',
          validTo: previous?.validTo ?? '',
          amount: '',
          currencyCode: previous?.currencyCode ?? '',
          minPax: '',
          maxPax: '',
          vendorId: previous?.vendorId ?? '',
          isPublished: false,
        },
      ];
    });

  const save = async () => {
    const incomplete = rates.filter((r) => !r.validFrom || !r.validTo || !r.amount || !r.currencyCode);

    if (incomplete.length > 0) {
      setError(`${incomplete.length} row(s) are missing dates, an amount or a currency.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await apiPut(`/api/rates/activities/${activityId}/rates`, {
        rates: rates.map((r) => ({
          paxType: r.paxType,
          transfer: r.transfer,
          validFrom: r.validFrom,
          validTo: r.validTo,
          amount: Number(r.amount),
          currencyCode: r.currencyCode,
          minPax: String(r.minPax).trim() === '' ? null : Number(r.minPax),
          maxPax: String(r.maxPax).trim() === '' ? null : Number(r.maxPax),
          vendorId: r.vendorId || null,
          isPublished: r.isPublished,
        })),
      });

      showToast({ variant: 'success', message: `${res.rates.length} rate(s) saved.` });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-neutral-500">
        <Spinner size="sm" />
        Loading rates…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-neutral-500">
        A group rate is the whole price regardless of headcount, within its minimum and maximum. Every
        other type is per person. Unpublished rates are never quoted.
      </p>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-[13px]">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[12px] uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-2 font-medium">Applies to</th>
              <th className="py-2 pr-2 font-medium">Transfer</th>
              <th className="py-2 pr-2 font-medium">From</th>
              <th className="py-2 pr-2 font-medium">To</th>
              <th className="py-2 pr-2 font-medium">Amount</th>
              <th className="py-2 pr-2 font-medium">Currency</th>
              <th className="py-2 pr-2 font-medium">Min pax</th>
              <th className="py-2 pr-2 font-medium">Max pax</th>
              <th className="py-2 pr-2 font-medium">Supplier</th>
              <th className="py-2 pr-2 font-medium">Live</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rates.map((r, i) => (
              <tr key={i} className={r.isPublished ? undefined : 'bg-neutral-50/60'}>
                <td className="py-2 pr-2">
                  <Select
                    value={r.paxType}
                    onChange={(e) => setRate(i, { paxType: e.target.value })}
                    options={PAX_TYPES}
                  />
                </td>
                <td className="py-2 pr-2">
                  <Select
                    value={r.transfer}
                    onChange={(e) => setRate(i, { transfer: e.target.value })}
                    options={TRANSFERS}
                  />
                </td>
                <td className="py-2 pr-2">
                  <Input type="date" value={r.validFrom} onChange={(e) => setRate(i, { validFrom: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Input type="date" value={r.validTo} onChange={(e) => setRate(i, { validTo: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Input
                    type="number"
                    step="0.01"
                    className="tabular-nums"
                    value={r.amount}
                    onChange={(e) => setRate(i, { amount: e.target.value })}
                  />
                </td>
                <td className="py-2 pr-2">
                  <LibraryPicker
                    entity="currency"
                    value={r.currencyCode}
                    onChange={(currencyCode) => setRate(i, { currencyCode })}
                    placeholder="Currency"
                    allowCreate={false}
                  />
                </td>
                <td className="py-2 pr-2">
                  <Input type="number" value={r.minPax} onChange={(e) => setRate(i, { minPax: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Input type="number" value={r.maxPax} onChange={(e) => setRate(i, { maxPax: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <LibraryPicker
                    entity="vendor"
                    value={r.vendorId}
                    onChange={(vendorId) => setRate(i, { vendorId })}
                    placeholder="Any"
                    allowCreate={false}
                  />
                </td>
                <td className="py-2 pr-2">
                  <Switch
                    checked={r.isPublished}
                    onChange={(e) => setRate(i, { isPublished: e.target.checked })}
                  />
                </td>
                <td className="py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => removeRate(i)} aria-label={`Remove rate ${i + 1}`}>
                    <Icon name="trash" size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rates.length === 0 && (
        <p className="py-4 text-center text-[13px] text-neutral-500">
          No rates yet. Without one this activity cannot be priced into an itinerary.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-4">
        <Button variant="outline" size="sm" onClick={addRate}>
          <Icon name="plus" size={14} />
          Add rate
        </Button>
        <div className="flex gap-2">
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
          <Button loading={saving} onClick={save}>
            Save rates
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ActivityRateEditor;
