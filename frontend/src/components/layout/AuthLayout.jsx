import { useState } from 'react';
import { Card } from '../ui';
import { cn } from '../../lib/cn';

/** Shared centered shell for every unauthenticated auth screen — logo + card, no app nav. */
function AuthLayout({ title, subtitle, children, footer, maxWidth = 'max-w-sm' }) {
  // Falls back to a text wordmark if /logo.png fails to load.
  const [logoError, setLogoError] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
      <div className={cn('w-full', maxWidth)}>
        <div className="mb-6 flex flex-col items-center gap-2">
          {logoError ? (
            <span className="text-xs font-semibold tracking-widest text-neutral-500">
              TRAVNEXA GLOBAL
            </span>
          ) : (
            <img
              src="/logo.png"
              alt="TravNexa Global"
              className="h-12 w-auto object-contain"
              onError={() => setLogoError(true)}
            />
          )}
        </div>

        <Card>
          {(title || subtitle) && (
            <div className="mb-6 text-center">
              {title && <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>}
              {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
            </div>
          )}
          {children}
        </Card>

        {footer && <div className="mt-6 text-center text-sm text-neutral-500">{footer}</div>}
      </div>
    </div>
  );
}

export default AuthLayout;
