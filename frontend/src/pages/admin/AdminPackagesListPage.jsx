import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, Spinner, useToast } from '../../components/ui';
import { apiGet, apiPost, apiDelete, ApiError } from '../../api/client';
import { formatCurrency } from '../../lib/format';

function AdminPackagesListPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [packages, setPackages] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  const load = () => {
    setLoading(true);
    setError(null);
    return apiGet(`/api/packages?includeArchived=${includeArchived}`)
      .then((res) => {
        setPackages(res.packages);
        setCount(res.count);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load packages.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchived]);

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-neutral-900">Packages</h1>
        <Link to="/admin/packages/new">
          <Button>+ Create Package</Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          Show archived
        </label>
        <p className="text-sm text-neutral-500">{loading ? 'Loading…' : `${count} package${count === 1 ? '' : 's'}`}</p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : packages.length === 0 ? (
        <Card bodyClassName="py-10 text-center">
          <p className="text-neutral-500">No packages yet.</p>
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Destination</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">TravNexa Cost</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg) => (
                  <tr key={pkg.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-5 py-3 text-neutral-900">{pkg.title}</td>
                    <td className="px-5 py-3 text-neutral-700">{pkg.destination?.name}</td>
                    <td className="px-5 py-3 text-neutral-700">
                      {pkg.days}D/{pkg.nights}N
                    </td>
                    <td className="px-5 py-3 text-neutral-700">{formatCurrency(pkg.rawPrice)}</td>
                    <td className="px-5 py-3">
                      {pkg.archived ? (
                        <Badge variant="danger">Archived</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {!pkg.archived && (
                          <Link to={`/admin/packages/${pkg.id}/edit`}>
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </Link>
                        )}
                        {pkg.archived ? (
                          <Button variant="outline" size="sm" onClick={() => handleRestore(pkg)}>
                            Restore
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => handleArchive(pkg)}>
                            Archive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default AdminPackagesListPage;
