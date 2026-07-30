import Badge from './Badge';

/** Renders a `{STATUS: count}` map as a row of non-zero status badges — used by both dashboards. */
function StatusChips({ byStatus }) {
  const entries = Object.entries(byStatus).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([status, count]) => (
        <Badge key={status} status={status}>
          {status.replaceAll('_', ' ')} &middot; {count}
        </Badge>
      ))}
    </div>
  );
}

export default StatusChips;
