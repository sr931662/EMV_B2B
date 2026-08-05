import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Pagination,
  Skeleton,
  Switch,
  Table,
  useToast,
} from '../../components/ui';
import LibraryPicker from '../../components/library/LibraryPicker';
import { apiGet, apiPost, apiDelete, ApiError } from '../../api/client';
import { formatCurrency } from '../../lib/format';

const PAGE_SIZE = 50;

/**
 * Packages — the wholesale inventory built FROM the rest of the Library.
 *
 * This is the same list Admin → Packages shows; it lives here too because a package is where every
 * other section proves itself out — its itinerary is day templates, its hotels are copied from the
 * Hotels library, its cancellation policy and FAQs are referenced from master data. Browsing it
 * alongside everything it draws from is the point of one Library rather than fifteen screens.
 *
 * The actual builder — itinerary days, hotel selection, library links — is a big enough surface
 * that it keeps its own screen (PackageFormPage, reached through the links below) rather than being
 * reimplemented inline here, the same way a hotel's rate card gets its own editor instead of living
 * in this table.
 */

function PackagesTab() {
  const [countryId, setCountryId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [packages, setPackages] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  const load = () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      includeArchived: String(includeArchived),
      limit: String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
    });
    if (destinationId) params.set('destinationId', destinationId);

    return apiGet(`/api/packages?${params.toString()}`)
      .then((res) => {
        setPackages(res.packages);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load packages.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setPage(1);
  }, [destinationId, includeArchived]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationId, includeArchived, page]);

  const handleArchive = async (pkg) => {
    try {
      await apiDelete(`/api/packages/${pkg.id}`);
      showToast({ variant: 'success', message: `"${pkg.title}" archived.` });
      await load();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to archive.' });
    }
  };

  const handleRestore = async (pkg) => {
    try {
      await apiPost(`/api/packages/${pkg.id}/restore`);
      showToast({ variant: 'success', message: `"${pkg.title}" restored.` });
      await load();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to restore.' });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LibraryPicker
            entity="country"
            label="Country"
            value={countryId}
            onChange={(next) => {
              setCountryId(next);
              setDestinationId('');
            }}
            placeholder="All countries"
            allowCreate={false}
          />
          <LibraryPicker
            entity="destination"
            label="Destination"
            value={destinationId}
            onChange={setDestinationId}
            scopeId={countryId || undefined}
            placeholder={countryId ? 'All destinations in this country' : 'Pick a country first'}
            disabled={!countryId}
            allowCreate={false}
          />
        </div>
      </Card>

      <Card bodyClassName="flex flex-wrap items-center justify-between gap-4 p-4">
        <Switch
          label="Show archived"
          hint="Include packages withdrawn from the marketplace"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        <div className="flex items-center gap-4">
          <p className="text-[13px] text-neutral-500">
            {loading ? (
              'Loading…'
            ) : (
              <>
                <span className="font-semibold text-neutral-900 tabular-nums">{total}</span> package
                {total === 1 ? '' : 's'}
              </>
            )}
          </p>
          <Button as={Link} to="/admin/packages/new" size="sm">
            <Icon name="plus" size={14} />
            New package
          </Button>
        </div>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <Card bodyClassName="p-5">
          <Skeleton.Rows rows={5} cols={5} />
        </Card>
      ) : packages.length === 0 ? (
        <EmptyState
          icon="package"
          title="No packages yet"
          description="A package is built from everything else in the Library — its itinerary from day templates, its hotels copied in, its policy and FAQs referenced from master data."
          action={
            <Button as={Link} to="/admin/packages/new">
              <Icon name="plus" size={16} />
              Create package
            </Button>
          }
        />
      ) : (
        <Card bodyClassName="p-0">
          <Table minWidth="54rem">
            <Table.Head>
              <Table.HeadCell>Title</Table.HeadCell>
              <Table.HeadCell>Destination</Table.HeadCell>
              <Table.HeadCell align="right">Duration</Table.HeadCell>
              <Table.HeadCell align="right">TravNexa cost</Table.HeadCell>
              <Table.HeadCell>Status</Table.HeadCell>
              <Table.HeadCell align="right">
                <span className="sr-only">Actions</span>
              </Table.HeadCell>
            </Table.Head>
            <Table.Body>
              {packages.map((pkg) => (
                <Table.Row key={pkg.id} className={pkg.archived ? 'bg-neutral-50/60' : undefined}>
                  <Table.Cell strong>{pkg.title}</Table.Cell>
                  <Table.Cell>{pkg.destination?.name}</Table.Cell>
                  <Table.Cell align="right">
                    {pkg.days}D / {pkg.nights}N
                  </Table.Cell>
                  <Table.Cell align="right" strong>
                    {formatCurrency(pkg.rawPrice)}
                  </Table.Cell>
                  <Table.Cell>
                    {pkg.archived ? (
                      <Badge variant="neutral" dot>
                        Archived
                      </Badge>
                    ) : (
                      <Badge variant="success" dot>
                        Active
                      </Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell align="right">
                    <div className="flex justify-end gap-2">
                      {!pkg.archived && (
                        <Button as={Link} to={`/admin/packages/${pkg.id}/edit`} variant="outline" size="sm">
                          <Icon name="pencil" size={13} />
                          Edit
                        </Button>
                      )}
                      {pkg.archived ? (
                        <Button variant="outline" size="sm" onClick={() => handleRestore(pkg)}>
                          <Icon name="restore" size={13} />
                          Restore
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleArchive(pkg)}>
                          <Icon name="archive" size={13} />
                          Archive
                        </Button>
                      )}
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} loading={loading} />
        </Card>
      )}
    </div>
  );
}

export default PackagesTab;
