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
  PageHeader,
  Skeleton,
  Switch,
  Table,
  useToast,
} from '../../components/ui';
import { apiGet, apiPost, apiDelete, ApiError } from '../../api/client';
import { formatCurrency } from '../../lib/format';

const PAGE_SIZE = 50;

function AdminPackagesListPage() {
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
  }, [includeArchived]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchived, page]);

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
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Inventory"
        title="Packages"
        subtitle="Create and maintain the wholesale inventory partners can quote from."
        actions={
          <Button as={Link} to="/admin/packages/new">
            <Icon name="plus" size={16} />
            Create package
          </Button>
        }
      />

      <Card bodyClassName="flex flex-wrap items-center justify-between gap-4 p-4">
        <Switch
          label="Show archived"
          hint="Include packages withdrawn from the marketplace"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
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
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <Card bodyClassName="p-5">
          <Skeleton.Rows rows={6} cols={5} />
        </Card>
      ) : packages.length === 0 ? (
        <EmptyState
          icon="package"
          title="No packages yet"
          description="Create your first package to make inventory available to partner agencies."
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
              <Table.HeadCell align="right">TravNexa cost / adult</Table.HeadCell>
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
                    {formatCurrency(pkg.adultRawPrice)}
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

export default AdminPackagesListPage;
