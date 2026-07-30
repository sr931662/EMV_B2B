import { Card } from '../ui';

/** Shared placeholder body for a route that's routed and guarded but not built yet. */
function ComingSoon({ title, description }) {
  return (
    <Card>
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      <p className="mt-2 text-sm text-neutral-500">
        {description ?? 'This screen will be built in a later prompt.'}
      </p>
    </Card>
  );
}

export default ComingSoon;
