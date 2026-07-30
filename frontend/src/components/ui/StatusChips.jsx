import Badge from './Badge';

/**
 * Renders a `{STATUS: count}` map as a row of non-zero status badges — used by both dashboards.
 *
 * The count is set in its own tabular span so a column of chips keeps its numbers aligned, and
 * the status text is title-cased rather than SHOUTED_IN_SNAKE_CASE.
 */
function StatusChips({ byStatus }) {
  const entries = Object.entries(byStatus).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {entries.map(([status, count]) => (
        <Badge key={status} status={status}>
          <span className="normal-case">{status.replaceAll('_', ' ').toLowerCase()}</span>
          <span className="ml-0.5 rounded bg-black/5 px-1 text-[10px] tabular-nums">{count}</span>
        </Badge>
      ))}
    </div>
  );
}

export default StatusChips;
