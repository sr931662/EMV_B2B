import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Icon, Input, Select, Spinner, Switch, useToast } from '../ui';
import LibraryPicker from './LibraryPicker';
import { apiGet, apiPut, apiDownload, apiUpload, ApiError } from '../../api/client';

/**
 * A hotel's rate card.
 *
 * The reason this is a grid rather than a form per rate: a rate card is only correct in relation to
 * its neighbours. A season with a hole in it, two identical lines loaded twice, or one room type
 * priced in two currencies are all invisible while editing a single row, and all of them surface as
 * a wrong number on a quote weeks later. The problem list under the grid names them.
 *
 * The price checker at the top is the same resolver the quote builder uses, so what it shows is what
 * a quote will charge — not a second implementation that agrees most of the time.
 */

const OCCUPANCIES = [
  { value: 'SINGLE', label: 'Single' },
  { value: 'DOUBLE', label: 'Double' },
  { value: 'TRIPLE', label: 'Triple' },
  { value: 'QUAD', label: 'Quad' },
  { value: 'EXTRA_ADULT', label: 'Extra adult' },
  { value: 'CHILD_WITH_BED', label: 'Child with bed' },
  { value: 'CHILD_NO_BED', label: 'Child no bed' },
  { value: 'INFANT', label: 'Infant' },
];

const BASES = [
  { value: 'PER_ROOM_PER_NIGHT', label: 'Per room / night' },
  { value: 'PER_PERSON_PER_NIGHT', label: 'Per person / night' },
  { value: 'PER_ROOM_PER_STAY', label: 'Per room / stay' },
  { value: 'PER_PERSON_PER_STAY', label: 'Per person / stay' },
];

const PROBLEM_VARIANT = {
  empty: 'danger',
  inverted: 'danger',
  nights: 'danger',
  'mixed-currency': 'danger',
  duplicate: 'warning',
  unpublished: 'warning',
};

const isoDate = (value) => (value ? String(value).slice(0, 10) : '');

function blankRate(previous) {
  return {
    roomType: previous?.roomType ?? '',
    mealPlan: previous?.mealPlan ?? '',
    occupancy: previous?.occupancy ?? 'DOUBLE',
    validFrom: '',
    validTo: '',
    basis: previous?.basis ?? 'PER_ROOM_PER_NIGHT',
    amount: '',
    currencyCode: previous?.currencyCode ?? '',
    taxPercent: '',
    minNights: '',
    maxNights: '',
    vendorId: previous?.vendorId ?? '',
    // Off by default. Rates arrive as a spreadsheet and get checked before anyone sells against
    // them, so a newly typed line must not be quotable by accident.
    isPublished: false,
  };
}

