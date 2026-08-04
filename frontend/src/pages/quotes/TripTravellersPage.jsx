import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Icon, Input, Select, Skeleton, useToast } from '../../components/ui';
import { apiGet, apiPut, ApiError } from '../../api/client';

/**
 * Names and dates of birth for the people actually travelling.
 *
 * Collected separately from the quote because they arrive later: a trip is priced on head counts,
 * and the customer often confirms who is going days after paying. Saving a partial list is allowed
 * on purpose — the alternative is a partner keeping half the names in a notebook until they have
 * them all.
 */

const TYPE_OPTIONS = [
  { value: 'ADULT', label: 'Adult' },
  { value: 'CHILD', label: 'Child' },
  { value: 'INFANT', label: 'Infant' },
];

const emptyTraveller = () => ({ key: crypto.randomUUID(), fullName: '', dob: '', type: 'ADULT' });

function TripTravellersPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [travellers, setTravellers] = useState([]);
  const [expected, setExpected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([apiGet(`/api/quotes/${id}/travellers`), apiGet(`/api/quotes/${id}/voucher`)])
      .then(([tRes, vRes]) => {
        if (cancelled) return;
        setTravellers(
          tRes.travellers.map((t) => ({
            key: t.id,
            fullName: t.fullName,
            // <input type="date"> only accepts yyyy-mm-dd, not the ISO timestamp the API returns.
            dob: String(t.dob).slice(0, 10),
            type: t.type,
          }))
        );
        setExpected(vRes.voucher.trip.guests);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load travellers.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const setField = (index, field) => (e) => {
    const next = [...travellers];
    next[index] = { ...next[index], [field]: e.target.value };
    setTravellers(next);
  };

  const handleSave = async () => {
    // Rows with neither a name nor a date are just leftover blanks from "Add traveller" — dropping
    // them silently is kinder than making someone delete each one to save.
    const filled = travellers.filter((t) => t.fullName.trim() || t.dob);
    const incomplete = filled.filter((t) => !t.fullName.trim() || !t.dob);

    if (incomplete.length > 0) {
      setError('Every traveller needs both a name and a date of birth.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiPut(`/api/quotes/${id}/travellers`, {
        travellers: filled.map((t) => ({
          fullName: t.fullName.trim(),
          dob: t.dob,
          type: t.type,
        })),
      });
      showToast({ variant: 'success', message: 'Travellers saved.' });
      navigate(`/quotes/${id}/voucher`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton.Stat />;

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={`/quotes/${id}/voucher`}
        className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-primary-600 hover:text-primary-700"
      >
        <Icon name="arrow-left" size={14} />
        Back to voucher
      </Link>

      <div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">
          Traveller details
        </h1>
        {expected && (
          <p className="mt-1 text-sm text-neutral-500">
            This trip is priced for {expected.total} guest{expected.total === 1 ? '' : 's'} —{' '}
            {expected.adults} adult{expected.adults === 1 ? '' : 's'}
            {expected.children > 0 && `, ${expected.children} child`}
            {expected.infants > 0 && `, ${expected.infants} infant`}. You can save what you have and
            finish later.
          </p>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex flex-col gap-3">
        {travellers.map((t, i) => (
          <Card key={t.key}>
            <div className="flex items-start gap-3">
              <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
                <Input label="Full name" value={t.fullName} onChange={setField(i, 'fullName')} />
                <Input
                  label="Date of birth"
                  type="date"
                  value={t.dob}
                  onChange={setField(i, 'dob')}
                  hint="Age is worked out for the travel date"
                />
                <Select
                  label="Type"
                  value={t.type}
                  onChange={setField(i, 'type')}
                  options={TYPE_OPTIONS}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-6"
                onClick={() => setTravellers(travellers.filter((_, j) => j !== i))}
              >
                <Icon name="trash" size={14} />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => setTravellers([...travellers, emptyTraveller()])}>
          <Icon name="plus" size={15} />
          Add traveller
        </Button>
        <Button loading={saving} onClick={handleSave}>
          Save travellers
        </Button>
      </div>
    </div>
  );
}

export default TripTravellersPage;
