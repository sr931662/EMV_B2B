import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Input,
  Modal,
  Pagination,
  Select,
  Skeleton,
  Switch,
  Tabs,
  Textarea,
  useToast,
} from '../../components/ui';
import LibraryPicker from '../../components/library/LibraryPicker';
import CancellationTierEditor from '../../components/library/CancellationTierEditor';
import RateCardEditor from '../../components/library/RateCardEditor';
import ActivityRateEditor from '../../components/library/ActivityRateEditor';
import BulkImportExport from '../../components/library/BulkImportExport';
import { apiGet, apiPost, apiPatch, ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

/**
 * Entities whose real substance is a child collection — a policy's bands, a hotel's rate card.
 *
 * The registry says one is needed and names it; this map says which component renders it. Split that
 * way so the server never has to know a component exists, and adding one is a line here rather than
 * another branch inside the page.
 */
const CHILD_EDITORS = {
  'cancellation-tiers': {
    title: 'Cancellation bands',
    buttonLabel: 'Bands',
    render: (row, close) => <CancellationTierEditor policyId={row.id} onClose={close} />,
  },
  'hotel-rates': {
    title: 'Rate card',
    buttonLabel: 'Rates',
    render: (row, close) => <RateCardEditor hotelId={row.id} onClose={close} />,
  },
  'activity-rates': {
    title: 'Activity rates',
    buttonLabel: 'Rates',
    render: (row, close) => <ActivityRateEditor activityId={row.id} onClose={close} />,
  },
};
import { formatDate } from '../../lib/format';

/**
 * One admin screen for every library entity.
 *
 * Builds itself from GET /api/library/entities, so adding a library module is a registry entry on
 * the server rather than another page here. That is the whole point — the previous Library grew
 * three bespoke tabs and would have grown fifteen.
 *
 * Deliberately generic in what it renders: a list, a search box, an archived toggle, an editor and
 * a usage/history panel. Entity-specific forms (a hotel's coordinates, a visa product's checklist)
 * stay on their own screens; this is the master-data browser, not a replacement for them.
 */

// One icon per section, so the segmented control reads at a glance rather than as a row of
// identically-shaped labels. Falls back to 'layers' for anything added later without an entry here.
const ENTITY_ICONS = {
  lookup: 'sliders',
  currency: 'card',
  country: 'globe',
  visaProduct: 'plane',
  documentType: 'file',
  faq: 'info',
  noteBlock: 'receipt',
  cancellationPolicy: 'x-circle',
  insurancePlan: 'shield',
  vendor: 'building',
  activity: 'sparkles',
};

const PAGE_SIZE = 50;

// Vocabularies are read one type at a time, so the shell needs the list to offer a type switcher.
const LOOKUP_TYPES = [
  { value: 'TRIP_TYPE', label: 'Trip types' },
  { value: 'PACKAGE_CATEGORY', label: 'Package categories' },
  { value: 'INCLUSION', label: 'Inclusions' },
  { value: 'EXCLUSION', label: 'Exclusions' },
  { value: 'AMENITY', label: 'Amenities' },
  { value: 'ROOM_TYPE', label: 'Room types' },
  { value: 'MEAL_PLAN', label: 'Meal plans' },
  { value: 'ACTIVITY_CATEGORY', label: 'Activity categories' },
];

/** Picks a few readable columns out of a row without knowing the entity. */
function summarise(row) {
  // `question` for FAQs, `key` for note blocks — each entity's most identifying column, tried in
  // order of how specific it is.
  const title = row.name ?? row.title ?? row.question ?? row.code ?? row.id;
  const sub =
    row.description ?? row.answer ?? row.category ?? row.provider ?? row.shortName ?? row.symbol ?? null;

  return { title, sub };
}

/** Turns a stored value into something an input can hold, per declared field type. */
function toInputValue(field, value) {
  if (value === null || value === undefined) {
    if (field.type === 'boolean') return false;
    // A field the column gives a default to starts at that default rather than blank, so nobody
    // has to know that leaving "sort order" empty means zero.
    if (field.default !== undefined) return field.default;

    return '';
  }

  if (field.type === 'tags') return Array.isArray(value) ? value.join(', ') : String(value);
  if (field.type === 'boolean') return Boolean(value);

  return value;
}

/**
 * ...and back again, ready for the API.
 *
 * Returns `undefined` — not null — where the column cannot hold null. JSON.stringify drops undefined
 * keys, so the field is simply not sent and the database keeps its default or its current value.
 * Sending null into a NOT NULL enum is a Prisma error with a message nobody can act on.
 */
function toPayloadValue(field, value) {
  if (field.type === 'boolean') return Boolean(value);

  if (field.type === 'select') {
    const text = String(value ?? '').trim();
    return text === '' ? undefined : text;
  }

  if (field.type === 'number') {
    const text = String(value ?? '').trim();
    if (text !== '') return Number(text);

    return field.default === undefined ? null : undefined;
  }

  if (field.type === 'tags') {
    const parts = String(value)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    // `bestMonths` is Int[] — sending it as strings gets a Prisma type error rather than a
    // meaningful message, so the declaration says which arrays are numeric.
    return field.numeric ? parts.map(Number).filter((n) => Number.isFinite(n)) : parts;
  }

  const text = typeof value === 'string' ? value.trim() : value;

  // An empty text box means "no value", not an empty string. The difference matters on a unique
  // nullable column: two rows with '' collide, two rows with NULL do not.
  return text === '' ? null : text;
}

function slugFrom(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * The editor, built from the entity's declared fields.
 *
 * Nothing here knows what a country or a currency is. That is the point: a new library module is a
 * registry entry on the server, and its form appears here without this file changing.
 */
function EditorModal({ open, onClose, entity, entityMeta, row, lookupType, onSaved }) {
  const [form, setForm] = useState({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  const isNew = !row;
  const fields = useMemo(
    () => (entityMeta?.fields ?? []).filter((f) => isNew || !f.createOnly),
    [entityMeta, isNew]
  );

  useEffect(() => {
    if (!open) return;

    const next = {};
    (entityMeta?.fields ?? []).forEach((f) => {
      next[f.name] = toInputValue(f, row?.[f.name]);
    });

    setForm(next);
    setReason('');
    setError(null);
  }, [open, row, entityMeta]);

  const save = async () => {
    const missing = fields.filter((f) => f.required && !String(form[f.name] ?? '').trim());

    if (missing.length > 0) {
      setError(`Required: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        // Reason is optional but goes straight into the audit trail, which is where it earns its
        // place — "why did this change" is the question a log usually cannot answer.
        reason: reason.trim() || undefined,
      };

      fields.forEach((f) => {
        payload[f.name] = toPayloadValue(f, form[f.name]);
      });

      if (isNew) {
        // A slug is required by the schema but nobody should have to invent one.
        if ('slug' in payload && !payload.slug) payload.slug = slugFrom(form.name);
        if (entityMeta?.requiredFilter === 'type') payload.type = lookupType;

        const res = await apiPost(`/api/library/${entity}`, payload);
        // The server reports what it refused to write. Surfacing it is the difference between a
        // permission boundary and a field that silently does not save.
        if (res.notice) showToast({ variant: 'warning', message: res.notice });
      } else {
        const res = await apiPatch(`/api/library/${entity}/${row.id ?? row.code}`, payload);
        if (res.notice) showToast({ variant: 'warning', message: res.notice });
      }

      showToast({ variant: 'success', message: isNew ? 'Added to the library.' : 'Saved.' });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const set = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const renderField = (f) => {
    const common = { key: f.name, label: f.label, hint: f.hint, required: f.required };

    if (f.type === 'picker') {
      return (
        <LibraryPicker
          {...common}
          entity={f.entity}
          value={form[f.name] ?? ''}
          onChange={(value) => set(f.name, value)}
          allowCreate={false}
        />
      );
    }

    if (f.type === 'select') {
      return (
        <Select
          {...common}
          value={form[f.name] ?? ''}
          onChange={(e) => set(f.name, e.target.value)}
          options={(f.options ?? []).map((value) => ({
            value,
            // Enum values are SCREAMING_SNAKE in the database and unreadable in a dropdown.
            label: value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()),
          }))}
        />
      );
    }

    if (f.type === 'boolean') {
      return (
        <Switch
          {...common}
          checked={Boolean(form[f.name])}
          onChange={(e) => set(f.name, e.target.checked)}
        />
      );
    }

    if (f.type === 'textarea') {
      return (
        <Textarea
          {...common}
          rows={4}
          value={form[f.name] ?? ''}
          onChange={(e) => set(f.name, e.target.value)}
        />
      );
    }

    if (f.type === 'image') {
      return (
        <Input
          {...common}
          value={form[f.name] ?? ''}
          onChange={(e) => set(f.name, e.target.value)}
          hint={f.hint ?? 'Image URL'}
        />
      );
    }

    return (
      <Input
        {...common}
        type={f.type === 'number' ? 'number' : 'text'}
        value={form[f.name] ?? ''}
        onChange={(e) => set(f.name, e.target.value)}
        hint={f.type === 'tags' ? f.hint ?? 'Comma separated' : f.hint}
      />
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? `New ${entityMeta?.label ?? 'item'}` : `Edit ${entityMeta?.label ?? 'item'}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={save}>{isNew ? 'Create' : 'Save'}</Button>
        </>
      }
    >
      {error && <Alert variant="danger" className="mb-3">{error}</Alert>}

      <div className="flex flex-col gap-4">
        {fields.map(renderField)}

        <Input
          label="Reason for this change"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="Optional. Recorded in the audit trail."
        />
      </div>
    </Modal>
  );
}

function DetailPanel({ entity, row, onClose, onChanged }) {
  const [usage, setUsage] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const { user } = useAuth();

  // Withdrawing something the whole catalogue may depend on is a different decision from correcting
  // a description, which is why the server restricts it and this mirrors that.
  const isAdmin = user?.role === 'admin';

  const id = row.id ?? row.code;

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiGet(`/api/library/${entity}/${id}/usage`).catch(() => ({ references: [], total: 0 })),
      apiGet(`/api/library/${entity}/${id}/history?limit=20`).catch(() => ({ entries: [] })),
    ]).then(([u, h]) => {
      if (cancelled) return;
      setUsage(u);
      setHistory(h.entries);
    });

    return () => {
      cancelled = true;
    };
  }, [entity, id]);

  const archive = async (force = false) => {
    setBusy(true);
    try {
      await apiPost(`/api/library/${entity}/${id}/archive`, { force });
      showToast({ variant: 'success', message: 'Archived.' });
      onChanged();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed.' });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      await apiPost(`/api/library/${entity}/${id}/restore`, {});
      showToast({ variant: 'success', message: 'Restored.' });
      onChanged();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed.' });
    } finally {
      setBusy(false);
    }
  };

  const { title } = summarise(row);
  const blocked = (usage?.total ?? 0) > 0;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-neutral-900">{title}</p>
          <p className="font-mono text-[11px] text-neutral-400">{id}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          <Icon name="x" size={13} />
        </Button>
      </div>

      <div className="mt-4">
        <p className="text-[12px] uppercase tracking-wide text-neutral-500">Used by</p>
        {usage === null ? (
          <Skeleton.Stat />
        ) : usage.total === 0 ? (
          <p className="mt-1 text-[13px] text-neutral-500">Nothing references this — safe to archive.</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {usage.references.map((r) => (
              <Badge key={r.type} variant="warning">{r.count} {r.type}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* Archive and restore are admin-only on the server. Hidden rather than shown-and-rejected:
          a button that always 403s teaches people the screen is broken. */}
      {isAdmin && (
        <div className="mt-4 flex flex-wrap gap-2">
          {row.archived ? (
            <Button size="sm" loading={busy} onClick={restore}>Restore</Button>
          ) : (
            <>
              <Button variant="outline" size="sm" loading={busy} onClick={() => archive(false)}>
                <Icon name="archive" size={13} />
                Archive
              </Button>
              {blocked && (
                // Offered only once the safe path has been refused, and labelled for what it is.
                // Safe at all because quotes snapshot at generation — archiving cannot damage an
                // issued quote, only draft work.
                <Button variant="outline" size="sm" loading={busy} onClick={() => archive(true)}>
                  Archive anyway
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-5 border-t border-neutral-100 pt-4">
        <p className="text-[12px] uppercase tracking-wide text-neutral-500">History</p>
        {history.length === 0 ? (
          <p className="mt-1 text-[13px] text-neutral-500">No recorded changes.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2.5">
            {history.map((entry) => (
              <li key={entry.id} className="text-[12.5px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">{entry.action.toLowerCase()}</Badge>
                  <span className="text-neutral-700">{entry.actorEmail ?? 'system'}</span>
                  <span className="text-neutral-400">{formatDate(entry.createdAt)}</span>
                </div>
                {entry.changedFields?.length > 0 && (
                  <p className="mt-0.5 text-neutral-500">
                    {entry.changedFields.join(', ')}
                  </p>
                )}
                {entry.reason && <p className="mt-0.5 italic text-neutral-500">“{entry.reason}”</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/**
 * Warns when a document depends on prose nobody has written.
 *
 * Vouchers look their terms up by key and omit anything missing, which means the table being empty
 * has always produced a voucher with no terms and conditions and no error anywhere. This is the
 * only place that failure is visible.
 */
function NoteBlockHealth({ onCreated }) {
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const load = useCallback(
    () => apiGet('/api/library/note-blocks/health').then(setHealth).catch(() => setHealth(null)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!health || health.healthy) return null;

  const createStubs = async () => {
    setBusy(true);
    try {
      const res = await apiPost('/api/library/note-blocks/ensure-stubs', {});
      showToast({ variant: 'success', message: res.message });
      await load();
      onCreated?.();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Alert variant="warning">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          <strong>Vouchers are printing without their footer.</strong>{' '}
          {health.missing.length} required block
          {health.missing.length === 1 ? '' : 's'} {health.missing.length === 1 ? 'has' : 'have'} no
          wording yet: {health.missing.map((b) => b.title).join(', ')}. A missing block is silently
          omitted from the document.
        </span>
        <Button size="sm" variant="outline" loading={busy} onClick={createStubs}>
          Create the missing blocks
        </Button>
      </div>
    </Alert>
  );
}

/**
 * @param embedded    Renders without its own page header, for when it sits inside the Library's tabs
 *                    rather than being a page of its own. There is only ONE Library in the product —
 *                    a second "master data" screen next to it is the duplication this replaced.
 * @param fixedEntity Locks the browser to one registry entity and hides the entity-switcher Tabs.
 *                    For a module that deserves its own top-level Library tab (Document types) without
 *                    duplicating this whole screen just to change which entity it starts on.
 */
function LibraryShellPage({ embedded = false, fixedEntity = null }) {
  const [entities, setEntities] = useState([]);
  const [entity, setEntity] = useState(fixedEntity ?? 'lookup');
  const [lookupType, setLookupType] = useState('TRIP_TYPE');
  const [q, setQ] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new
  const [detail, setDetail] = useState(null);
  // Some entities have a child collection that needs its own editor — a cancellation policy's bands.
  const [childEditorFor, setChildEditorFor] = useState(null);

  const entityMeta = useMemo(() => entities.find((e) => e.entity === entity), [entities, entity]);

  useEffect(() => {
    apiGet('/api/library/entities')
      .then((res) => {
        // Entities with a richer screen of their own are handled by that screen. Listing them here
        // too would put the same thing behind two different editors.
        const generic = res.entities.filter((e) => !e.dedicatedScreen);
        setEntities(fixedEntity ? generic.filter((e) => e.entity === fixedEntity) : generic);

        // The default has to be something that survived the filter, or the first load 400s on an
        // entity the switcher no longer offers. Locked when fixedEntity is set — there is nothing
        // to fall back to switch, since the whole point is that this screen shows only that one.
        if (!fixedEntity && generic.length > 0 && !generic.some((e) => e.entity === entity)) {
          setEntity(generic[0].entity);
        }
      })
      .catch(() => setEntities([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedEntity]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      includeArchived: String(includeArchived),
      limit: String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
    });
    if (q) params.set('q', q);
    if (entityMeta?.requiredFilter === 'type') params.set('type', lookupType);

    return apiGet(`/api/library/${entity}?${params.toString()}`)
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load.'))
      .finally(() => setLoading(false));
  }, [entity, q, includeArchived, lookupType, entityMeta, page]);

  // A search or filter change can leave `page` pointing past the new, narrower result set — reset
  // to the first page whenever anything upstream of the row count changes, not when the page itself
  // changes.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, q, includeArchived, lookupType]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      {!embedded && (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-primary-700">Administration</p>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">
            Master Data Library
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Every module reads from here. Anything maintained once in the Library never has to be typed
            again when building a package, quote, visa product or itinerary.
          </p>
        </div>
      )}

      <Card>
        {/* A segmented control, not a dropdown — the same pattern as the Destinations/Hotels/Day
            Templates tabs above this screen, so master data reads as sections of one Library
            rather than a form field picking which table to edit. Scrolls sideways rather than
            wrapping when there are more sections than fit one row. Hidden entirely when this
            screen is locked to a single entity — there is nothing to switch between. */}
        {!fixedEntity && (
          <Tabs
            tabs={entities.map((meta) => ({ key: meta.entity, label: meta.label, icon: ENTITY_ICONS[meta.entity] }))}
            value={entity}
            onChange={(next) => {
              setEntity(next);
              setDetail(null);
              setQ('');
            }}
          />
        )}

        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${fixedEntity ? '' : 'mt-4'}`}>
          {entityMeta?.requiredFilter === 'type' && (
            <Select
              label="Vocabulary"
              value={lookupType}
              onChange={(e) => setLookupType(e.target.value)}
              options={LOOKUP_TYPES}
            />
          )}

          <Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to filter…" />

          <div className="flex items-end gap-3">
            <label className="flex h-10 items-center gap-2 text-sm text-neutral-600">
              <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
              Show archived
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          <span className="text-sm text-neutral-500">
            {loading ? 'Loading…' : `${total} ${total === 1 ? 'item' : 'items'}`}
          </span>
          {/* Some entities are richer than a form — a visa product is a checklist and a set of
              timelines. They are listed here for usage and history, and edited where they belong. */}
          {entityMeta?.readOnly ? (
            <span className="text-[13px] text-neutral-500">
              Maintained on its own screen — browse, usage and history only.
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <BulkImportExport
                entity={entity}
                entityMeta={entityMeta}
                requiredType={entityMeta?.requiredFilter === 'type' ? lookupType : undefined}
                onImported={load}
              />
              <Button size="sm" onClick={() => setEditing(null)}>
                <Icon name="plus" size={15} />
                New {entityMeta?.label?.toLowerCase() ?? 'item'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      <NoteBlockHealth onCreated={load} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          {loading ? (
            <Skeleton.Stat />
          ) : rows.length === 0 ? (
            <Card bodyClassName="py-10 text-center">
              <p className="text-neutral-500">Nothing here yet.</p>
            </Card>
          ) : (
            <Card bodyClassName="p-0">
              <ul className="divide-y divide-neutral-100">
                {rows.map((row) => {
                  const { title, sub } = summarise(row);
                  const id = row.id ?? row.code;

                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => setDetail(row)}
                        className={`flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-neutral-50 ${
                          (detail?.id ?? detail?.code) === id ? 'bg-primary-50' : ''
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[14px] font-medium text-neutral-900">{title}</span>
                            {row.archived && <Badge variant="danger">Archived</Badge>}
                          </span>
                          {sub && <span className="block truncate text-[12.5px] text-neutral-500">{sub}</span>}
                        </span>
                        {CHILD_EDITORS[entityMeta?.childEditor] && (
                          <Button
                            as="span"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setChildEditorFor(row);
                            }}
                          >
                            {CHILD_EDITORS[entityMeta.childEditor].buttonLabel}
                          </Button>
                        )}
                        {!entityMeta?.readOnly && (
                          <Button
                            as="span"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(row);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} loading={loading} />
            </Card>
          )}
        </div>

        <div>
          {detail ? (
            <DetailPanel
              entity={entity}
              row={detail}
              onClose={() => setDetail(null)}
              onChanged={() => {
                setDetail(null);
                load();
              }}
            />
          ) : (
            <Card bodyClassName="py-10 text-center">
              <p className="text-[13px] text-neutral-500">
                Select an item to see what depends on it and who has changed it.
              </p>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(childEditorFor)}
        onClose={() => setChildEditorFor(null)}
        title={CHILD_EDITORS[entityMeta?.childEditor]?.title ?? 'Details'}
        size="lg"
      >
        {childEditorFor &&
          CHILD_EDITORS[entityMeta?.childEditor]?.render(childEditorFor, () => setChildEditorFor(null))}
      </Modal>

      <EditorModal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        entity={entity}
        entityMeta={entityMeta}
        row={editing}
        lookupType={lookupType}
        onSaved={() => {
          setEditing(undefined);
          load();
        }}
      />
    </div>
  );
}

export default LibraryShellPage;
