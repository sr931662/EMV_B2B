import { Link } from 'react-router-dom';
import { Button, Icon } from '../components/ui';

/**
 * Rendered outside AppLayout (it's the catch-all route), so it owns its own full-page framing.
 * The oversized ghosted status code gives the page a deliberate look without needing artwork.
 */
function NotFoundPage() {
  return (
    <div className="surface-wash flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-md text-center">
        <p
          aria-hidden="true"
          className="pointer-events-none select-none text-[8rem] font-semibold leading-none tracking-tighter text-neutral-900/[0.045] sm:text-[10rem]"
        >
          404
        </p>

        <div className="-mt-12 sm:-mt-16">
          <span className="mb-5 inline-flex size-11 items-center justify-center rounded-2xl bg-white text-primary-600 shadow-sm ring-1 ring-neutral-200">
            <Icon name="map-pin" size={20} />
          </span>
          <h1 className="text-[22px] font-semibold text-neutral-900">Page not found</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-neutral-500">
            The page you&apos;re looking for doesn&apos;t exist or may have moved.
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

export default NotFoundPage;
