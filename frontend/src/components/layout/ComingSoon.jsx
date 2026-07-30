import { EmptyState, PageHeader } from '../ui';

/** Shared placeholder body for a route that's routed and guarded but not built yet. */
function ComingSoon({ title, description }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <EmptyState
        icon="sparkles"
        title="Coming soon"
        description={description ?? 'This screen is routed and access-controlled, but not built yet.'}
      />
    </div>
  );
}

export default ComingSoon;
