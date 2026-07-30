import { Link } from 'react-router-dom';
import { Button, Icon } from '../components/ui';

/** Rendered outside AppLayout (the /403 route), so it owns its own full-page framing. */
function ForbiddenPage() {
  return (
    <div className="surface-wash flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-md text-center">
        <p
          aria-hidden="true"
          className="pointer-events-none select-none text-[8rem] font-semibold leading-none tracking-tighter text-neutral-900/[0.045] sm:text-[10rem]"
        >
          403
        </p>

        <div className="-mt-12 sm:-mt-16">
          <span className="mb-5 inline-flex size-11 items-center justify-center rounded-2xl bg-white text-warning-600 shadow-sm ring-1 ring-neutral-200">
            <Icon name="shield" size={20} />
          </span>
          <h1 className="text-[22px] font-semibold text-neutral-900">Access denied</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-neutral-500">
            Your account doesn&apos;t have permission to view this page. Contact TravNexa Global if
            you think this is a mistake.
          </p>
          <Button as={Link} to="/" variant="outline" className="mt-7">
            <Icon name="arrow-left" size={15} />
            Back to home
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ForbiddenPage;
