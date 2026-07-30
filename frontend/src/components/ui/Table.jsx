import { cn } from '../../lib/cn';

/**
 * Composable table primitives.
 *
 * The app has a dozen list screens that each hand-rolled `<table className="w-full text-sm">`
 * with slightly different header colours, row borders and cell padding. These pieces mirror the
 * native table structure 1:1 (`Table / Table.Head / Table.HeadCell / Table.Body / Table.Row /
 * Table.Cell`), so converting a screen is a mechanical tag swap with no logic change — while
 * every list in the product ends up with the same density, alignment and hover behaviour.
 *
 * Responsiveness: the wrapper owns the horizontal scroll (`overflow-x-auto`) and `minWidth`
 * guarantees columns don't crush into unreadable slivers on a phone. That scroll lives on this
 * container so the page body itself never scrolls sideways.
 *
 * No negative margins here: these tables sit inside a Card with `bodyClassName="p-0"`, so pulling
 * the scroll container outside the body would push it past the card's rounded border on mobile.
 */
function Table({ children, minWidth = '44rem', className = '', stickyHeader = false }) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table
        className={cn('w-full border-separate border-spacing-0 text-sm', stickyHeader && 'relative')}
        style={{ minWidth }}
      >
        {children}
      </table>
    </div>
  );
}

function Head({ children, sticky = false }) {
  return (
    <thead className={cn(sticky && 'sticky top-0 z-10')}>
      <tr>{children}</tr>
    </thead>
  );
}

/**
 * Header cells carry the bottom hairline themselves (rather than the row) because
 * `border-separate` is required for sticky headers to keep their border while scrolling.
 *
 * Deliberately no corner rounding: the enclosing Card is `overflow-hidden rounded-xl` and does the
 * clipping, and when the table sits below a card header a rounded th would notch mid-surface.
 */
function HeadCell({ children, align = 'left', className = '', ...rest }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-neutral-200 bg-neutral-50/80 px-4 py-2.5',
        'text-[11px] font-semibold uppercase tracking-wide text-neutral-500',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

function Body({ children }) {
  return <tbody>{children}</tbody>;
}

function Row({ children, className = '', interactive = false, ...rest }) {
  return (
    <tr
      className={cn(
        'transition-colors',
        interactive && 'cursor-pointer hover:bg-primary-50/40',
        !interactive && 'hover:bg-neutral-50/70',
        className
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

function Cell({ children, align = 'left', muted = false, strong = false, className = '', ...rest }) {
  return (
    <td
      className={cn(
        'border-b border-neutral-150 px-4 py-3 align-middle',
        muted && 'text-neutral-500',
        strong && 'font-medium text-neutral-900',
        !muted && !strong && 'text-neutral-700',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

/** Full-width message row for the "no results" case, spanning every column. */
function Empty({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="border-b border-neutral-150 px-4 py-10 text-center text-sm text-neutral-500">
        {children}
      </td>
    </tr>
  );
}

Table.Head = Head;
Table.HeadCell = HeadCell;
Table.Body = Body;
Table.Row = Row;
Table.Cell = Cell;
Table.Empty = Empty;

export default Table;
