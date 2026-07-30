import Card from './Card';

/** Dashboard stat tile: a big number, a label, and optional small breakdown content below. */
function StatCard({ label, value, hint, children }) {
  return (
    <Card bodyClassName="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="text-2xl font-semibold text-neutral-900">{value}</span>
      {hint && <span className="text-sm text-neutral-500">{hint}</span>}
      {children}
    </Card>
  );
}

export default StatCard;
