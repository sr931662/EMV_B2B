import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Icon, Input, Select, Spinner, useToast } from '../ui';
import LibraryPicker from './LibraryPicker';
import { apiGet, apiPut, ApiError } from '../../api/client';

/**
 * The bands that make a cancellation policy applicable rather than merely printable.
 *
 * Edited as a set, not one row at a time. Bands only make sense in relation to each other — a gap
 * between two of them means a cancellation on that day has no answer, and an overlap means two
 * different charges are both correct. Saving them individually is precisely how those appear.
 *
 * The problem list under the table comes from the server, which checks the same rules the charge
 * calculation uses. It warns rather than blocks: a half-built policy is a normal thing to save.
 */

const CHARGE_TYPES = [
  { value: 'PERCENT_OF_TOTAL', label: 'Percent of trip value' },
  { value: 'FIXED_AMOUNT', label: 'Fixed amount' },
  { value: 'NIGHTS', label: 'Number of nights' },
  { value: 'NONE', label: 'No charge' },
];

const PROBLEM_VARIANT = {
  gap: 'danger',
  empty: 'danger',
  currency: 'danger',
  inverted: 'danger',
  unreachable: 'danger',
  'over-100': 'warning',
  overlap: 'warning',
  'open-end': 'warning',
};

function blankTier(previous) {
  // A new band starts where the last one ended, which is the only value that cannot create a gap.
  const min = previous?.daysBeforeTravelMax ?? (previous ? previous.daysBeforeTravelMin + 1 : 0);

  return {
    daysBeforeTravelMin: min,
    daysBeforeTravelMax: '',
    chargeType: 'PERCENT_OF_TOTAL',
    chargeValue: 0,
    currencyCode: '',
  };
}

function CancellationTierEditor({ policyId, onClose }) {
  const [tiers, setTiers] = useState([]);
  const [problems, setProblems] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  useEffect(() => {
    setLoading(true);
    apiGet(`/api/library/cancellation-policy/${policyId}/tiers`)
      .then((res) => {
        setPolicy(res.policy);
        setTiers(
          res.policy.tiers.map((t) => ({
            daysBeforeTravelMin: t.daysBeforeTravelMin,
            daysBeforeTravelMax: t.daysBeforeTravelMax ?? '',
            chargeType: t.chargeType,
            chargeValue: t.chargeValue,
            currencyCode: t.currencyCode ?? '',
          }))
        );
        setProblems(res.problems);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the policy.'))
      .finally(() => setLoading(false));
  }, [policyId]);

  const setTier = (index, patch) =>
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const removeTier = (index) => setTiers((prev) => prev.filter((_, i) => i !== index));

  const addTier = () => setTiers((prev) => [...prev, blankTier(prev[prev.length - 1])]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiPut(`/api/library/cancellation-policy/${policyId}/tiers`, {
        tiers: tiers.map((t) => ({
          daysBeforeTravelMin: Number(t.daysBeforeTravelMin) || 0,
          // Blank means "no upper bound" — the outermost band.
          daysBeforeTravelMax: String(t.daysBeforeTravelMax).trim() === '' ? null : Number(t.daysBeforeTravelMax),
          chargeType: t.chargeType,
          chargeValue: Number(t.chargeValue) || 0,
          currencyCode: t.currencyCode || null,
        })),
      });

      setProblems(res.problems);
      showToast({
        variant: res.problems.length > 0 ? 'warning' : 'success',
        message:
          res.problems.length > 0
            ? `Saved, but ${res.problems.length} thing(s) need attention.`
            : 'Cancellation bands saved.',
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
        Loading bands…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-[15px] font-semibold text-neutral-900">{policy?.name}</h3>
        <p className="mt-0.5 text-[13px] text-neutral-500">
          Bands run from the travel date backwards and are read as “this many days or more before
          travel, up to the next band”. Leave the last band’s maximum empty so it covers everything
          further out.
        </p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-[13px]">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[12px] uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-3 font-medium">From (days before)</th>
              <th className="py-2 pr-3 font-medium">To (exclusive)</th>
              <th className="py-2 pr-3 font-medium">Charge</th>
              <th className="py-2 pr-3 font-medium">Value</th>
              <th className="py-2 pr-3 font-medium">Currency</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {tiers.map((tier, index) => (
              <tr key={index}>
                <td className="py-2 pr-3">
                  <Input
                    type="number"
                    value={tier.daysBeforeTravelMin}
                    onChange={(e) => setTier(index, { daysBeforeTravelMin: e.target.value })}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Input
                    type="number"
                    placeholder="No limit"
                    value={tier.daysBeforeTravelMax}
                    onChange={(e) => setTier(index, { daysBeforeTravelMax: e.target.value })}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Select
                    value={tier.chargeType}
                    onChange={(e) => setTier(index, { chargeType: e.target.value })}
                    options={CHARGE_TYPES}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Input
                    type="number"
                    step="0.01"
                    disabled={tier.chargeType === 'NONE'}
                    value={tier.chargeValue}
                    onChange={(e) => setTier(index, { chargeValue: e.target.value })}
                  />
                </td>
                <td className="py-2 pr-3">
                  {/* Only a fixed amount is money in its own right. A percentage inherits whatever
                      the trip was priced in, and a nights count is not money at all. */}
                  {tier.chargeType === 'FIXED_AMOUNT' ? (
                    <LibraryPicker
                      entity="currency"
                      value={tier.currencyCode}
                      onChange={(currencyCode) => setTier(index, { currencyCode })}
                      placeholder="Currency"
                      allowCreate={false}
                    />
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTier(index)}
                    aria-label={`Remove band ${index + 1}`}
                  >
                    <Icon name="trash" size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tiers.length === 0 && (
        <p className="py-4 text-center text-[13px] text-neutral-500">
          No bands yet. A policy without bands cannot be applied to anything.
        </p>
      )}

      {problems.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-neutral-600">
            Needs attention
          </p>
          {problems.map((problem, i) => (
            <p key={i} className="flex items-start gap-2 text-[13px] text-neutral-700">
              <Badge variant={PROBLEM_VARIANT[problem.kind] ?? 'neutral'}>{problem.kind}</Badge>
              {problem.message}
            </p>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-4">
        <Button variant="outline" size="sm" onClick={addTier}>
          <Icon name="plus" size={14} />
          Add band
        </Button>
        <div className="flex gap-2">
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
          <Button loading={saving} onClick={save}>
            Save bands
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CancellationTierEditor;