function PriceChecker({ hotelId, rates }) {
  const [query, setQuery] = useState({
    checkIn: '',
    checkOut: '',
    occupancy: 'DOUBLE',
    roomType: '',
    mealPlan: '',
  });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams(
        Object.fromEntries(Object.entries(query).filter(([, v]) => v))
      );
      setResult(await apiGet(`/api/rates/hotels/${hotelId}/price?${params.toString()}`));
    } catch (err) {
      setResult({ priced: false, reason: err instanceof ApiError ? err.message : 'Failed.' });
    } finally {
      setBusy(false);
    }
  };

  // Prefill from the card so the check is one click rather than five fields.
  useEffect(() => {
    const first = rates[0];
    if (first && !query.roomType) {
      setQuery((q) => ({ ...q, roomType: first.roomType ?? '', mealPlan: first.mealPlan ?? '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates]);

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-neutral-600">
        Check a stay
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="Check in"
          type="date"
          value={query.checkIn}
          onChange={(e) => setQuery({ ...query, checkIn: e.target.value })}
        />
        <Input
          label="Check out"
          type="date"
          value={query.checkOut}
          onChange={(e) => setQuery({ ...query, checkOut: e.target.value })}
        />
        <Select
          label="Occupancy"
          value={query.occupancy}
          onChange={(e) => setQuery({ ...query, occupancy: e.target.value })}
          options={OCCUPANCIES}
        />
        <Input
          label="Room type"
          value={query.roomType}
          onChange={(e) => setQuery({ ...query, roomType: e.target.value })}
        />
        <Input
          label="Meal plan"
          value={query.mealPlan}
          onChange={(e) => setQuery({ ...query, mealPlan: e.target.value })}
        />
        <Button size="sm" loading={busy} disabled={!query.checkIn || !query.checkOut} onClick={run}>
          Price it
        </Button>
      </div>

      {result && (
        <div className="mt-3 border-t border-neutral-200 pt-3 text-[13px]">
          {result.priced ? (
            <>
              <p className="font-medium text-neutral-900">
                {result.currencyCode} {result.total}{' '}
                <span className="font-normal text-neutral-500">for {result.nights} night(s)</span>
              </p>
              {/* Per night, because a stay crossing a season change has no single nightly rate and
                  showing an average would invent a number nobody quoted. */}
              <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-neutral-600">
                {result.breakdown.map((line) => (
                  <li key={line.date} className="flex gap-3 tabular-nums">
                    <span className="w-24">{line.date}</span>
                    <span className="w-20 text-right">{line.total}</span>
                    {line.taxAmount !== '0.00' && (
                      <span className="text-neutral-400">incl. {line.taxAmount} tax</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-danger-700">{result.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}

function RateCardEditor({ hotelId, onClose }) {
  const [rates, setRates] = useState([]);
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState([]);
  const fileInputRef = useRef(null);
  const { showToast } = useToast();

  const load = () =>
    apiGet(`/api/rates/hotels/${hotelId}/rates`)
      .then((res) => {
        setRates(
          res.rates.map((r) => ({
            roomType: r.roomType ?? '',
            mealPlan: r.mealPlan ?? '',
            occupancy: r.occupancy,
            validFrom: isoDate(r.validFrom),
            validTo: isoDate(r.validTo),
            basis: r.basis,
            amount: r.amount,
            currencyCode: r.currencyCode ?? '',
            taxPercent: r.taxPercent ?? '',
            minNights: r.minNights ?? '',
            maxNights: r.maxNights ?? '',
            vendorId: r.vendorId ?? '',
            isPublished: r.isPublished,
          }))
        );
        setProblems(res.problems);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load rates.'))
      .finally(() => setLoading(false));

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId]);

  const setRate = (i, patch) => setRates((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRate = (i) => setRates((prev) => prev.filter((_, idx) => idx !== i));
  const addRate = () => setRates((prev) => [...prev, blankRate(prev[prev.length - 1])]);

  const exportCard = async () => {
    setExporting(true);
    try {
      await apiDownload(`/api/rates/hotels/${hotelId}/rates/export`);
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Export failed.' });
    } finally {
      setExporting(false);
    }
  };

  const importCard = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setImporting(true);
    setImportErrors([]);
    try {
      const res = await apiUpload(`/api/rates/hotels/${hotelId}/rates/import`, formData);

      if (!res.applied) {
        setImportErrors(res.errors ?? []);
        showToast({ variant: 'warning', message: res.message });
        return;
      }

      showToast({ variant: 'success', message: res.message });
      setLoading(true);
      await load();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Import failed.' });
    } finally {
      setImporting(false);
    }
  };

  const save = async () => {
    const incomplete = rates.filter((r) => !r.roomType || !r.validFrom || !r.validTo || !r.amount || !r.currencyCode);

    if (incomplete.length > 0) {
      setError(
        `${incomplete.length} row(s) are missing a room type, dates, amount or currency. A rate without those is not a price.`
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await apiPut(`/api/rates/hotels/${hotelId}/rates`, {
        rates: rates.map((r) => ({
          roomType: r.roomType.trim(),
          mealPlan: r.mealPlan.trim(),
          occupancy: r.occupancy,
          validFrom: r.validFrom,
          validTo: r.validTo,
          basis: r.basis,
          amount: Number(r.amount),
          currencyCode: r.currencyCode,
          taxPercent: String(r.taxPercent).trim() === '' ? null : Number(r.taxPercent),
          minNights: String(r.minNights).trim() === '' ? null : Number(r.minNights),
          maxNights: String(r.maxNights).trim() === '' ? null : Number(r.maxNights),
          vendorId: r.vendorId || null,
          isPublished: r.isPublished,
        })),
      });

      setProblems(res.problems);
      showToast({
        variant: res.problems.length > 0 ? 'warning' : 'success',
        message:
          res.problems.length > 0
            ? `Saved, but ${res.problems.length} thing(s) need attention.`
            : `${res.rates.length} rate(s) saved.`,
      });
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
        Dates are inclusive at both ends. Where two rates cover the same night the narrower one wins —
        that is how a promotional week overrides the season it sits inside. Unpublished rates are
        never quoted.
      </p>

      {error && <Alert variant="danger">{error}</Alert>}

      {importErrors.length > 0 && (
        <Alert variant="warning">
          <p className="mb-1.5 font-medium">
            Nothing was saved — every row in the file has to be valid, since a rate card is replaced as
            a whole set. Fix these and re-upload:
          </p>
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {importErrors.map((e) => (
              <li key={e.row}>
                <span className="font-mono text-neutral-500">Row {e.row}:</span> {e.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <p className="text-[12.5px] text-neutral-600">
          Rates arrive as a spreadsheet from most suppliers — export the current card as a starting
          template, or import one to replace it entirely.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" loading={exporting} onClick={exportCard}>
            <Icon name="download" size={13} />
            Export
          </Button>
          <Button variant="outline" size="sm" loading={importing} onClick={() => fileInputRef.current?.click()}>
            <Icon name="upload" size={13} />
            Import
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={importCard} />
        </div>
      </div>

      <PriceChecker hotelId={hotelId} rates={rates} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[68rem] text-[13px]">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[12px] uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-2 font-medium">Room type</th>
              <th className="py-2 pr-2 font-medium">Meal plan</th>
              <th className="py-2 pr-2 font-medium">Occupancy</th>
              <th className="py-2 pr-2 font-medium">From</th>
              <th className="py-2 pr-2 font-medium">To</th>
              <th className="py-2 pr-2 font-medium">Basis</th>
              <th className="py-2 pr-2 font-medium">Amount</th>
              <th className="py-2 pr-2 font-medium">Currency</th>
              <th className="py-2 pr-2 font-medium">Tax %</th>
              <th className="py-2 pr-2 font-medium">Supplier</th>
              <th className="py-2 pr-2 font-medium">Live</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rates.map((r, i) => (
              <tr key={i} className={r.isPublished ? undefined : 'bg-neutral-50/60'}>
                <td className="py-2 pr-2">
                  <Input value={r.roomType} onChange={(e) => setRate(i, { roomType: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Input value={r.mealPlan} onChange={(e) => setRate(i, { mealPlan: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Select
                    value={r.occupancy}
                    onChange={(e) => setRate(i, { occupancy: e.target.value })}
                    options={OCCUPANCIES}
                  />
                </td>
                <td className="py-2 pr-2">
                  <Input type="date" value={r.validFrom} onChange={(e) => setRate(i, { validFrom: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Input type="date" value={r.validTo} onChange={(e) => setRate(i, { validTo: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Select
                    value={r.basis}
                    onChange={(e) => setRate(i, { basis: e.target.value })}
                    options={BASES}
                  />
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
                  <Input
                    type="number"
                    step="0.01"
                    value={r.taxPercent}
                    onChange={(e) => setRate(i, { taxPercent: e.target.value })}
                  />
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
          No rates yet. Without one this hotel cannot be priced into a quote.
        </p>
      )}

      {problems.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-neutral-600">Needs attention</p>
          {problems.map((problem, i) => (
            <p key={i} className="flex items-start gap-2 text-[13px] text-neutral-700">
              <Badge variant={PROBLEM_VARIANT[problem.kind] ?? 'neutral'}>{problem.kind}</Badge>
              {problem.message}
            </p>
          ))}
        </div>
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
            Save rate card
          </Button>
        </div>
      </div>
    </div>
  );
}

export default RateCardEditor;
