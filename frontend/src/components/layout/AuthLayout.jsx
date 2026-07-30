import { Icon } from '../ui';
import Brand from './Brand';
import { cn } from '../../lib/cn';

/*
 * Trust markers for the brand panel. A B2B partner portal's login screen is doing sales work as
 * well as authentication — this is the first surface a prospective agency sees, and "what is this
 * and why should I trust it" belongs here rather than nowhere.
 */
const HIGHLIGHTS = [
  {
    icon: 'package',
    title: 'Curated inventory',
    body: 'Ready-to-sell packages with wholesale pricing, itineraries and hotels.',
  },
  {
    icon: 'receipt',
    title: 'White-label quotes',
    body: 'Generate branded PDF quotes for your customers with your own markup.',
  },
  {
    icon: 'plane',
    title: 'Visa services',
    body: 'Submit and track visa applications with per-passenger document checklists.',
  },
];

/**
 * Shared shell for every unauthenticated screen.
 *
 * Two columns from `lg` up: a dark brand panel on the left and the form on the right. Below `lg`
 * the brand panel is dropped entirely (not stacked) — on a phone, scrolling past a marketing
 * panel to reach the password field is pure friction — and a compact wordmark heads the form
 * instead.
 *
 * `maxWidth` is honoured as before, so the wide RegisterPage still gets its roomier card.
 */
function AuthLayout({ title, subtitle, children, footer, maxWidth = 'max-w-sm' }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Brand panel — desktop only */}
      <aside className="surface-deep relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        {/* Decorative: a soft off-canvas glow so the panel isn't a flat gradient slab. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 top-1/3 size-[28rem] rounded-full bg-primary-400/10 blur-3xl"
        />

        <Brand tone="light" imgClassName="h-9" className="relative" />

        <div className="relative max-w-md">
          <h2 className="text-[28px] font-semibold leading-tight text-white xl:text-[32px]">
            The B2B travel desk for modern agencies.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-white/55">
            Packages, quotes and visa processing in one place — priced for partners, branded as
            yours.
          </p>

          <ul className="mt-10 flex flex-col gap-6">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/8 text-primary-200 ring-1 ring-inset ring-white/10">
                  <Icon name={item.icon} size={17} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white/90">{item.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-white/45">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30">
          <Icon name="shield" size={13} />
          Verified partners only
        </p>
      </aside>

      {/* Form column */}
      <main className="flex min-h-dvh items-center justify-center bg-neutral-100 px-4 py-10 sm:px-8 lg:bg-white">
        <div className={cn('w-full', maxWidth)}>
          {/* Mobile wordmark — the brand panel that normally carries it is hidden here. */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Brand imgClassName="h-10" />
          </div>

          {(title || subtitle) && (
            <div className="mb-7">
              {title && (
                <h1 className="text-[24px] font-semibold leading-tight text-neutral-900">{title}</h1>
              )}
              {subtitle && (
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{subtitle}</p>
              )}
            </div>
          )}

          {/* On desktop the column is already a clean white field, so the form needs no card
           * around it — a card inside a card is the classic "generic admin template" look. On
           * mobile the page ground is grey, so it becomes a card to stay legible. */}
          <div className="surface rounded-2xl p-5 sm:p-6 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            {children}
          </div>

          {footer && <div className="mt-7 text-center text-sm text-neutral-500">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export default AuthLayout;
