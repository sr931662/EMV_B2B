import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Skeleton,
  Switch,
  Table,
  useToast,
} from '../../components/ui';
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
      <PageHeader
        eyebrow="Administration"
        title="Email Templates"
        subtitle="Wording for every automated email. Edits take effect immediately, with no code change."
        actions={
          <Button as={Link} to="/admin/templates/new">
            <Icon name="plus" size={16} />
            New template
          </Button>
        }
      />

      <Card bodyClassName="flex flex-wrap items-center justify-between gap-4 p-4">
        <Switch
          label="Show archived"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        {!loading && (
          <p className="text-[13px] text-neutral-500">
            <span className="font-semibold text-neutral-900 tabular-nums">{templates.length}</span>{' '}
            template{templates.length === 1 ? '' : 's'}
          </p>
        )}
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <Card bodyClassName="p-5">
          <Skeleton.Rows rows={6} cols={4} />
        </Card>
      ) : templates.length === 0 ? (
        <EmptyState
          icon="mail"
          title="No email templates yet"
          description="Templates control the wording of every automated email the platform sends."
          action={
            <Button as={Link} to="/admin/templates/new">
              <Icon name="plus" size={16} />
              New template
            </Button>
          }
        />
      ) : (
        <Card bodyClassName="p-0">
          <Table minWidth="42rem">
            <Table.Head>
              <Table.HeadCell>Name</Table.HeadCell>
              <Table.HeadCell>Subject</Table.HeadCell>
              <Table.HeadCell>Status</Table.HeadCell>
              <Table.HeadCell align="right">
                <span className="sr-only">Actions</span>
              </Table.HeadCell>
            </Table.Head>
            <Table.Body>
              {templates.map((t) => (
                <Table.Row key={t.id} className={t.archived ? 'bg-neutral-50/60' : undefined}>
                  <Table.Cell>
                    {/* The name is the lookup key services call by, so it reads as code. */}
                    <span className="font-mono text-[12px] font-medium text-neutral-900">{t.name}</span>
                  </Table.Cell>
                  <Table.Cell>{t.subject}</Table.Cell>
                  <Table.Cell>
                    {t.archived ? (
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
                      {!t.archived && (
                        <Button as={Link} to={`/admin/templates/${t.id}/edit`} variant="outline" size="sm">
                          <Icon name="pencil" size={13} />
                          Edit
                        </Button>
                      )}
                      {t.archived ? (
                        <Button variant="outline" size="sm" onClick={() => handleRestore(t)}>
                          <Icon name="restore" size={13} />
                          Restore
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handleArchive(t)}>
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
        </Card>
      )}
    </div>
  );
}

export default EmailTemplatesPage;
