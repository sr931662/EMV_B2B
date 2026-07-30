import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, Spinner, useToast } from '../../components/ui';
import { apiGet, apiPost, apiDelete, ApiError } from '../../api/client';

function EmailTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  const load = () => {
    setLoading(true);
    setError(null);
    return apiGet(`/api/admin/email-templates?includeArchived=${includeArchived}`)
      .then((res) => setTemplates(res.templates))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load templates.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchived]);

  const handleArchive = async (t) => {
    try {
      await apiDelete(`/api/admin/email-templates/${t.id}`);
      showToast({ variant: 'success', message: `"${t.name}" archived.` });
      await load();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to archive.' });
    }
  };

  const handleRestore = async (t) => {
    try {
      await apiPost(`/api/admin/email-templates/${t.id}/restore`);
      showToast({ variant: 'success', message: `"${t.name}" restored.` });
      await load();
    } catch (err) {
      showToast({ variant: 'danger', message: err instanceof ApiError ? err.message : 'Failed to restore.' });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-neutral-900">Email Templates</h1>
        <Link to="/admin/templates/new">
          <Button>+ New Template</Button>
        </Link>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
        Show archived
      </label>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : templates.length === 0 ? (
        <Card bodyClassName="py-10 text-center">
          <p className="text-neutral-500">No email templates yet.</p>
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Subject</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-5 py-3 font-mono text-neutral-900">{t.name}</td>
                  <td className="px-5 py-3 text-neutral-700">{t.subject}</td>
                  <td className="px-5 py-3">
                    {t.archived ? (
                      <Badge variant="danger">Archived</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {!t.archived && (
                        <Link to={`/admin/templates/${t.id}/edit`}>
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        </Link>
                      )}
                      {t.archived ? (
                        <Button variant="outline" size="sm" onClick={() => handleRestore(t)}>
                          Restore
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleArchive(t)}>
                          Archive
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export default EmailTemplatesPage;
