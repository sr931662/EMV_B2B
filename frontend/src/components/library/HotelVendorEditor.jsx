import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Icon, Input, Spinner, Switch, useToast } from '../ui';
import LibraryPicker from './LibraryPicker';
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from '../../api/client';

/**
 * The supplier contracts behind one hotel.
 *
 * This is the row that makes "a hotel belongs to several vendors" true rather than aspirational —
 * the same room bought through a DMC and bought direct routinely carry different allocation,
 * release terms and cancellation policies, and RateCardEditor's per-line vendor picker only makes
 * sense once these exist to pick from.
 *
 * Saved one contract at a time (unlike the rate card and cancellation bands, which replace as a
 * set): a contract is closer to a standalone record — an admin adds one when a new deal is signed
 * and archives it when it lapses, rather than redrafting the whole supplier list every visit.
 */

const isoDate = (value) => (value ? String(value).slice(0, 10) : '');

function blankContract() {
  return {
    id: null,
    vendorId: '',
    contractRef: '',
    contractFrom: '',
    contractTo: '',
    allocationRooms: '',
    releaseDays: '',
    cancellationPolicyId: '',
    isPreferred: false,
  };
}

/** Prefills the draft form from an existing contract, for editing in place. */
function draftFromContract(c) {
  return {
    id: c.id,
    vendorId: c.vendor.id,
    contractRef: c.contractRef ?? '',
    contractFrom: isoDate(c.contractFrom),
    contractTo: isoDate(c.contractTo),
    allocationRooms: c.allocationRooms ?? '',
    releaseDays: c.releaseDays ?? '',
    cancellationPolicyId: c.cancellationPolicy?.id ?? '',
    isPreferred: c.isPreferred,
  };
}

function HotelVendorEditor({ hotelId, onClose }) {
  const [contracts, setContracts] = useState([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const load = () =>
    apiGet(`/api/rates/hotels/${hotelId}/vendors?includeArchived=${includeArchived}`)
      .then((res) => setContracts(res.contracts))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load contracts.'))
      .finally(() => setLoading(false));

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, includeArchived]);

  const save = async () => {
    if (!draft.vendorId) {
      setError('Pick a supplier before saving.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // PUT upserts on the (hotel, vendor, contractRef) natural key — editing an existing
      // contract's fields and saving with that same key updates it in place rather than creating
      // a second row.
      await apiPut(`/api/rates/hotels/${hotelId}/vendors`, {
        vendorId: draft.vendorId,
        contractRef: draft.contractRef.trim(),
        contractFrom: draft.contractFrom || null,
        contractTo: draft.contractTo || null,
        allocationRooms: draft.allocationRooms === '' ? null : Number(draft.allocationRooms),
        releaseDays: draft.releaseDays === '' ? null : Number(draft.releaseDays),
        cancellationPolicyId: draft.cancellationPolicyId || null,
        isPreferred: draft.isPreferred,
      });

      showToast({ variant: 'success', message: draft.id ? 'Contract updated.' : 'Contract saved.' });
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (contract) => {
    try {
      await apiDelete(`/api/rates/hotel-vendors/${contract.id}`);
      showToast({ variant: 'success', message: `Contract with ${contract.vendor.name} archived.` });
      await load();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to archive.' });
    }
  };

  const restore = async (contract) => {
    try {
      await apiPost(`/api/rates/hotel-vendors/${contract.id}/restore`);
      showToast({ variant: 'success', message: `Contract with ${contract.vendor.name} restored.` });
      await load();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to restore.' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-neutral-500">
        <Spinner size="sm" />
        Loading suppliers…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-neutral-500">
          The same room bought through different suppliers can carry different allocation, release
          terms and cancellation policies. Add one contract per supplier — the rate card’s per-line
          supplier picker draws from this list.
        </p>
        <Switch
          label="Show archived"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {contracts.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-neutral-500">
          No suppliers on file yet for this hotel.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {contracts.map((c) => (
            <li key={c.id} className={`rounded-lg border border-neutral-200 p-3 ${c.archived ? 'bg-neutral-50/60' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-neutral-900">{c.vendor.name}</span>
                  {c.archived && <Badge variant="neutral">Archived</Badge>}
                  {c.isPreferred && <Badge variant="success">Preferred</Badge>}
                  {c.contractRef && (
                    <span className="text-[12px] text-neutral-500">ref: {c.contractRef}</span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {c.archived ? (
                    <Button variant="ghost" size="sm" onClick={() => restore(c)}>
                      <Icon name="restore" size={13} />
                      Restore
                    </Button>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setDraft(draftFromContract(c))}>
                        <Icon name="pencil" size={13} />
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => archive(c)}>
                        <Icon name="archive" size={13} />
                        Archive
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-neutral-600 sm:grid-cols-4">
                <div>
                  <dt className="text-neutral-400">Allocation</dt>
                  <dd className="tabular-nums">{c.allocationRooms ?? '—'} rooms</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Release</dt>
                  <dd className="tabular-nums">{c.releaseDays ?? '—'} days</dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Contract dates</dt>
                  <dd>
                    {c.contractFrom ? isoDate(c.contractFrom) : '—'} – {c.contractTo ? isoDate(c.contractTo) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400">Cancellation policy</dt>
                  <dd>{c.cancellationPolicy?.name ?? 'Not set'}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-neutral-600">
            {draft.id ? 'Edit contract' : 'New contract'}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LibraryPicker
              entity="vendor"
              label="Supplier"
              value={draft.vendorId}
              onChange={(vendorId) => setDraft({ ...draft, vendorId })}
              placeholder="Search suppliers…"
              allowCreate={false}
            />
            <Input
              label="Contract reference"
              value={draft.contractRef}
              onChange={(e) => setDraft({ ...draft, contractRef: e.target.value })}
              hint="The supplier's own reference. Lets one supplier hold two contracts on this hotel."
            />
            <Input
              label="Contract from"
              type="date"
              value={draft.contractFrom}
              onChange={(e) => setDraft({ ...draft, contractFrom: e.target.value })}
            />
            <Input
              label="Contract to"
              type="date"
              value={draft.contractTo}
              onChange={(e) => setDraft({ ...draft, contractTo: e.target.value })}
            />
            <Input
              label="Allocation (rooms held)"
              type="number"
              value={draft.allocationRooms}
              onChange={(e) => setDraft({ ...draft, allocationRooms: e.target.value })}
            />
            <Input
              label="Release period (days)"
              type="number"
              value={draft.releaseDays}
              onChange={(e) => setDraft({ ...draft, releaseDays: e.target.value })}
              hint="Days before arrival unsold rooms go back to the supplier."
            />
            <LibraryPicker
              entity="cancellationPolicy"
              label="Cancellation policy"
              value={draft.cancellationPolicyId}
              onChange={(cancellationPolicyId) => setDraft({ ...draft, cancellationPolicyId })}
              placeholder="Search policies…"
              allowCreate={false}
            />
            <Switch
              label="Preferred supplier"
              checked={draft.isPreferred}
              onChange={(e) => setDraft({ ...draft, isPreferred: e.target.checked })}
              hint="Used as a tie-break when two suppliers quote the same price."
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={saving} onClick={save}>
              Save contract
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setDraft(blankContract())}>
          <Icon name="plus" size={14} />
          Add supplier contract
        </Button>
      )}

      {onClose && (
        <div className="flex justify-end border-t border-neutral-100 pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

export default HotelVendorEditor;
