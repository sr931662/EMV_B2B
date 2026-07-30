import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Input, Spinner, Textarea, useToast } from '../../components/ui';
import { apiGet, apiPost, apiPatch, ApiError } from '../../api/client';
import { placeholdersFor } from '../../lib/emailTemplatePlaceholders';

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

function EmailTemplateEditPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(null);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    apiGet(`/api/admin/email-templates/${id}`)
      .then((res) => {
        setName(res.template.name);
        setSubject(res.template.subject);
        setBody(res.template.body);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load template.'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const nextErrors = {};
    if (!isEdit) {
      if (!name.trim()) nextErrors.name = 'Required';
      else if (!NAME_PATTERN.test(name.trim())) {
        nextErrors.name = 'Lowercase letters, numbers, and underscores, starting with a letter';
      }
    }
    if (!subject.trim()) nextErrors.subject = 'Required';
    if (!body.trim()) nextErrors.body = 'Required';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      if (isEdit) {
        await apiPatch(`/api/admin/email-templates/${id}`, { subject: subject.trim(), body: body.trim() });
        showToast({ variant: 'success', message: 'Email template updated.' });
      } else {
        await apiPost('/api/admin/email-templates', {
          name: name.trim(),
          subject: subject.trim(),
          body: body.trim(),
        });
        showToast({ variant: 'success', message: 'Email template created.' });
      }
      navigate('/admin/templates');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.length) {
          const fieldErrors = {};
          err.details.forEach((d) => {
            fieldErrors[d.field] = d.message;
          });
          setErrors((prev) => ({ ...prev, ...fieldErrors }));
        }
        setFormError(err.message);
      } else {
        setFormError('Network error. Please check your connection and try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (loadError) {
    return <Alert variant="danger">{loadError}</Alert>;
  }

  const placeholders = placeholdersFor(name || 'custom');

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/templates" className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] font-medium text-neutral-500 transition-colors hover:text-primary-700">
        &larr; Back to templates
      </Link>

      <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-neutral-900 sm:text-[26px]">
        {isEdit ? 'Edit Email Template' : 'New Email Template'}
      </h1>

      <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
        {formError && <Alert variant="danger">{formError}</Alert>}

        <Card>
          <div className="flex flex-col gap-4">
            <Input
              label="Name (lookup key)"
              required
              disabled={isEdit}
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              hint={!errors.name && !isEdit ? 'Immutable once created — code looks this up verbatim' : undefined}
            />
            <Input
              label="Subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              error={errors.subject}
            />
            <Textarea
              label="Body"
              required
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              error={errors.body}
              hint={!errors.body ? 'HTML supported. {{placeholder}} tokens are interpolated server-side at send time.' : undefined}
            />
          </div>
        </Card>

        <Card title="Available placeholders" bodyClassName="flex flex-wrap gap-2">
          {placeholders.map((p) => (
            <Badge key={p} variant="info">
              {`{{${p}}}`}
            </Badge>
          ))}
        </Card>

        <Button type="submit" loading={saving} className="w-full sm:w-auto sm:self-end">
          {isEdit ? 'Save changes' : 'Create Template'}
        </Button>
      </form>
    </div>
  );
}

export default EmailTemplateEditPage;
